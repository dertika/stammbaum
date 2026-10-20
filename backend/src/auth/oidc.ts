import * as client from 'openid-client'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { OIDC_COOKIE, readSigned, startSession, writeSigned, ADMIN_COOKIE } from './session.ts'

interface PendingLogin {
  state: string
  nonce: string
  verifier: string
  returnTo: string
}

const safeReturn = (path: unknown) =>
  typeof path === 'string' && path.startsWith('/admin') && !path.startsWith('//') ? path : '/admin'

/** Anmeldung gegen Authelia: Authorization Code Flow mit PKCE, Sitzung als signiertes Cookie. */
export function authRoutes(config: Config) {
  const secure = config.publicUrl.startsWith('https://')
  const redirectUri = `${config.publicUrl}/auth/callback`
  let discovered: Promise<client.Configuration> | null = null

  const oidcConfig = () => {
    const o = config.oidc!
    discovered ??= client.discovery(new URL(o.issuer), o.clientId, undefined, client.ClientSecretBasic(o.clientSecret))
      .catch(err => {
        discovered = null
        throw err
      })
    return discovered
  }

  return async function (app: FastifyInstance) {
    app.get<{ Querystring: { returnTo?: string } }>('/auth/login', async (req, reply) => {
      reply.header('Cache-Control', 'no-store')
      const returnTo = safeReturn(req.query.returnTo)
      if (!config.oidc) {
        if (config.adminDevLogin) {
          startSession(reply, secure, 'dev', 'Entwicklung')
          return reply.redirect(returnTo)
        }
        return reply.code(503).send({ error: 'OIDC ist nicht konfiguriert' })
      }
      const oidc = await oidcConfig()
      const pending: PendingLogin = {
        state: client.randomState(),
        nonce: client.randomNonce(),
        verifier: client.randomPKCECodeVerifier(),
        returnTo,
      }
      // Lax, weil Authelia per Top-Level-Redirect zurückkommt
      writeSigned(reply, OIDC_COOKIE, pending, { secure, sameSite: 'lax', maxAge: 600, path: '/auth' })
      const url = client.buildAuthorizationUrl(oidc, {
        redirect_uri: redirectUri,
        scope: config.oidc.adminGroup ? 'openid profile groups' : 'openid profile',
        state: pending.state,
        nonce: pending.nonce,
        code_challenge: await client.calculatePKCECodeChallenge(pending.verifier),
        code_challenge_method: 'S256',
      })
      return reply.redirect(url.href)
    })

    app.get('/auth/callback', async (req, reply) => {
      reply.header('Cache-Control', 'no-store')
      const pending = readSigned<PendingLogin>(req, OIDC_COOKIE)
      reply.clearCookie(OIDC_COOKIE, { path: '/auth' })
      if (!pending || !config.oidc) return reply.code(400).send({ error: 'Anmeldung abgelaufen – bitte erneut versuchen' })
      try {
        const oidc = await oidcConfig()
        const currentUrl = new URL(req.url, config.publicUrl)
        const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
          pkceCodeVerifier: pending.verifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
        })
        const claims = tokens.claims()!
        // Authelia liefert Gruppen und Namen je nach Konfiguration nur über userinfo
        const info = await client.fetchUserInfo(oidc, tokens.access_token, claims.sub)
        const groups = (info.groups ?? claims.groups ?? []) as string[]
        if (config.oidc.adminGroup && !groups.includes(config.oidc.adminGroup)) {
          req.log.warn({ sub: claims.sub }, 'Anmeldung ohne Admin-Gruppe abgelehnt')
          return reply.code(403).type('text/html').send('<!doctype html><meta charset="utf-8"><title>Kein Zugriff</title><p>Dein Konto hat keinen Zugriff auf den Admin-Bereich.</p>')
        }
        const name = String(info.name ?? info.preferred_username ?? claims.preferred_username ?? claims.sub)
        startSession(reply, secure, claims.sub, name)
        return reply.redirect(pending.returnTo)
      } catch (err) {
        req.log.error({ err }, 'OIDC-Anmeldung fehlgeschlagen')
        return reply.code(400).send({ error: 'Anmeldung fehlgeschlagen' })
      }
    })

    app.post('/auth/logout', async (_req, reply) => {
      reply.clearCookie(ADMIN_COOKIE, { path: '/' })
      return { ok: true }
    })
  }
}
