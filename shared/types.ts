// Datenformat zwischen Backend und Browser.
// Nur was hier steht, verlässt jemals das Backend – rohe Gramps-Objekte nie.

export type Gender = 'M' | 'F' | 'U'

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
