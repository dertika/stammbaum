import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../src/config.ts'
import { fixtureLoader, ModelCache } from '../src/gramps/cache.ts'
import { fixtureImages, ImageCache } from '../src/gramps/images.ts'
import { buildServer } from '../src/server.ts'
import { deriveKey } from '../src/store/crypto.ts'
import { openDb } from '../src/store/db.ts'
import { LinkStore } from '../src/store/links.ts'
import { PresentationStore } from '../src/store/presentations.ts'
import { SettingsStore } from '../src/store/settings.ts'

export const baseConfig: Config = {
  publicUrl: 'https://stammbaum.example', appSecret: 'x'.repeat(32),
  port: 0, host: '127.0.0.1', dataDir: '/nonexistent', staticDir: '/nonexistent', devOpenAccess: false,
  source: 'fixture', fixtureFile: new URL('../fixtures/familie-muster.json', import.meta.url).pathname,
  gramps: { url: '', user: '', password: '' }, cacheTtl: 900, livingYears: 100,
  grampsEditUrl: 'https://gramps.example', adminDevLogin: false,
}

export function testApp(overrides: Partial<Config> = {}) {
  const config = { ...baseConfig, ...overrides }
  const db = openDb(':memory:')
  const services = {
    config,
    cache: new ModelCache(fixtureLoader(config.fixtureFile), 900),
    images: new ImageCache(mkdtempSync(join(tmpdir(), 'sb-')), fixtureImages()),
    links: new LinkStore(db, deriveKey(config.appSecret, 'link-token'), config.publicUrl),
    settings: new SettingsStore(db),
    presentations: new PresentationStore(db),
  }
  return { ...services, app: buildServer(services) }
}

/** Übernimmt die Set-Cookie-Antworten in ein Cookie-Glas (leerer Wert = gelöscht). */
export function applyCookies(jar: Record<string, string>, res: { cookies: { name: string, value: string }[] }) {
  const next = { ...jar }
  for (const c of res.cookies) {
    if (c.value) next[c.name] = c.value
    else delete next[c.name]
  }
  return next
}

/** Öffnet einen Freigabelink (optional mit vorhandenen Cookies) und gibt die neuen Cookies zurück. */
export async function openLink(app: ReturnType<typeof buildServer>, url: string, jar: Record<string, string> = {}) {
  const res = await app.inject({ url: new URL(url).pathname, cookies: jar })
  return { res, cookies: applyCookies(jar, res) }
}

export const tokenOf = (url: string) => new URL(url).pathname.split('/').pop()!
