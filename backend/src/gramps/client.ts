import type { RawDatabase } from './raw.ts'

interface Tokens {
  access: string
  refresh: string
}

const KEYS = {
  people: 'handle,gramps_id,gender,primary_name,event_ref_list,birth_ref_index,death_ref_index,family_list,parent_family_list,media_list,note_list,private',
  families: 'handle,father_handle,mother_handle,child_ref_list,event_ref_list,private',
  events: 'handle,type,date,place,description,note_list,private',
  places: 'handle,name,placeref_list,private',
  notes: 'handle,text,type,private',
  media: 'handle,mime,desc,checksum,private',
}

/**
 * Minimaler Client für die Gramps-Web-API. Die Zugangsdaten bleiben in
 * dieser Klasse; nach außen gehen nur bereits abgerufene Daten.
 */
export class GrampsClient {
  private tokens: Tokens | null = null
  private login: Promise<Tokens> | null = null

  private readonly baseUrl: string
  private readonly user: string
  private readonly password: string

  constructor(baseUrl: string, user: string, password: string) {
    this.baseUrl = baseUrl
    this.user = user
    this.password = password
  }

  private async authenticate(): Promise<Tokens> {
    const res = await fetch(`${this.baseUrl}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.user, password: this.password }),
    })
    if (!res.ok) throw new Error(`Gramps-Login fehlgeschlagen (HTTP ${res.status})`)
    const body = await res.json() as { access_token: string, refresh_token: string }
    return { access: body.access_token, refresh: body.refresh_token }
  }

  private async refresh(tokens: Tokens): Promise<Tokens> {
    const res = await fetch(`${this.baseUrl}/api/token/refresh/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.refresh}` },
    })
    if (!res.ok) return this.authenticate()
    const body = await res.json() as { access_token: string }
    return { access: body.access_token, refresh: tokens.refresh }
  }

  /** Stellt sicher, dass gleichzeitige Anfragen nur einen Login auslösen. */
  private async getTokens(renew = false): Promise<Tokens> {
    if (this.tokens && !renew) return this.tokens
    if (!this.login) {
      const current = this.tokens
      this.login = (current ? this.refresh(current) : this.authenticate())
        .then(t => (this.tokens = t))
        .finally(() => (this.login = null))
    }
    return this.login
  }

  /** GET mit automatischer Token-Erneuerung bei 401. */
  async get(path: string): Promise<Response> {
    let tokens = await this.getTokens()
    let res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${tokens.access}` } })
    if (res.status === 401) {
      tokens = await this.getTokens(true)
      res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${tokens.access}` } })
    }
    if (!res.ok) throw new Error(`Gramps-API ${path}: HTTP ${res.status}`)
    return res
  }

  async getJson<T>(path: string): Promise<T> {
    return (await this.get(path)).json() as Promise<T>
  }

  async fetchDatabase(): Promise<RawDatabase> {
    const list = <T>(type: keyof typeof KEYS) => this.getJson<T[]>(`/api/${type}/?keys=${KEYS[type]}`)
    const [people, families, events, places, notes, media, metadata] = await Promise.all([
      list<RawDatabase['people'][number]>('people'),
      list<RawDatabase['families'][number]>('families'),
      list<RawDatabase['events'][number]>('events'),
      list<RawDatabase['places'][number]>('places'),
      list<RawDatabase['notes'][number]>('notes'),
      list<RawDatabase['media'][number]>('media'),
      this.getJson<{ default_person?: string }>('/api/metadata/').catch(() => ({ default_person: undefined })),
    ])
    return { people, families, events, places, notes, media, defaultPerson: metadata.default_person ?? null }
  }
}
