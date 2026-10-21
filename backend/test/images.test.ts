import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { GrampsClient } from '../src/gramps/client.ts'
import { grampsImages, ImageCache } from '../src/gramps/images.ts'

const avif = () => sharp({ create: { width: 600, height: 500, channels: 3, background: '#a65' } }).avif().toBuffer()

/** Gramps-Client-Attrappe, die eine feste Antwort liefert */
function fakeClient(body: Buffer, type: string, paths: string[] = []) {
  return { get: async (path: string) => { paths.push(path); return new Response(new Uint8Array(body), { headers: { 'content-type': type } }) } } as unknown as GrampsClient
}

describe('Bilder aus Gramps Web', () => {
  it('wandelt AVIF-Thumbnails (aktuelles Gramps Web) in JPEG um', async () => {
    const paths: string[] = []
    const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'sb-img-')), grampsImages(fakeClient(await avif(), 'image/avif', paths)))
    const img = await cache.get('h1', { kind: 'portrait', checksum: 'c', rect: [10, 20, 60, 80] })
    expect(img.type).toBe('image/jpeg')
    const meta = await sharp(img.body).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 400, height: 400 })
    expect(paths).toEqual(['/api/media/h1/cropped/10/20/60/80/thumbnail/400?square=true'])
  })

  it('verkleinert große Bilder und lässt kleine in Originalgröße', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sb-img-'))
    const cache = new ImageCache(dir, grampsImages(fakeClient(await avif(), 'image/avif')))
    const img = await cache.get('h2', { kind: 'image', checksum: 'c' })
    expect(await sharp(img.body).metadata()).toMatchObject({ format: 'jpeg', width: 600, height: 500 })
    expect(readdirSync(dir).filter(f => f.endsWith('.jpg'))).toHaveLength(1)
  })

  it('nutzt den Cache beim zweiten Abruf', async () => {
    const paths: string[] = []
    const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'sb-img-')), grampsImages(fakeClient(await avif(), 'image/avif', paths)))
    await cache.get('h3', { kind: 'portrait', checksum: 'c' })
    await cache.get('h3', { kind: 'portrait', checksum: 'c' })
    expect(paths).toEqual(['/api/media/h3/thumbnail/400?square=true'])
  })

  it('meldet Antworten, die kein Bild sind', async () => {
    const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'sb-img-')), grampsImages(fakeClient(Buffer.from('{}'), 'application/json')))
    await expect(cache.get('h4', { kind: 'portrait', checksum: 'c' })).rejects.toThrow(/kein Bild/)
    expect(cache.lastError?.message).toMatch(/^h4: Gramps Web lieferte kein Bild/)
  })

  it('verwirft kaputte Bilddaten', async () => {
    const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'sb-img-')), grampsImages(fakeClient(Buffer.from('kein bild'), 'image/avif')))
    await expect(cache.get('h5', { kind: 'portrait', checksum: 'c' })).rejects.toThrow()
  })
})
