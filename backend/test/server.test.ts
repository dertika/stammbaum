import { describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import { fixtureLoader, ModelCache } from '../src/gramps/cache.ts'
import { buildServer } from '../src/server.ts'

const base: Config = {
  port: 0, host: '127.0.0.1', dataDir: '/nonexistent', staticDir: '/nonexistent', devOpenAccess: false,
  source: 'fixture', fixtureFile: new URL('../fixtures/familie-muster.json', import.meta.url).pathname,
  gramps: { url: '', user: '', password: '' }, cacheTtl: 900,
}
const cache = () => new ModelCache(fixtureLoader(base.fixtureFile), 900)

describe('GET /api/view/tree', () => {
  it('verweigert ohne Freigabe', async () => {
    const res = await buildServer(base, cache()).inject('/api/view/tree')
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('Muster')
  })
  it('liefert den Baum im Entwicklungsmodus', async () => {
    const res = await buildServer({ ...base, devOpenAccess: true }, cache()).inject('/api/view/tree')
    expect(res.statusCode).toBe(200)
    expect(res.json().people.length).toBe(19)
  })
})
