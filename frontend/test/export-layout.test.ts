import { describe, expect, it } from 'vitest'
import {
  chooseOrientation, contentBounds, fitInto, pageSize, pdfFileName, printedFontPt, recommendFormat, truncate,
} from '../src/lib/export/layout.ts'

describe('PDF-Layout', () => {
  it('wählt Quer- oder Hochformat nach der Form des Baums', () => {
    expect(chooseOrientation(3000, 800)).toBe('landscape')
    expect(chooseOrientation(800, 3000)).toBe('portrait')
    expect(chooseOrientation(1000, 1000)).toBe('portrait')
    expect(pageSize('a4', 'landscape')).toEqual({ width: 297, height: 210 })
    expect(pageSize('a0', 'portrait')).toEqual({ width: 841, height: 1189 })
  })

  it('passt den Inhalt unverzerrt und mittig ein', () => {
    const r = fitInto(2000, 1000, { x: 10, y: 20, width: 200, height: 200 })
    expect(r).toEqual({ x: 10, y: 70, width: 200, height: 100, scale: 0.1 })
  })

  it('kürzt Texte mit Auslassungszeichen', () => {
    const measure = (s: string) => s.length
    expect(truncate('Johann Muster', 20, measure)).toBe('Johann Muster')
    expect(truncate('Johann Friedrich Muster', 10, measure)).toBe('Johann Fr…')
    expect(truncate('Abc', 0, measure)).toBe('…')
  })

  it('bildet einen sauberen Dateinamen', () => {
    expect(pdfFileName('Stammbaum – Jürgen Weiß', new Date(2026, 10, 8))).toBe('Stammbaum-Jurgen-Weiss-2026-11-08.pdf')
    expect(pdfFileName('', new Date(2026, 0, 2))).toBe('Stammbaum-2026-01-02.pdf')
  })

  it('berechnet die Ausdehnung aus Karten und Linien', () => {
    const b = contentBounds([{ x: 100, y: 50 }, { x: 400, y: 250 }], 200, 60, [[600, 300]], 0)
    expect(b).toEqual({ x: 0, y: 20, width: 600, height: 280 })
  })

  it('schätzt die gedruckte Schriftgröße und empfiehlt ein Format', () => {
    const small = { width: 1000, height: 600 }
    const huge = { width: 40000, height: 3000 }
    expect(printedFontPt(small, 'a4', 12)).toBeGreaterThan(6)
    expect(recommendFormat(small, 12)).toBe('a4')
    expect(printedFontPt(huge, 'a4', 12)).toBeLessThan(1)
    expect(recommendFormat(huge, 12)).toBe('a0')
    // größeres Papier → größere Schrift
    expect(printedFontPt(huge, 'a0', 12)).toBeGreaterThan(printedFontPt(huge, 'a4', 12))
  })
})
