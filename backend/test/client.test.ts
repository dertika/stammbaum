import { afterEach, describe, expect, it, vi } from 'vitest'
import { GrampsClient } from '../src/gramps/client.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('GrampsClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('meldet sich an, erneuert abgelaufene Tokens genau einmal und wiederholt die Anfrage', async () => {
    const calls: string[] = []
    let valid = 'a1'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      calls.push(`${init?.method ?? 'GET'} ${path} ${auth ?? ''}`)
      if (path === '/api/token/') return json({ access_token: 'a1', refresh_token: 'r1' })
      if (path === '/api/token/refresh/') return json({ access_token: (valid = 'a2') })
      return auth === `Bearer ${valid}` ? json({ ok: path }) : json({}, 401)
    }))
    const c = new GrampsClient('http://gramps', 'u', 'p')
    expect(await c.getJson('/api/x')).toEqual({ ok: '/api/x' })
    valid = 'abgelaufen'
    await Promise.all([c.getJson('/api/a'), c.getJson('/api/b'), c.getJson('/api/c')])
    expect(calls.filter(c => c.startsWith('POST /api/token/refresh/'))).toHaveLength(1)
    expect(calls.filter(c => c.startsWith('POST /api/token/ '))).toHaveLength(1)
  })

  it('meldet sich neu an, wenn auch das Refresh-Token abgelaufen ist', async () => {
    let logins = 0
    let valid = 'a1'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (path === '/api/token/') return json({ access_token: (valid = `a${++logins}`), refresh_token: 'r' })
      if (path === '/api/token/refresh/') return json({}, 401)
      return auth === `Bearer ${valid}` ? json({}) : json({}, 401)
    }))
    const c = new GrampsClient('http://gramps', 'u', 'p')
    await c.getJson('/api/x')
    valid = 'weg'
    await c.getJson('/api/x')
    expect(logins).toBe(2)
  })

  it('wirft bei falschen Zugangsdaten', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    await expect(new GrampsClient('http://gramps', 'u', 'p').getJson('/api/x')).rejects.toThrow(/Login fehlgeschlagen/)
  })
})
