import { isSettings, isString, isRecord, type Settings } from '../shared/guards'

export type User = { name: string; salt: string; hash: string; created: string; settings: Settings }

export const isUser = (v: unknown): v is User =>
  isRecord(v) && isString(v['name']) && isString(v['salt']) && isString(v['hash']) && isString(v['created']) && isSettings(v['settings'])

const SESSION_DAYS = 14
const DAY_MS = 864e5
const enc = new TextEncoder()
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url')

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120_000 }, key, 256)
  return b64(bits)
}

export async function newUser(name: string, password: string, settings: Settings): Promise<User> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  return { name, salt, hash: await hashPassword(password, salt), created: new Date().toISOString(), settings }
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function sessionCookie(secret: string, name: string, secure: boolean) {
  const payload = `${encodeURIComponent(name)}.${Date.now() + SESSION_DAYS * DAY_MS}`
  const value = `${payload}.${await hmac(secret, payload)}`
  return `sess=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure ? '; Secure' : ''}`
}

export const CLEAR_COOKIE = 'sess=; Path=/; Max-Age=0'

export async function sessionUser(req: Request, secret: string): Promise<string | null> {
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith('sess='))?.slice(5) ?? ''
  const [name = '', exp = '', sig = ''] = raw.split('.')
  if (name === '' || sig === '' || !(Number(exp) >= Date.now())) return null
  if ((await hmac(secret, `${name}.${exp}`)) !== sig) return null
  return decodeURIComponent(name)
}
