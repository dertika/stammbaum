// Datenformat zwischen Backend und Browser.
// Nur was hier steht, verlässt jemals das Backend – rohe Gramps-Objekte nie.

export type Gender = 'M' | 'F' | 'U'

/** Welche Personendetails beim Klick angezeigt werden (global im Admin-Bereich einstellbar). */
export interface DetailSettings {
  photo: boolean
  dates: boolean
  events: boolean
  places: boolean
  notes: boolean
}

export const DEFAULT_DETAILS: DetailSettings = { photo: true, dates: true, events: true, places: true, notes: true }

export interface LifeEvent {
  /** Formatiertes Datum, z. B. „12. März 1921“ oder „um 1850“ */
  date?: string
  place?: string
}

export interface PersonSummary {
  id: string
  gender: Gender
  /** true, wenn die Person als lebend gilt und für diesen Zugang anonymisiert wurde */
  anonymized?: boolean
  firstName: string
  lastName: string
  birth?: LifeEvent
  death?: LifeEvent
  /** URL des zugeschnittenen Profilbilds (nur wenn freigegeben) */
  photo?: string
  parents: string[]
  spouses: string[]
  children: string[]
}

export interface TreeResponse {
  generatedAt: string
  /** Startperson (Gramps-Hauptperson oder konfigurierte Person) */
  rootId: string | null
  people: PersonSummary[]
}

export interface EventDetail {
  /** Deutsche Bezeichnung, z. B. „Taufe“ */
  label: string
  date?: string
  place?: string
  description?: string
}

export interface MediaDetail {
  url: string
  /** Vorschaubild */
  thumb: string
  description?: string
}

export interface PersonDetails {
  person: PersonSummary
  events: EventDetail[]
  notes: string[]
  media: MediaDetail[]
}

/** Was ein Zugang sehen darf – der Browser nutzt das nur zur Anzeige. */
export interface ViewInfo {
  label?: string
  details: DetailSettings
  presentations: PresentationSummary[]
  /** Standard-Tiefe der Baumansicht */
  ancestryDepth: number
  progenyDepth: number
  /** Admin-Vorschau eines Links aktiv */
  preview: boolean
  /** ID des Links, über den gerade angesehen wird (null: Admin/Entwicklung) */
  linkId: string | null
}

/** Ein Link, den dieser Browser schon geöffnet hat – ohne Token */
export interface KnownLink {
  id: string
  label: string
  status: LinkStatus
  /** gerade aktiv */
  current: boolean
}

export const DEPTH_MIN = 1
export const DEPTH_MAX = 8
export const DEFAULT_DEPTH = 3

/** Einstellungen unter „Anzeige“ im Admin-Bereich */
export interface DisplaySettings {
  details: DetailSettings
  /** Gramps-Handle der globalen Startperson; null = Gramps-Hauptperson */
  startPersonId: string | null
  ancestryDepth: number
  progenyDepth: number
}

export type LivingMode = 'show' | 'anonymize'

export type LinkStatus = 'active' | 'expired' | 'revoked'

/** Freigabelink, wie ihn der Admin-Bereich sieht */
export interface ShareLink {
  id: string
  label: string
  /** Vollständiger Link inkl. Token – nur im Admin-Bereich */
  url: string
  living: LivingMode
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  lastUsedAt: string | null
  useCount: number
  status: LinkStatus
  presentationIds: string[]
  /** Eigene Startperson dieses Links; null = globale Einstellung */
  startPersonId: string | null
}

export interface ShareLinkInput {
  label: string
  living: LivingMode
  /** ISO-Zeitpunkt oder null für unbegrenzt */
  expiresAt: string | null
  /** Präsentationen, die über diesen Link abrufbar sind */
  presentationIds: string[]
  /** Eigene Startperson dieses Links; null = globale Einstellung */
  startPersonId: string | null
}

export interface AdminInfo {
  name: string
  grampsEditUrl: string
  publicUrl: string
}

export interface AdminStatus {
  loadedAt: string | null
  people: number
  error: string | null
  /** Letzter Fehler beim Laden eines Bildes aus Gramps Web */
  imageError: { message: string, at: string } | null
}

/** Eine Station einer Präsentation – wie eine Folie */
export interface Station {
  personId: string
  /** Überschrift; leer = Name der Person */
  title?: string
  text?: string
  /** Generationen Vorfahren/Nachkommen auf dieser Folie */
  ancestry: number
  progeny: number
}

export interface Presentation {
  id: string
  title: string
  stations: Station[]
}

export interface PresentationSummary {
  id: string
  title: string
  stationCount: number
}

export interface AdminPerson {
  id: string
  name: string
  lifespan: string
  private: boolean
}
