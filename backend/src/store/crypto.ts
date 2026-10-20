import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

/** Leitet aus dem App-Secret getrennte Schlüssel je Verwendungszweck ab. */
export function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'stammbaum', purpose, 32))
}

/** Zufallstoken für Freigabelinks: 32 Byte, base64url (43 Zeichen). */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** AES-256-GCM; Ergebnis: base64url(iv | tag | ciphertext) */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')
}

export function decrypt(key: Buffer, box: string): string {
  const raw = Buffer.from(box, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
