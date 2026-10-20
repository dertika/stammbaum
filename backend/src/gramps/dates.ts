import type { RawDate } from './raw.ts'

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function part(day: number, month: number, year: number): string {
  if (!year) return ''
  if (!month) return String(year)
  if (!day) return `${MONTHS[month - 1]} ${year}`
  return `${day}. ${MONTHS[month - 1]} ${year}`
}

/** Formatiert ein Gramps-Datum auf Deutsch, z. B. „um 1850“ oder „3. Mai 1921“. */
export function formatDate(date: RawDate | null | undefined): string | undefined {
  if (!date) return undefined
  if (date.modifier === 6) return date.text || undefined
  const [d1, m1, y1, , d2, m2, y2] = date.dateval as number[]
  const first = part(d1 ?? 0, m1 ?? 0, y1 ?? 0)
  if (!first) return date.text || undefined

  let text: string
  switch (date.modifier) {
    case 1: text = `vor ${first}`; break
    case 2: text = `nach ${first}`; break
    case 3: text = `um ${first}`; break
    case 4: text = `zwischen ${first} und ${part(d2 ?? 0, m2 ?? 0, y2 ?? 0)}`; break
    case 5: text = `von ${first} bis ${part(d2 ?? 0, m2 ?? 0, y2 ?? 0)}`; break
    default: text = first
  }
  if (date.quality === 1) text = `geschätzt ${text}`
  else if (date.quality === 2) text = `errechnet ${text}`
  return text
}

/** Jahr eines Datums oder undefined, falls unbekannt bzw. reiner Text. */
export function dateYear(date: RawDate | null | undefined): number | undefined {
  if (!date || date.modifier === 6) return undefined
  const year = date.dateval[2]
  return typeof year === 'number' && year > 0 ? year : undefined
}
