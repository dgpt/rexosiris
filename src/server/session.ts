import { timingSafeEqual } from 'node:crypto'
import { isRecord, isSettings, isString, type Settings } from '../shared/guards'

export type User = { readonly name: string; readonly salt: string; readonly hash: string; readonly created: string; readonly settings: Settings }

export const isUser = (v: unknown): v is User =>
  isRecord(v) && isString(v['name']) && isString(v['salt']) && isString(v['hash']) && isString(v['created']) && isSettings(v['settings'])

const SESSION_SECONDS = 14 * 86_400
const PBKDF2_ITERATIONS = 120_000
const COOKIE = 'sess'
const encoder = new TextEncoder()
const base64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url')

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return base64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256))
}

export async function newUser(name: string, password: string, settings: Settings): Promise<User> {
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)))
  return { name, salt, hash: await hashPassword(password, salt), created: new Date().toISOString(), settings }
}

export async function passwordMatches(password: string, user: User): Promise<boolean> {
  const offered = Buffer.from(await hashPassword(password, user.salt))
  const stored = Buffer.from(user.hash)
  return offered.length === stored.length && timingSafeEqual(offered, stored)
}

const signingKey = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export async function sessionCookie(secret: string, name: string, secure: boolean) {
  const payload = `${encodeURIComponent(name)}.${Date.now() + SESSION_SECONDS * 1000}`
  const signature = base64url(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload)))
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`
}

export const CLEAR_COOKIE = `${COOKIE}=; Path=/; Max-Age=0`

export async function sessionUser(req: Request, secret: string): Promise<string | null> {
  const value = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''
  const [name = '', expires = '', signature = ''] = value.split('.')
  if (name === '' || signature === '' || !(Number(expires) > Date.now())) return null
  const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), Buffer.from(signature, 'base64url'), encoder.encode(`${name}.${expires}`))
  return valid ? decodeURIComponent(name) : null
}
