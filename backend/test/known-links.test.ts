import { describe, expect, it } from 'vitest'
import { applyCookies, openLink, testApp, tokenOf } from './helpers.ts'

const json = { 'content-type': 'application/json' }
const input = (label: string, living: 'show' | 'anonymize') =>
  ({ label, living, expiresAt: null, presentationIds: [], startPersonId: null })

async function setup() {
  const t = testApp()
  const anon = t.links.create(input('Familie Huber', 'anonymize'))
  const show = t.links.create(input('Beamer', 'show'))
  let jar = (await openLink(t.app, anon.url)).cookies
  jar = (await openLink(t.app, show.url, jar)).cookies
  const known = async (cookies = jar) => (await t.app.inject({ url: '/api/view/links', cookies })).json()
  const tree = (cookies = jar) => t.app.inject({ url: '/api/view/tree', cookies })
  return { ...t, anon, show, jar, known, tree }
}

describe('Bekannte Links', () => {
  it('merkt sich alle geöffneten Links, der zuletzt geöffnete ist aktiv', async () => {
    const { jar, known, tree, anon, show } = await setup()
    expect(jar.sb_links.split('.')).toEqual([tokenOf(show.url), tokenOf(anon.url)])
    expect(await known()).toEqual([
      { id: show.id, label: 'Beamer', status: 'active', current: true },
      { id: anon.id, label: 'Familie Huber', status: 'active', current: false },
    ])
    expect((await tree()).body).toContain('Peter') // Lebende sichtbar
  })

  it('verrät nie die Tokens', async () => {
    const { known, anon, show } = await setup()
    const body = JSON.stringify(await known())
    expect(body).not.toContain(tokenOf(anon.url))
    expect(body).not.toContain(tokenOf(show.url))
  })

  it('wechselt auf einen anderen bekannten Link', async () => {
    const { app, jar, tree, anon } = await setup()
    const res = await app.inject({ method: 'POST', url: `/api/view/links/${anon.id}/open`, cookies: jar, headers: json, payload: {} })
    expect(res.statusCode).toBe(204)
    const next = applyCookies(jar, res)
    expect((await tree(next)).body).not.toContain('Peter') // jetzt anonymisiert
    // ohne JSON keine Änderung (CSRF-Schutz)
    const form = await app.inject({ method: 'POST', url: `/api/view/links/${anon.id}/open`, cookies: jar, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'x=1' })
    expect(form.statusCode).toBe(415)
  })

  it('fällt bei Widerruf auf den nächsten gültigen Link zurück', async () => {
    const { links, show, anon, tree, known } = await setup()
    links.setRevoked(show.id, true)
    const res = await tree()
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Peter')
    expect(await known()).toEqual([
      { id: show.id, label: 'Beamer', status: 'revoked', current: false },
      { id: anon.id, label: 'Familie Huber', status: 'active', current: true },
    ])
  })

  it('meldet 410, wenn alle bekannten Links ungültig sind, und listet sie weiter', async () => {
    const { app, links, show, anon, tree, known, jar } = await setup()
    links.setRevoked(show.id, true)
    links.setRevoked(anon.id, true)
    expect((await tree()).statusCode).toBe(410)
    expect((await known()).map((k: { status: string }) => k.status)).toEqual(['revoked', 'revoked'])
    const open = await app.inject({ method: 'POST', url: `/api/view/links/${anon.id}/open`, cookies: jar, headers: json, payload: {} })
    expect(open.statusCode).toBe(410)
  })

  it('entfernt Links aus der Liste', async () => {
    const { app, jar, show, anon } = await setup()
    const res = await app.inject({ method: 'DELETE', url: `/api/view/links/${show.id}`, cookies: jar, headers: json, payload: {} })
    expect(res.statusCode).toBe(204)
    const next = applyCookies(jar, res)
    expect(next.sb_links).toBe(tokenOf(anon.url))
    const last = await app.inject({ method: 'DELETE', url: `/api/view/links/${anon.id}`, cookies: next, headers: json, payload: {} })
    expect(applyCookies(next, last).sb_links).toBeUndefined()
  })

  it('räumt gelöschte, unbekannte und kaputte Einträge auf', async () => {
    const { app, links, show, anon, jar } = await setup()
    links.delete(show.id)
    const fake = 'A'.repeat(43)
    const cookies = { sb_links: [jar.sb_links, fake, '<script>', 'kurz'].join('.') }
    const res = await app.inject({ url: '/api/view/links', cookies })
    expect(res.json().map((k: { id: string }) => k.id)).toEqual([anon.id])
    expect(applyCookies(cookies, res).sb_links).toBe(tokenOf(anon.url))
  })

  it('behält höchstens 10 Links', async () => {
    const { app, links } = testApp()
    let jar: Record<string, string> = {}
    for (let i = 0; i < 12; i++) jar = (await openLink(app, links.create(input(`L${i}`, 'show')).url, jar)).cookies
    expect(jar.sb_links.split('.')).toHaveLength(10)
  })

  it('ein ungültiger Link verdrängt die bekannten nicht', async () => {
    const { app, jar } = await setup()
    const { res, cookies } = await openLink(app, 'https://x/s/erfunden', jar)
    expect(res.headers.location).toBe('/?link=ungueltig')
    expect(cookies.sb_links).toBe(jar.sb_links)
  })

  it('übernimmt das frühere Einzel-Cookie', async () => {
    const { app, links } = testApp()
    const old = links.create(input('Alt', 'show'))
    const cookies = { sb_link: tokenOf(old.url) }
    expect((await app.inject({ url: '/api/view/tree', cookies })).statusCode).toBe(200)
    const res = await app.inject({ url: '/api/view/links', cookies })
    expect(res.json()).toEqual([{ id: old.id, label: 'Alt', status: 'active', current: true }])
    const next = applyCookies(cookies, res)
    expect(next).toEqual({ sb_links: tokenOf(old.url) })
  })
})

describe('Admin-Vorschau', () => {
  it('überdeckt die eigenen Links nur vorübergehend', async () => {
    const t = testApp({ devOpenAccess: true, adminDevLogin: true })
    const own = t.links.create(input('Eigener', 'show'))
    const other = t.links.create(input('Fremd', 'anonymize'))
    let jar = (await openLink(t.app, own.url)).cookies
    const login = await t.app.inject('/auth/login')
    jar = applyCookies(jar, login)
    const preview = await t.app.inject({ url: `/api/admin/links/${other.id}/preview`, cookies: jar })
    jar = applyCookies(jar, preview)
    expect(jar.sb_links).toBe(tokenOf(own.url))

    const info = (await t.app.inject({ url: '/api/view/info', cookies: jar })).json()
    expect(info).toMatchObject({ preview: true, linkId: other.id, label: 'Fremd' })
    // in der Liste bleibt der eigene Link der aktuelle
    expect((await t.app.inject({ url: '/api/view/links', cookies: jar })).json()).toEqual([{ id: own.id, label: 'Eigener', status: 'active', current: true }])

    const end = await t.app.inject({ method: 'DELETE', url: '/api/view/preview', cookies: jar, headers: json, payload: {} })
    jar = applyCookies(jar, end)
    expect((await t.app.inject({ url: '/api/view/info', cookies: jar })).json()).toMatchObject({ preview: false, linkId: own.id })
  })
})
