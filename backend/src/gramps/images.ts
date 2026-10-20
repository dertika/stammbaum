import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AllowedMedia } from '../view/project.ts'
import type { GrampsClient } from './client.ts'

export interface Image {
  body: Buffer
  type: string
}

export type ImageFetcher = (mediaId: string, media: AllowedMedia) => Promise<Image>

/** Kantenlänge der Profilbilder (quadratisch) bzw. maximale Größe der übrigen Bilder */
const PORTRAIT_SIZE = 400
const IMAGE_SIZE = 1600
const SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Holt Bilder über die Thumbnail-Endpunkte von Gramps Web (immer verkleinert, nie das Original). */
export function grampsImages(client: GrampsClient): ImageFetcher {
  return async (id, media) => {
    const h = encodeURIComponent(id)
    let path: string
    if (media.kind === 'portrait' && media.rect) {
      const [x1, y1, x2, y2] = media.rect.map(v => Math.round(v))
      path = `/api/media/${h}/cropped/${x1}/${y1}/${x2}/${y2}/thumbnail/${PORTRAIT_SIZE}?square=true`
    } else if (media.kind === 'portrait') {
      path = `/api/media/${h}/thumbnail/${PORTRAIT_SIZE}?square=true`
    } else {
      path = `/api/media/${h}/thumbnail/${IMAGE_SIZE}`
    }
    const res = await client.get(path)
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    // Nur Rasterformate ausliefern – z. B. SVG könnte Skripte enthalten
    if (!SAFE_TYPES.has(type)) throw new Error(`Unerwarteter Bildtyp ${type} für ${id}`)
    return { body: Buffer.from(await res.arrayBuffer()), type }
  }
}

/** Platzhalterbilder für die Entwicklung mit Musterdaten. */
export function fixtureImages(): ImageFetcher {
  return async (id, media) => {
    const hue = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
    const svg = media.kind === 'portrait'
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue} 35% 62%)"/><circle cx="50" cy="38" r="18" fill="hsl(${hue} 30% 88%)"/><path d="M14 100c4-24 18-34 36-34s32 10 36 34z" fill="hsl(${hue} 30% 88%)"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="hsl(${hue} 30% 55%)"/><path d="M0 80l40-30 30 20 40-40 50 50v20H0z" fill="hsl(${hue} 30% 80%)"/><circle cx="125" cy="25" r="10" fill="hsl(45 90% 75%)"/></svg>`
    return { body: Buffer.from(svg), type: 'image/svg+xml' }
  }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]))

/**
 * Zwischenspeicher auf der Platte (im Volume). Der Schlüssel enthält die
 * Prüfsumme aus Gramps – ändert sich das Bild dort, entsteht ein neuer Eintrag.
 */
export class ImageCache {
  private readonly dir: string
  private readonly fetcher: ImageFetcher
  private readonly pending = new Map<string, Promise<Image>>()
  private ready: Promise<unknown> | null = null

  constructor(dir: string, fetcher: ImageFetcher) {
    this.dir = dir
    this.fetcher = fetcher
  }

  private key(id: string, m: AllowedMedia): string {
    return createHash('sha256').update(JSON.stringify([id, m.kind, m.checksum, m.rect ?? null])).digest('hex')
  }

  async get(id: string, media: AllowedMedia): Promise<Image> {
    const key = this.key(id, media)
    const running = this.pending.get(key)
    if (running) return running
    const job = this.load(key, id, media).finally(() => this.pending.delete(key))
    this.pending.set(key, job)
    return job
  }

  private async load(key: string, id: string, media: AllowedMedia): Promise<Image> {
    this.ready ??= mkdir(this.dir, { recursive: true })
    await this.ready
    for (const [ext, type] of Object.entries(TYPE_BY_EXT)) {
      try {
        return { body: await readFile(join(this.dir, `${key}.${ext}`)), type }
      } catch { /* nicht im Cache */ }
    }
    const image = await this.fetcher(id, media)
    const file = join(this.dir, `${key}.${EXT[image.type] ?? 'bin'}`)
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, image.body)
    await rename(tmp, file)
    return image
  }
}
