import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import { fixtureLoader, ModelCache } from '../src/gramps/cache.ts'
import { fixtureImages, ImageCache } from '../src/gramps/images.ts'
import { buildServer } from '../src/server.ts'

const base: Config = {
  port: 0, host: '127.0.0.1', dataDir: '/nonexistent', staticDir: '/nonexistent', devOpenAccess: false,
  source: 'fixture', fixtureFile: new URL('../fixtures/familie-muster.json', import.meta.url).pathname,
  gramps: { url: '', user: '', password: '' }, cacheTtl: 900, livingYears: 100,
}
const services = (config: Config) => ({
  config,
  cache: new ModelCache(fixtureLoader(base.fixtureFile), 900),
  images: new ImageCache(mkdtempSync(join(tmpdir(), 'sb-')), fixtureImages()),
})

describe('GET /api/view/tree', () => {
  it('verweigert ohne Freigabe', async () => {
    const res = await buildServer(services(base)).inject('/api/view/tree')
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('Muster')
  })
  it('liefert den Baum im Entwicklungsmodus', async () => {
    const res = await buildServer(services({ ...base, devOpenAccess: true })).inject('/api/view/tree')
    expect(res.statusCode).toBe(200)
    expect(res.json().people.length).toBe(20)
  })
})

describe('GET /api/view/media', () => {
  const app = buildServer(services({ ...base, devOpenAccess: true }))
  it('liefert freigegebene Profilbilder', async () => {
    const res = await app.inject('/api/view/media/mi0003/portrait')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/svg+xml')
  })
  it('verweigert Bilder lebender Personen und unbekannte Arten', async () => {
    expect((await app.inject('/api/view/media/mi0011/portrait')).statusCode).toBe(404)
    expect((await app.inject('/api/view/media/mi0003/original')).statusCode).toBe(404)
  })
  it('verweigert ohne Freigabe', async () => {
    expect((await buildServer(services(base)).inject('/api/view/media/mi0003/portrait')).statusCode).toBe(401)
  })
})
