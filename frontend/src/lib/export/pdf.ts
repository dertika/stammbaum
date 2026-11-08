import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { PersonSummary } from '../../../../shared/types.ts'
import { fullName, initials } from '../format.ts'
import boldUrl from './fonts/NotoSans-Bold.ttf?url'
import regularUrl from './fonts/NotoSans-Regular.ttf?url'
import {
  chooseOrientation, contentBounds, contentBox, fitInto, NAME_SIZE, PAGE_MARGIN, pageSize, pdfFileName, truncate,
  type PaperFormat,
} from './layout.ts'

/** Eine Karte im Baum: Mittelpunkt in Layout-Koordinaten */
export interface PrintCard {
  person: PersonSummary
  x: number
  y: number
}

export interface TreeExport {
  title: string
  cards: PrintCard[]
  /** Kartengröße in Layout-Einheiten – so groß, wie der Platz im Layout es zulässt */
  cardW: number
  cardH: number
  /** Linien als SVG-Pfade in denselben Koordinaten */
  links: string[]
  /** Punkte der Linien, damit sie bei der Ausdehnung mitzählen (optional) */
  linePoints?: [number, number][]
}

export interface ListExport {
  title: string
  groups: { label: string, people: PersonSummary[] }[]
}

export type Progress = (message: string) => void

const FONT = 'NotoSans'
const COLORS = {
  M: '#dce9f1',
  F: '#f6e2e6',
  U: '#ececec',
  stroke: '#9c9a96',
  link: '#7d7a75',
  text: '#1f1d1a',
  muted: '#5c5853',
  accent: '#8a5a12',
}


