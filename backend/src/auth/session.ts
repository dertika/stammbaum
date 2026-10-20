import type { FastifyReply, FastifyRequest } from 'fastify'

export const ADMIN_COOKIE = 'sb_admin'
export const OIDC_COOKIE = 'sb_oidc'
const SESSION_HOURS = 12

export interface AdminSession {
  sub: string
  name: string
  exp: number
}

const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

/** Liest ein signiertes JSON-Cookie; null bei fehlender oder falscher Signatur. */
export function readSigned<T>(req: FastifyRequest, name: string): T | null {
  const raw = req.cookies[name]
  if (!raw) return null
  const unsigned = req.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return null
  try {
    return JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function writeSigned(reply: FastifyReply, name: string, value: unknown, opts: { secure: boolean, maxAge: number, sameSite: 'lax' | 'strict', path?: string }) {
  reply.setCookie(name, encode(value), { httpOnly: true, signed: true, path: opts.path ?? '/', secure: opts.secure, sameSite: opts.sameSite, maxAge: opts.maxAge })
}

export function startSession(reply: FastifyReply, secure: boolean, sub: string, name: string) {
  const session: AdminSession = { sub, name, exp: Date.now() + SESSION_HOURS * 3600_000 }
  // Strict: Anfragen von fremden Seiten senden das Cookie nicht mit (CSRF-Schutz)
  writeSigned(reply, ADMIN_COOKIE, session, { secure, sameSite: 'strict', maxAge: SESSION_HOURS * 3600 })
}

export function getSession(req: FastifyRequest): AdminSession | null {
  const s = readSigned<AdminSession>(req, ADMIN_COOKIE)
  return s && s.exp > Date.now() ? s : null
}
