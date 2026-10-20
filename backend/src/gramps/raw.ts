// Ausschnitt der Gramps-Web-API-Objekte, den das Backend tatsächlich liest.
// Die API liefert mehr Felder; wir fragen nur diese über `keys=` an.

export interface RawDate {
  /** [Tag, Monat, Jahr, Slash] bzw. bei Zeitspannen [Tag, Monat, Jahr, Slash, Tag2, Monat2, Jahr2, Slash2] */
  dateval: (number | boolean)[]
  /** 0 normal, 1 vor, 2 nach, 3 um, 4 Spanne, 5 Zeitraum, 6 nur Text */
  modifier: number
  /** 0 normal, 1 geschätzt, 2 berechnet */
  quality: number
  text?: string
  sortval: number
}

export interface RawSurname {
  surname: string
  primary?: boolean
}

export interface RawName {
  first_name: string
  call?: string
  surname_list: RawSurname[]
}

export interface RawRef {
  ref: string
  private?: boolean
}

export interface RawEventRef extends RawRef {
  role?: string
}

export interface RawMediaRef extends RawRef {
  /** Ausschnitt in Prozent [x1, y1, x2, y2] */
  rect?: number[] | null
}

export interface RawPerson {
  handle: string
  gramps_id: string
  /** 0 weiblich, 1 männlich, 2 unbekannt */
  gender: number
  primary_name: RawName
  event_ref_list: RawEventRef[]
  birth_ref_index: number
  death_ref_index: number
  family_list: string[]
  parent_family_list: string[]
  media_list: RawMediaRef[]
  note_list: string[]
  private: boolean
}

export interface RawFamily {
  handle: string
  father_handle: string | null
  mother_handle: string | null
  child_ref_list: RawRef[]
  event_ref_list: RawEventRef[]
  private: boolean
}

export interface RawEvent {
  handle: string
  /** Englischer Gramps-Typ, z. B. „Birth“, „Death“, „Baptism“ */
  type: string
  date: RawDate | null
  place: string
  description: string
  note_list: string[]
  private: boolean
}

export interface RawPlace {
  handle: string
  name: { value: string }
  placeref_list: RawRef[]
  private: boolean
}

export interface RawNote {
  handle: string
  text: { string: string }
  type: string
  private: boolean
}

export interface RawMedia {
  handle: string
  mime: string
  desc: string
  private: boolean
}

export interface RawDatabase {
  people: RawPerson[]
  families: RawFamily[]
  events: RawEvent[]
  places: RawPlace[]
  notes: RawNote[]
  media: RawMedia[]
  /** Handle der Gramps-Hauptperson, falls gesetzt */
  defaultPerson?: string | null
}
