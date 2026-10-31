import { describe, expect, it } from 'vitest'
import { deriveKey } from '../src/store/crypto.ts'
import { openDb } from '../src/store/db.ts'
import { LinkStore } from '../src/store/links.ts'
import { openLink, testApp } from './helpers.ts'

describe('ohne Freigabelink', () => {
  const { app } = testApp()
  it('gibt keine Daten heraus', async () => {
    for (const path of ['/api/view/tree', '/api/view/info', '/api/view/person/pi0003', '/api/view/media/mi0003/portrait']) {
      const res = await app.inject(path)
      expect(res.statusCode, path).toBe(401)
      expect(res.body).not.toContain('Muster')
    }
  })
  it('liefert im Entwicklungsmodus den Baum', async () => {
    const res = await testApp({ devOpenAccess: true }).app.inject('/api/view/tree')
    expect(res.statusCode).toBe(200)
    expect(res.json().people.length).toBe(20)
  })
})

describe('Freigabelink', () => {
  it('setzt beim Öffnen ein HttpOnly-Cookie und leitet ohne Token weiter', async () => {
    const { app, links } = testApp()
    const link = links.create({ label: 'Oma', living: 'anonymize', expiresAt: null, presentationIds: [], startPersonId: null })
    expect(link.url).toMatch(/^https:\/\/stammbaum\.example\/s\/[\w-]{43}$/)
    const { res } = await openLink(app, link.url)
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
    const cookie = res.cookies.find(c => c.name === 'sb_links')!
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    expect(links.get(link.id)!.useCount).toBe(1)
  })

  it('anonymisiert Lebende je nach Link-Einstellung', async () => {
    const { app, links } = testApp()
    const anon = await openLink(app, links.create({ label: 'A', living: 'anonymize', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    const show = await openLink(app, links.create({ label: 'B', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    const a = await app.inject({ url: '/api/view/tree', cookies: anon.cookies })
    const b = await app.inject({ url: '/api/view/tree', cookies: show.cookies })
    expect(a.body).not.toContain('Peter')
    expect(b.body).toContain('Peter')
    expect((await app.inject({ url: '/api/view/media/mi0011/portrait', cookies: anon.cookies })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/view/media/mi0011/portrait', cookies: show.cookies })).statusCode).toBe(200)
  })

  it('wirkt bei Widerruf sofort', async () => {
    const { app, links } = testApp()
    const link = links.create({ label: 'C', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null })
    const { cookies } = await openLink(app, link.url)
    expect((await app.inject({ url: '/api/view/tree', cookies })).statusCode).toBe(200)
    links.setRevoked(link.id, true)
    const res = await app.inject({ url: '/api/view/tree', cookies })
    expect(res.statusCode).toBe(410)
    expect(res.body).not.toContain('Muster')
    expect((await app.inject({ url: '/api/view/media/mi0003/portrait', cookies })).statusCode).toBe(410)
    const again = await openLink(app, link.url)
    expect(again.res.headers.location).toBe('/?link=abgelaufen')
  })

  it('verweigert abgelaufene Links', async () => {
    const { app, links } = testApp()
    const link = links.create({ label: 'D', living: 'show', expiresAt: new Date(Date.now() - 1000).toISOString(), presentationIds: [], startPersonId: null })
    const { res } = await openLink(app, link.url)
    expect(res.headers.location).toBe('/?link=abgelaufen')
    expect((await app.inject({ url: '/api/view/tree', cookies: { sb_link: new URL(link.url).pathname.slice(3) } })).statusCode).toBe(410)
  })

  it('verweigert unbekannte Tokens', async () => {
    const { app } = testApp()
    expect((await app.inject('/s/erfunden')).headers.location).toBe('/?link=ungueltig')
    expect((await app.inject({ url: '/api/view/tree', cookies: { sb_link: 'erfunden' } })).statusCode).toBe(401)
  })

  it('respektiert die globalen Detail-Einstellungen', async () => {
    const { app, links, settings } = testApp()
    const { cookies } = await openLink(app, links.create({ label: 'E', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    settings.setDetails({ photo: false, dates: true, events: false, places: false, notes: false })
    const tree = await app.inject({ url: '/api/view/tree', cookies })
    expect(tree.body).not.toContain('photo')
    expect(tree.body).not.toContain('Oberdorf')
    const person = (await app.inject({ url: '/api/view/person/pi0008', cookies })).json()
    expect(person).toMatchObject({ events: [], notes: [], media: [] })
    expect((await app.inject({ url: '/api/view/media/mi0003/portrait', cookies })).statusCode).toBe(404)
  })
})

describe('LinkStore', () => {
  it('speichert das Token nur verschlüsselt und als Hash', () => {
    const { links } = testApp()
    const link = links.create({ label: 'F', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null })
    const token = new URL(link.url).pathname.slice(3)
    const db = (links as unknown as { db: { prepare: (s: string) => { all: () => unknown[] } } }).db
    expect(JSON.stringify(db.prepare('SELECT * FROM links').all())).not.toContain(token)
  })
  it('zeigt den Link bei falschem Secret nicht an', () => {
    const db = openDb(':memory:')
    const a = new LinkStore(db, deriveKey('a'.repeat(32), 'link-token'), 'https://x')
    const link = a.create({ label: 'G', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null })
    const b = new LinkStore(db, deriveKey('b'.repeat(32), 'link-token'), 'https://x')
    expect(b.get(link.id)!.url).toBe('')
  })
})

describe('Startperson und Tiefe', () => {
  it('Link-Startperson hat Vorrang vor der globalen', async () => {
    const { app, links, settings } = testApp()
    settings.setStartPerson('pi0003')
    const plain = await openLink(app, links.create({ label: 'A', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    const own = await openLink(app, links.create({ label: 'B', living: 'show', expiresAt: null, presentationIds: [], startPersonId: 'pi0017' }).url)
    expect((await app.inject({ url: '/api/view/tree', cookies: plain.cookies })).json().rootId).toBe('pi0003')
    expect((await app.inject({ url: '/api/view/tree', cookies: own.cookies })).json().rootId).toBe('pi0017')
  })
  it('liefert die Standard-Tiefe mit', async () => {
    const { app, links, settings } = testApp()
    const { cookies } = await openLink(app, links.create({ label: 'A', living: 'show', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    expect((await app.inject({ url: '/api/view/info', cookies })).json()).toMatchObject({ ancestryDepth: 3, progenyDepth: 3 })
    settings.setDepth({ ancestryDepth: 4, progenyDepth: 2 })
    expect((await app.inject({ url: '/api/view/info', cookies })).json()).toMatchObject({ ancestryDepth: 4, progenyDepth: 2 })
  })
})

describe('Migration', () => {
  it('hebt eine Datenbank mit Version 2 ohne Datenverlust an', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { DatabaseSync } = await import('node:sqlite')
    const file = join(mkdtempSync(join(tmpdir(), 'sb-mig-')), 'db.sqlite')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE links (id TEXT PRIMARY KEY, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, token_enc TEXT NOT NULL,
      living TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL, last_used_at TEXT, use_count INTEGER NOT NULL DEFAULT 0,
      presentation_ids TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE presentations (id TEXT PRIMARY KEY, title TEXT NOT NULL, stations TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO links (id, label, token_hash, token_enc, living, created_at) VALUES ('l1', 'Alt', 'h', 'e', 'show', '2026-01-01');
      PRAGMA user_version = 2;`)
    old.close()
    const db = openDb(file)
    expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 })
    expect(db.prepare('SELECT label, start_person FROM links').get()).toMatchObject({ label: 'Alt', start_person: null })
  })
})

describe('GET /api/view/media', () => {
  it('liefert freigegebene Profilbilder als JPEG mit Sandbox-CSP', async () => {
    const { app, links } = testApp()
    const { cookies } = await openLink(app, links.create({ label: 'A', living: 'anonymize', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    const res = await app.inject({ url: '/api/view/media/mi0003/portrait', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(res.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    // Lebende (anonymisiert) und unbekannte Arten bleiben gesperrt
    expect((await app.inject({ url: '/api/view/media/mi0011/portrait', cookies })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/view/media/mi0003/original', cookies })).statusCode).toBe(404)
  })
})
