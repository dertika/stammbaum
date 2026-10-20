import { join } from 'node:path'
import { loadConfig } from './config.ts'
import { fixtureLoader, ModelCache } from './gramps/cache.ts'
import { GrampsClient } from './gramps/client.ts'
import { fixtureImages, grampsImages, ImageCache } from './gramps/images.ts'
import { buildServer } from './server.ts'
import { deriveKey } from './store/crypto.ts'
import { openDb } from './store/db.ts'
import { LinkStore } from './store/links.ts'
import { SettingsStore } from './store/settings.ts'

const config = loadConfig()

let services
if (config.source === 'fixture') {
  services = { loader: fixtureLoader(config.fixtureFile), fetcher: fixtureImages() }
} else {
  const client = new GrampsClient(config.gramps.url, config.gramps.user, config.gramps.password)
  services = { loader: () => client.fetchDatabase(), fetcher: grampsImages(client) }
}

const cache = new ModelCache(services.loader, config.cacheTtl, (msg, err) => {
  if (err) app.log.error({ err }, msg)
  else app.log.info(msg)
})
const images = new ImageCache(join(config.dataDir, 'cache', 'images'), services.fetcher)
const db = openDb(join(config.dataDir, 'stammbaum.db'))
const links = new LinkStore(db, deriveKey(config.appSecret, 'link-token'), config.publicUrl)
const settings = new SettingsStore(db)
const app = buildServer({ config, cache, images, links, settings })

if (config.devOpenAccess) app.log.warn('DEV_OPEN_ACCESS aktiv – Baum ist ohne Freigabelink abrufbar. Nicht in Produktion verwenden!')

await app.listen({ port: config.port, host: config.host })
// Daten schon beim Start laden, damit die erste Anfrage nicht warten muss
cache.refresh().catch(() => {})
