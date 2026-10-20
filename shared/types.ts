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
}
