import { describe, expect, it } from 'vitest'
import { validatePresentation } from '../src/store/presentations.ts'
import { openLink, testApp } from './helpers.ts'

const stations = [
  { personId: 'pi0001', title: 'Der Schmied', text: 'Johann gründete die Werkstatt.', ancestry: 1, progeny: 1 },
  { personId: 'pi0011', ancestry: 1, progeny: 1 }, // lebend
  { personId: 'pi0015', ancestry: 1, progeny: 1 }, // privat
  { personId: 'pi0003', ancestry: 2, progeny: 2 },
]

describe('Präsentationen', () => {
  it('sind nur über zugeordnete Links abrufbar', async () => {
    const { app, links, presentations } = testApp()
    const p = presentations.create(validatePresentation({ title: 'Familienfest', stations }))
    const other = presentations.create(validatePresentation({ title: 'Geheim', stations }))
    const { cookies } = await openLink(app, links.create({ label: 'X', living: 'anonymize', expiresAt: null, presentationIds: [p.id] }).url)

    const info = (await app.inject({ url: '/api/view/info', cookies })).json()
    expect(info.presentations).toEqual([{ id: p.id, title: 'Familienfest', stationCount: 2 }])
    expect((await app.inject({ url: `/api/view/presentations/${other.id}`, cookies })).statusCode).toBe(404)

    const res = (await app.inject({ url: `/api/view/presentations/${p.id}`, cookies })).json()
    // Stationen zu lebenden (anonymisierten) und privaten Personen fallen weg
    expect(res.stations.map((s: { personId: string }) => s.personId)).toEqual(['pi0001', 'pi0003'])
    expect(res.stations[0]).toMatchObject({ title: 'Der Schmied', text: 'Johann gründete die Werkstatt.' })
  })

  it('zeigt Stationen Lebender bei Links mit sichtbaren Lebenden', async () => {
    const { app, links, presentations } = testApp()
    const p = presentations.create(validatePresentation({ title: 'F', stations }))
    const { cookies } = await openLink(app, links.create({ label: 'X', living: 'show', expiresAt: null, presentationIds: [p.id] }).url)
    const res = (await app.inject({ url: `/api/view/presentations/${p.id}`, cookies })).json()
    expect(res.stations.map((s: { personId: string }) => s.personId)).toEqual(['pi0001', 'pi0011', 'pi0003'])
  })

  it('prüft Eingaben', () => {
    expect(() => validatePresentation({ title: '', stations: [] })).toThrow()
    expect(() => validatePresentation({ title: 'x', stations: [{}] })).toThrow(/Person fehlt/)
    expect(validatePresentation({ title: ' x ', stations: [{ personId: 'a', ancestry: 99, title: '  ' }] }))
      .toEqual({ title: 'x', stations: [{ personId: 'a', title: undefined, text: undefined, ancestry: 1, progeny: 1 }] })
  })

  it('lassen sich im Admin-Bereich verwalten', async () => {
    const { app } = testApp({ devOpenAccess: true, adminDevLogin: true })
    const login = await app.inject('/auth/login')
    const cookies = { sb_admin: login.cookies.find(c => c.name === 'sb_admin')!.value }
    const headers = { 'content-type': 'application/json' }
    const created = await app.inject({ method: 'POST', url: '/api/admin/presentations', cookies, headers, payload: { title: 'Ahnen', stations } })
    expect(created.statusCode).toBe(201)
    const id = created.json().id
    const updated = await app.inject({ method: 'PUT', url: `/api/admin/presentations/${id}`, cookies, headers, payload: { title: 'Ahnen 2', stations: stations.slice(0, 1) } })
    expect(updated.json()).toMatchObject({ title: 'Ahnen 2', stations: [{ personId: 'pi0001' }] })
    const people = (await app.inject({ url: '/api/admin/people', cookies })).json()
    expect(people.find((p: { id: string }) => p.id === 'pi0015')).toMatchObject({ name: 'Julia Muster', private: true })
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/presentations/${id}`, cookies, headers, payload: {} })).statusCode).toBe(200)
  })
})
