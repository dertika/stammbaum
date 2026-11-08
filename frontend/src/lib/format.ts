import type { PersonSummary } from '../../../shared/types.ts'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function fullName(p: PersonSummary): string {
  if (p.anonymized) return 'Lebende Person'
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unbekannt'
}

function year(date?: string): string | undefined {
  return date?.match(/\d{3,4}/)?.[0]
}

/** Jahr eines formatierten Datums als Zahl, z. B. „um 1850“ → 1850 */
export function yearOf(date?: string): number | undefined {
  const y = year(date)
  return y ? Number(y) : undefined
}

/** Für die Suche: klein, ohne Akzente („Müller“ findet auch „muller“) */
export function normalize(s: string): string {
  return s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Kurzform der Lebensdaten für Karten, z. B. „* 1899 – † 1972“. */
export function lifespan(p: PersonSummary): string {
  const b = year(p.birth?.date)
  const d = year(p.death?.date)
  if (b && d) return `${b} – ${d}`
  if (b) return `* ${b}`
  if (d) return `† ${d}`
  return ''
}

export function initials(p: PersonSummary): string {
  if (p.anonymized) return '?'
  return ((p.firstName[0] ?? '') + (p.lastName[0] ?? '')).toUpperCase() || '?'
}
