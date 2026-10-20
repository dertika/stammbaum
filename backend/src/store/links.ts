import { randomUUID } from 'node:crypto'
import type { LinkStatus, LivingMode, ShareLink, ShareLinkInput } from '../../../shared/types.ts'
import { decrypt, encrypt, hashToken, newToken } from './crypto.ts'
import type { Db } from './db.ts'

interface Row {
  id: string
  label: string
  token_hash: string
  token_enc: string
  living: LivingMode
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  last_used_at: string | null
  use_count: number
}

/** Ergebnis der Prüfung eines Tokens */
export type LinkCheck =
  | { status: 'active', link: Row }
  | { status: 'expired' | 'revoked' }
  | { status: 'unknown' }

function status(row: Row, now: Date): LinkStatus {
  if (row.revoked_at) return 'revoked'
  if (row.expires_at && new Date(row.expires_at) <= now) return 'expired'
  return 'active'
}

export function validateInput(input: unknown): ShareLinkInput {
  const i = input as Partial<ShareLinkInput> | null
  const label = typeof i?.label === 'string' ? i.label.trim() : ''
  if (!label || label.length > 120) throw new Error('Bitte eine Bezeichnung mit höchstens 120 Zeichen angeben')
  if (i?.living !== 'show' && i?.living !== 'anonymize') throw new Error('Ungültige Einstellung für lebende Personen')
  let expiresAt: string | null = null
  if (i.expiresAt) {
    const d = new Date(i.expiresAt)
    if (Number.isNaN(d.getTime())) throw new Error('Ungültiges Ablaufdatum')
    expiresAt = d.toISOString()
  }
  return { label, living: i.living, expiresAt }
}

/**
 * Freigabelinks. Gesucht wird über den SHA-256-Hash des Tokens; das Token
 * selbst liegt zusätzlich AES-GCM-verschlüsselt vor, damit der Admin-Bereich
 * den Link später erneut anzeigen kann.
 */
export class LinkStore {
  private readonly db: Db
  private readonly key: Buffer
  private readonly publicUrl: string

  constructor(db: Db, key: Buffer, publicUrl: string) {
    this.db = db
    this.key = key
    this.publicUrl = publicUrl.replace(/\/+$/, '')
  }

  private toDto(row: Row, now = new Date()): ShareLink {
    let url = ''
    try {
      url = `${this.publicUrl}/s/${decrypt(this.key, row.token_enc)}`
    } catch {
      // z. B. nach einem Wechsel des APP_SECRET – der Link funktioniert dann nicht mehr
    }
    return {
      id: row.id,
      label: row.label,
      url,
      living: row.living,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count,
      status: status(row, now),
    }
  }

  list(): ShareLink[] {
    const rows = this.db.prepare('SELECT * FROM links ORDER BY created_at DESC').all() as unknown as Row[]
    return rows.map(r => this.toDto(r))
  }

  get(id: string): ShareLink | null {
    const row = this.db.prepare('SELECT * FROM links WHERE id = ?').get(id) as unknown as Row | undefined
    return row ? this.toDto(row) : null
  }

  create(input: ShareLinkInput): ShareLink {
    const token = newToken()
    const id = randomUUID()
    this.db.prepare(`INSERT INTO links (id, label, token_hash, token_enc, living, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.label, hashToken(token), encrypt(this.key, token), input.living, input.expiresAt, new Date().toISOString())
    return this.get(id)!
  }

  update(id: string, input: ShareLinkInput): ShareLink | null {
    this.db.prepare('UPDATE links SET label = ?, living = ?, expires_at = ? WHERE id = ?')
      .run(input.label, input.living, input.expiresAt, id)
    return this.get(id)
  }

  /** Widerrufen bzw. wieder aktivieren */
  setRevoked(id: string, revoked: boolean): ShareLink | null {
    this.db.prepare('UPDATE links SET revoked_at = ? WHERE id = ?').run(revoked ? new Date().toISOString() : null, id)
    return this.get(id)
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM links WHERE id = ?').run(id).changes) > 0
  }

  check(token: string | undefined, now = new Date()): LinkCheck {
    if (!token || token.length > 100) return { status: 'unknown' }
    const row = this.db.prepare('SELECT * FROM links WHERE token_hash = ?').get(hashToken(token)) as unknown as Row | undefined
    if (!row) return { status: 'unknown' }
    const s = status(row, now)
    return s === 'active' ? { status: s, link: row } : { status: s }
  }

  /** Zählt Aufrufe über /s/<token> (nicht jede API-Anfrage) */
  touch(id: string) {
    this.db.prepare('UPDATE links SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?').run(new Date().toISOString(), id)
  }
}
