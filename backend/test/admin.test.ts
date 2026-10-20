import { describe, expect, it } from 'vitest'
import { openLink, testApp } from './helpers.ts'

async function login(app: ReturnType<typeof testApp>['app']) {
  const res = await app.inject('/auth/login?returnTo=/admin/links')
  expect(res.statusCode).toBe(302)
  expect(res.headers.location).toBe('/admin/links')
  const c = res.cookies.find(c => c.name === 'sb_admin')!
  expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict' })
  return { sb_admin: c.value }
}

const json = { 'content-type': 'application/json' }

describe('Admin-Bereich', () => {
  it('ist ohne Anmeldung gesperrt', async () => {
    const { app } = testApp()
    for (const url of ['/api/admin/me', '/api/admin/links', '/api/admin/settings']) {
      expect((await app.inject(url)).statusCode, url).toBe(401)
    }
    expect((await app.inject({ method: 'POST', url: '/api/admin/links', headers: json, payload: {} })).statusCode).toBe(401)
    // ohne OIDC und ohne Entwicklungs-Login gibt es keine Anmeldung
    expect((await app.inject('/auth/login')).statusCode).toBe(503)
  })

  it('akzeptiert keine gefälschten Sitzungs-Cookies', async () => {
    const { app } = testApp()
    const forged = Buffer.from(JSON.stringify({ sub: 'x', name: 'x', exp: Date.now() + 1e9 })).toString('base64url')
    expect((await app.inject({ url: '/api/admin/me', cookies: { sb_admin: forged } })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/admin/me', cookies: { sb_admin: `${forged}.abc` } })).statusCode).toBe(401)
  })

  it('leitet nur auf /admin-Pfade zurück', async () => {
    const { app } = testApp({ devOpenAccess: true, adminDevLogin: true })
    expect((await app.inject('/auth/login?returnTo=https://evil.example')).headers.location).toBe('/admin')
    expect((await app.inject('/auth/login?returnTo=//evil.example')).headers.location).toBe('/admin')
  })

  it('verwaltet Links und Einstellungen', async () => {
    const { app } = testApp({ devOpenAccess: true, adminDevLogin: true })
    const cookies = await login(app)
    expect((await app.inject({ url: '/api/admin/me', cookies })).json()).toMatchObject({ name: 'Entwicklung', grampsEditUrl: 'https://gramps.example' })

    const created = await app.inject({ method: 'POST', url: '/api/admin/links', cookies, headers: json, payload: { label: 'Tante Erna', living: 'anonymize', expiresAt: '2030-01-01' } })
    expect(created.statusCode).toBe(201)
    const link = created.json()
    expect(link).toMatchObject({ label: 'Tante Erna', living: 'anonymize', expiresAt: '2030-01-01T00:00:00.000Z', status: 'active' })

    const invalid = await app.inject({ method: 'POST', url: '/api/admin/links', cookies, headers: json, payload: { label: '', living: 'x' } })
    expect(invalid.statusCode).toBe(400)

    const updated = await app.inject({ method: 'PUT', url: `/api/admin/links/${link.id}`, cookies, headers: json, payload: { label: 'Erna', living: 'show', expiresAt: null } })
    expect(updated.json()).toMatchObject({ label: 'Erna', living: 'show', expiresAt: null, url: link.url })

    const revoked = await app.inject({ method: 'POST', url: `/api/admin/links/${link.id}/revoke`, cookies, headers: json, payload: { revoked: true } })
    expect(revoked.json().status).toBe('revoked')

    const list = await app.inject({ url: '/api/admin/links', cookies })
    expect(list.json()).toHaveLength(1)

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/links/${link.id}`, cookies, headers: json, payload: {} })
    expect(del.statusCode).toBe(200)
    expect((await app.inject({ url: '/api/admin/links', cookies })).json()).toHaveLength(0)

    const settings = await app.inject({ method: 'PUT', url: '/api/admin/settings', cookies, headers: json, payload: { details: { photo: false, dates: true, events: true, places: true, notes: false, extra: 1 } } })
    expect(settings.json()).toEqual({ details: { photo: false, dates: true, events: true, places: true, notes: false } })
  })

  it('verlangt JSON bei ändernden Anfragen (CSRF-Schutz)', async () => {
    const { app } = testApp({ devOpenAccess: true, adminDevLogin: true })
    const cookies = await login(app)
    const res = await app.inject({ method: 'POST', url: '/api/admin/links', cookies, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'label=x&living=show' })
    expect(res.statusCode).toBe(415)
  })

  it('zeigt die Vorschau eines Links', async () => {
    const { app, links } = testApp({ devOpenAccess: true, adminDevLogin: true })
    const cookies = await login(app)
    const link = links.create({ label: 'Vorschau', living: 'anonymize', expiresAt: null, presentationIds: [] })
    const res = await app.inject({ url: `/api/admin/links/${link.id}/preview`, cookies })
    expect(res.statusCode).toBe(302)
    const viewCookie = res.cookies.find(c => c.name === 'sb_link')!
    const { cookies: expected } = await openLink(app, link.url)
    expect(viewCookie.value).toBe(expected.sb_link)
  })
})

describe('Ansicht für Admins', () => {
  it('zeigt angemeldeten Admins den vollständigen Baum', async () => {
    const { app } = testApp({ adminDevLogin: true, devOpenAccess: true })
    const cookies = await login(app)
    // ohne Entwicklungsmodus, aber mit derselben Sitzung (gleiches Secret)
    const prod = testApp()
    const res = await prod.app.inject({ url: '/api/view/tree', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Peter')
  })
})
