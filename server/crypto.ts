import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const b64url = (buf: Buffer) => buf.toString('base64url')
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes))
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest())

/** Stable JSON: object keys sorted, so equal content always hashes equally. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** AES-256-GCM sealing for provider tokens at rest. */
export class Sealer {
  private key: Buffer
  constructor(secret: string) {
    if (secret.length < 32) throw new Error('TATADA_SECRET must be at least 32 characters')
    this.key = createHash('sha256').update(secret).digest()
  }
  seal(plain: string): string {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return ['v1', b64url(iv), b64url(c.getAuthTag()), b64url(data)].join('.')
  }
  open(sealed: string): string {
    const [v, iv, tag, data] = sealed.split('.')
    if (v !== 'v1') throw new Error('unknown sealed format')
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')
  }
}
