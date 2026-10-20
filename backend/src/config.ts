import { readFileSync } from 'node:fs'

/** Liest eine Variable direkt oder aus einer Datei (`NAME_FILE`, z. B. /run/secrets/…). */
function env(name: string, fallback?: string): string | undefined {
  const file = process.env[`${name}_FILE`]
  if (file) return readFileSync(file, 'utf8').trim()
  const value = process.env[name]
  return value !== undefined && value !== '' ? value : fallback
}

function required(name: string): string {
  const value = env(name)
  if (value === undefined) throw new Error(`Umgebungsvariable ${name} fehlt`)
  return value
}

function int(name: string, fallback: number): number {
  const raw = env(name)
  if (raw === undefined) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) throw new Error(`${name} muss eine Zahl sein`)
  return n
}

export type GrampsSource = 'api' | 'fixture'

export interface Config {
  /** Öffentliche Adresse des Dashboards, z. B. https://stammbaum.dertika.de */
  publicUrl: string
  /** Geheimnis für Verschlüsselung der Link-Tokens und Signatur der Sitzungen */
  appSecret: string
  port: number
  host: string
  dataDir: string
  staticDir: string
  /** Nur für die lokale Entwicklung: Baum ohne Freigabelink abrufbar */
  devOpenAccess: boolean
  source: GrampsSource
  fixtureFile: string
  gramps: {
    url: string
    user: string
    password: string
  }
  /** Sekunden, bis der Snapshot im Hintergrund neu geladen wird */
  cacheTtl: number
  /** Gramps-ID der Startperson, falls nicht die Gramps-Hauptperson genommen werden soll */
  rootPerson?: string
  /** Ohne Todesangabe gilt als lebend, wer jünger als so viele Jahre ist */
  livingYears: number
  /** Ziel des Buttons „Stammbaum bearbeiten“ */
  grampsEditUrl: string
  /** OIDC-Anmeldung für /admin (Authelia); fehlt sie, ist der Admin-Bereich gesperrt */
  oidc?: {
    issuer: string
    clientId: string
    clientSecret: string
    /** Optional: nur Mitglieder dieser Gruppe dürfen in den Admin-Bereich */
    adminGroup?: string
  }
  /** Nur lokal: Admin-Bereich ohne OIDC (erfordert DEV_OPEN_ACCESS) */
  adminDevLogin: boolean
}

export function loadConfig(): Config {
  const source = (env('GRAMPS_SOURCE', 'api') as GrampsSource)
  const isApi = source === 'api'
  const appSecret = required('APP_SECRET')
  if (appSecret.length < 32) throw new Error('APP_SECRET muss mindestens 32 Zeichen lang sein')
  return {
    publicUrl: env('PUBLIC_URL', 'http://localhost:8080')!.replace(/\/+$/, ''),
    appSecret,
    port: int('PORT', 8080),
    host: env('HOST', '0.0.0.0')!,
    dataDir: env('DATA_DIR', './data')!,
    staticDir: env('STATIC_DIR', new URL('../../frontend/dist', import.meta.url).pathname)!,
    devOpenAccess: env('DEV_OPEN_ACCESS') === '1',
    source,
    fixtureFile: env('FIXTURE_FILE', new URL('../fixtures/familie-muster.json', import.meta.url).pathname)!,
    gramps: {
      url: isApi ? required('GRAMPS_API_URL').replace(/\/+$/, '') : '',
      user: isApi ? required('GRAMPS_USER') : '',
      password: isApi ? required('GRAMPS_PASSWORD') : '',
    },
    cacheTtl: int('CACHE_TTL', 900),
    rootPerson: env('ROOT_PERSON'),
    livingYears: int('LIVING_YEARS', 100),
    grampsEditUrl: env('GRAMPS_EDIT_URL', 'https://stammbaum-admin.dertika.de')!,
    oidc: env('OIDC_ISSUER')
      ? {
          issuer: required('OIDC_ISSUER'),
          clientId: required('OIDC_CLIENT_ID'),
          clientSecret: required('OIDC_CLIENT_SECRET'),
          adminGroup: env('OIDC_ADMIN_GROUP'),
        }
      : undefined,
    adminDevLogin: env('DEV_OPEN_ACCESS') === '1' && env('ADMIN_DEV_LOGIN') === '1',
  }
}