async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Noto Sans einbetten – deckt Umlaute, osteuropäische Zeichen und † ab */
async function createDoc(format: PaperFormat, orientation: 'portrait' | 'landscape') {
  const doc = new jsPDF({ unit: 'mm', format, orientation, compress: true })
  const [regular, bold] = await Promise.all([toBase64(regularUrl), toBase64(boldUrl)])
  doc.addFileToVFS('NotoSans-Regular.ttf', regular)
  doc.addFont('NotoSans-Regular.ttf', FONT, 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', bold)
  doc.addFont('NotoSans-Bold.ttf', FONT, 'bold')
  doc.setFont(FONT, 'normal')
  doc.setProperties({ title: 'Stammbaum', creator: 'Stammbaum-Dashboard' })
  return doc
}

/**
 * Lädt die Profilbilder und verkleinert sie (spart viel Dateigröße).
 * `round`: rund zugeschnitten auf weißem Grund (für die Liste ohne SVG-Maske).
 */
async function loadPhotos(urls: string[], onProgress: Progress, round = false): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const size = 180
  let done = 0
  const queue = [...new Set(urls)]
  const total = queue.length
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const blob = await (await fetch(url, { credentials: 'same-origin' })).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        if (round) {
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
          ctx.clip()
        }
        // quadratisch zuschneiden („cover“)
        const side = Math.min(bitmap.width, bitmap.height)
        ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
        result.set(url, canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        // Bild fehlt – Karte bekommt dann Initialen
      }
      onProgress(`Fotos werden geladen … ${++done} von ${total}`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return result
}

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

function header(doc: jsPDF, title: string) {
  const width = doc.internal.pageSize.getWidth()
  doc.setFont(FONT, 'bold').setFontSize(14).setTextColor(COLORS.text)
  doc.text(title, PAGE_MARGIN, PAGE_MARGIN + 5)
  const stand = `Stand: ${new Date().toLocaleDateString('de-DE', { dateStyle: 'long' })}`
  doc.setFont(FONT, 'normal').setFontSize(8).setTextColor(COLORS.muted)
  doc.text(stand, width - PAGE_MARGIN, PAGE_MARGIN + 5, { align: 'right' })
}

/** Baum (Baumansicht oder Gesamtbaum) als eine Seite im gewählten Format */
export async function exportTreePdf(t: TreeExport, format: PaperFormat, onProgress: Progress) {
  const bounds = contentBounds(t.cards, t.cardW, t.cardH, t.linePoints ?? [])
  const orientation = chooseOrientation(bounds.width, bounds.height)
  onProgress('Schrift wird geladen …')
  const doc = await createDoc(format, orientation)

  const photos = await loadPhotos(t.cards.flatMap(c => (c.person.photo && !c.person.anonymized ? [c.person.photo] : [])), onProgress)
  onProgress('PDF wird erstellt …')

  // Textbreiten mit der eingebetteten Schrift messen (in Layout-Einheiten)
  const measure = (weight: 'normal' | 'bold', size: number) => (s: string) => {
    doc.setFont(FONT, weight)
    return doc.getStringUnitWidth(s) * size
  }
  const W = t.cardW
  const H = t.cardH
  const r = H * 0.34
  const textX = 2 * r + 16
  const textW = W - textX - 8
  const small = NAME_SIZE * 0.8

  const cards = t.cards.map((c, i) => {
    const p = c.person
    const fill = COLORS[p.gender] ?? COLORS.U
    const lines: { text: string, size: number, bold: boolean, color: string }[] = [
      { text: truncate(fullName(p), textW, measure('bold', NAME_SIZE)), size: NAME_SIZE, bold: true, color: p.anonymized ? COLORS.muted : COLORS.text },
    ]
    if (p.birth?.date) lines.push({ text: truncate(`* ${p.birth.date}`, textW, measure('normal', small)), size: small, bold: false, color: COLORS.muted })
    if (p.death?.date) lines.push({ text: truncate(`† ${p.death.date}`, textW, measure('normal', small)), size: small, bold: false, color: COLORS.muted })
    // Zeilen senkrecht mittig
    const total = lines.reduce((s, l) => s + l.size * 1.25, 0)
    let y = H / 2 - total / 2
    const texts = lines.map(l => {
      y += l.size * 1.25
      return `<text x="${textX}" y="${(y - l.size * 0.28).toFixed(1)}" font-family="${FONT}" font-weight="${l.bold ? 'bold' : 'normal'}" font-size="${l.size}" fill="${l.color}">${xml(l.text)}</text>`
    }).join('')
    const photo = p.photo ? photos.get(p.photo) : undefined
    const cx = r + 8
    const avatar = photo
      ? `<clipPath id="c${i}"><circle cx="${cx}" cy="${H / 2}" r="${r}"/></clipPath>
         <image href="${photo}" x="${cx - r}" y="${H / 2 - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#c${i})" preserveAspectRatio="xMidYMid slice"/>
         <circle cx="${cx}" cy="${H / 2}" r="${r}" fill="none" stroke="#ffffff" stroke-width="1.5"/>`
      : `<circle cx="${cx}" cy="${H / 2}" r="${r}" fill="#ffffff"/>
         <text x="${cx}" y="${H / 2 + 5}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${NAME_SIZE * 1.1}" fill="${COLORS.muted}">${xml(initials(p))}</text>`
    return `<g transform="translate(${(c.x - W / 2).toFixed(1)},${(c.y - H / 2).toFixed(1)})">
      <rect width="${W}" height="${H}" rx="8" fill="${fill}" stroke="${COLORS.stroke}" stroke-width="0.8"/>
      ${avatar}${texts}</g>`
  })

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
    <g fill="none" stroke="${COLORS.link}" stroke-width="1.4" stroke-linejoin="miter">${t.links.map(d => `<path d="${xml(d)}"/>`).join('')}</g>
    ${cards.join('')}
  </svg>`
  const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement as unknown as SVGSVGElement
  // svg2pdf braucht das Element im Dokument (für Stile und Maße)
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden'
  host.appendChild(svg)
  document.body.appendChild(host)
  try {
    header(doc, t.title)
    const fit = fitInto(bounds.width, bounds.height, contentBox(format, orientation))
    await svg2pdf(svg, doc, { x: fit.x, y: fit.y, width: fit.width, height: fit.height })
  } finally {
    host.remove()
  }
  doc.save(pdfFileName(t.title))
}

/** Personenliste als Tabelle über mehrere Seiten (Hochformat) */
export async function exportListPdf(list: ListExport, format: PaperFormat, onProgress: Progress) {
  onProgress('Schrift wird geladen …')
  const doc = await createDoc(format, 'portrait')
  const people = list.groups.flatMap(g => g.people)
  const photos = await loadPhotos(people.flatMap(p => (p.photo ? [p.photo] : [])), onProgress, true)
  onProgress('PDF wird erstellt …')

  const page = pageSize(format, 'portrait')
  const left = PAGE_MARGIN + 5
  const right = page.width - PAGE_MARGIN - 5
  const bottom = page.height - PAGE_MARGIN - 8
  const rowH = 12
  const photoD = 9
  const cols = { name: left + photoD + 4, born: left + (right - left) * 0.5, died: left + (right - left) * 0.75 }
  const fit = (s: string, w: number) => truncate(s, w, t => doc.getTextWidth(t))

  const tableHead = (y: number) => {
    doc.setFont(FONT, 'bold').setFontSize(8).setTextColor(COLORS.muted)
    doc.text('Name', cols.name, y)
    doc.text('Geboren', cols.born, y)
    doc.text('Gestorben', cols.died, y)
    doc.setDrawColor(COLORS.stroke).setLineWidth(0.2).line(left, y + 2, right, y + 2)
    return y + 6
  }
  const newPage = () => {
    header(doc, list.title)
    return tableHead(PAGE_MARGIN + 18)
  }

  let y = newPage()
  for (const group of list.groups) {
    // Überschrift nicht allein am Seitenende stehen lassen
    if (y + 8 + rowH > bottom) {
      doc.addPage(format, 'portrait')
      y = newPage()
    }
    doc.setFont(FONT, 'bold').setFontSize(10.5).setTextColor(COLORS.accent)
    doc.text(group.label, left, y + 4)
    y += 7
    for (const p of group.people) {
      if (y + rowH > bottom) {
        doc.addPage(format, 'portrait')
        y = newPage()
      }
      const mid = y + rowH / 2
      const photo = p.photo ? photos.get(p.photo) : undefined
      if (photo) doc.addImage(photo, 'JPEG', left, mid - photoD / 2, photoD, photoD)
      else {
        doc.setFillColor(COLORS[p.gender] ?? COLORS.U).circle(left + photoD / 2, mid, photoD / 2, 'F')
        doc.setFont(FONT, 'bold').setFontSize(7).setTextColor(COLORS.muted)
        doc.text(initials(p), left + photoD / 2, mid + 1.2, { align: 'center' })
      }
      doc.setFont(FONT, 'bold').setFontSize(10).setTextColor(COLORS.text)
      doc.text(fit(fullName(p), cols.born - cols.name - 4), cols.name, mid + 1.4)
      doc.setFont(FONT, 'normal').setFontSize(9).setTextColor(COLORS.muted)
      if (p.birth?.date) doc.text(fit(`* ${p.birth.date}`, cols.died - cols.born - 4), cols.born, mid + 1.4)
      if (p.death?.date) doc.text(fit(`† ${p.death.date}`, right - cols.died), cols.died, mid + 1.4)
      doc.setDrawColor('#e4e1dc').setLineWidth(0.15).line(cols.name, y + rowH, right, y + rowH)
      y += rowH
    }
    y += 3
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont(FONT, 'normal').setFontSize(8).setTextColor(COLORS.muted)
    doc.text(`Seite ${i} von ${pages}`, page.width / 2, page.height - PAGE_MARGIN, { align: 'center' })
  }
  doc.save(pdfFileName(list.title))
}
