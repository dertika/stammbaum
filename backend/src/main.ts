import { loadConfig } from './config.ts'
import { fixtureLoader, ModelCache } from './gramps/cache.ts'
import { GrampsClient } from './gramps/client.ts'
import { buildServer } from './server.ts'

const config = loadConfig()

const loader = config.source === 'fixture'
  ? fixtureLoader(config.fixtureFile)
  : (() => {
      const client = new GrampsClient(config.gramps.url, config.gramps.user, config.gramps.password)
      return () => client.fetchDatabase()
    })()

const app = buildServer(config, new ModelCache(loader, config.cacheTtl, (msg, err) => {
  if (err) app.log.error({ err }, msg)
  else app.log.info(msg)
}))

if (config.devOpenAccess) app.log.warn('DEV_OPEN_ACCESS aktiv – Baum ist ohne Freigabelink abrufbar. Nicht in Produktion verwenden!')

await app.listen({ port: config.port, host: config.host })
