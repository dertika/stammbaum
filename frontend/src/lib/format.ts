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
