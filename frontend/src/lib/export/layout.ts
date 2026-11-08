// Reine Rechenfunktionen für den PDF-Export (ohne Browser testbar)

export type PaperFormat = 'a4' | 'a3' | 'a2' | 'a1' | 'a0'
export type Orientation = 'portrait' | 'landscape'

export const PAPER_FORMATS: { value: PaperFormat, label: string }[] = [
  { value: 'a4', label: 'A4 (21 × 29,7 cm)' },
  { value: 'a3', label: 'A3 (29,7 × 42 cm)' },
  { value: 'a2', label: 'A2 (42 × 59,4 cm)' },
  { value: 'a1', label: 'A1 (59,4 × 84,1 cm)' },
  { value: 'a0', label: 'A0 (84,1 × 118,9 cm)' },
]

/** Hochformat-Maße in mm */
const PAPER_MM: Record<PaperFormat, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  a1: [594, 841],
  a0: [841, 1189],
}

/** Querformat, wenn der Inhalt breiter als hoch ist, sonst Hochformat. */
export function chooseOrientation(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait'
}

export function pageSize(format: PaperFormat, orientation: Orientation): { width: number, height: number } {
  const [w, h] = PAPER_MM[format]
  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

/**
 * Platziert einen Inhalt der Größe width×height mittig in einem Rahmen,
 * so groß wie möglich ohne Verzerrung.
 */
export function fitInto(width: number, height: number, box: { x: number, y: number, width: number, height: number }) {
  const scale = Math.min(box.width / width, box.height / height)
  const w = width * scale
  const h = height * scale
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h, scale }
}

/** Kürzt einen Text mit „…“, bis er in maxWidth passt (Breite über die übergebene Messfunktion). */
export function truncate(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  // Binärsuche nach der längsten Länge, die mit „…“ noch passt
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo ? `${text.slice(0, lo).trimEnd()}…` : '…'
}

/** Dateiname wie „Stammbaum-Georg-Muster-2026-11-08.pdf“ */
export function pdfFileName(title: string, date = new Date()): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${slug || 'Stammbaum'}-${day}.pdf`
}

/** Ausdehnung von Karten (Mittelpunkte) und Linien (Punktlisten) in Layout-Koordinaten */
export function contentBounds(
  cards: { x: number, y: number }[],
  cardW: number,
  cardH: number,
  linePoints: [number, number][],
  margin = 12,
) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cards) {
    minX = Math.min(minX, c.x - cardW / 2)
    maxX = Math.max(maxX, c.x + cardW / 2)
    minY = Math.min(minY, c.y - cardH / 2)
    maxY = Math.max(maxY, c.y + cardH / 2)
  }
  for (const [x, y] of linePoints) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX - margin, y: minY - margin, width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin }
}

/** Schriftgröße des Namens auf der Karte (Layout-Einheiten) */
export const NAME_SIZE = 12.5

/** Rand und Kopfzeile auf der Seite (mm) */
export const PAGE_MARGIN = 10
export const HEADER_HEIGHT = 12

/** Fläche für den Baum auf der Seite */
export function contentBox(format: PaperFormat, orientation: Orientation) {
  const page = pageSize(format, orientation)
  return {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN + HEADER_HEIGHT,
    width: page.width - 2 * PAGE_MARGIN,
    height: page.height - 2 * PAGE_MARGIN - HEADER_HEIGHT,
  }
}

/**
 * Wie groß Schrift der Größe `fontSize` (in Layout-Einheiten) gedruckt wird, in Punkt.
 * Unter etwa 5 pt wird es schwer lesbar.
 */
export function printedFontPt(bounds: { width: number, height: number }, format: PaperFormat, fontSize: number): number {
  const orientation = chooseOrientation(bounds.width, bounds.height)
  const { scale } = fitInto(bounds.width, bounds.height, contentBox(format, orientation))
  return (fontSize * scale * 72) / 25.4
}

/** Kleinstes Format, auf dem die Schrift mindestens minPt groß ist (sonst das größte). */
export function recommendFormat(bounds: { width: number, height: number }, fontSize: number, minPt = 6): PaperFormat {
  return PAPER_FORMATS.find(f => printedFontPt(bounds, f.value, fontSize) >= minPt)?.value ?? 'a0'
}
