import index from '../shared/chart-index.json'
import { DIFFICULTIES, type Difficulty } from '../shared/analyze'
import { JUDGMENTS, scoreOf, type ChartIndexEntry, type Counts, type ScoreRow, type ScoreSubmission } from '../shared/types'

export interface Store {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

type User = { name: string; salt: string; hash: string; created: string; settings: Settings }
export type Settings = { offsetMs: number; speed: number }
const DEFAULT_SETTINGS: Settings = { offsetMs: 0, speed: 1 }
type Bests = Record<string, ScoreRow>

const charts = new Map((index as ChartIndexEntry[]).map((c) => [c.slug, c]))
const enc = new TextEncoder()
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url')

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120_000 }, key, 256)
  return b64(bits)
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

const SESSION_DAYS = 14
async function sessionCookie(secret: string, name: string, secure: boolean) {
  const exp = Date.now() + SESSION_DAYS * 864e5
  const payload = `${encodeURIComponent(name)}.${exp}`
  const value = `${payload}.${await hmac(secret, payload)}`
  return `sess=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

async function sessionUser(req: Request, secret: string): Promise<string | null> {
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith('sess='))?.slice(5)
  if (!raw) return null
  const [name, exp, sig] = raw.split('.')
  if (!name || !exp || !sig || Number(exp) < Date.now()) return null
  if ((await hmac(secret, `${name}.${exp}`)) !== sig) return null
  return decodeURIComponent(name)
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const fail = (status: number, error: string) => json({ error }, status)

const USERNAME = /^[a-zA-Z0-9_-]{3,20}$/
const userKey = (name: string) => `user/${name.toLowerCase()}`
const boardKey = (slug: string, d: Difficulty) => `board/${slug}/${d}`
const bestsKey = (name: string) => `bests/${name.toLowerCase()}`
const historyKey = (name: string) => `history/${name.toLowerCase()}`

export function validateSubmission(body: unknown): ScoreSubmission | string {
  const b = body as Partial<ScoreSubmission>
  const entry = typeof b?.slug === 'string' ? charts.get(b.slug) : undefined
  if (!entry) return 'unknown song'
  if (!DIFFICULTIES.includes(b.difficulty as Difficulty)) return 'unknown difficulty'
  const counts = b.counts as Counts | undefined
  if (!counts || !JUDGMENTS.every((j) => Number.isInteger(counts[j]) && counts[j] >= 0)) return 'counts must be whole numbers'
  const total = entry.notes[b.difficulty as Difficulty]
  const sum = JUDGMENTS.reduce((s, j) => s + counts[j], 0)
  if (sum !== total) return `counts add up to ${sum}, but this chart has ${total} notes`
  if (!Number.isInteger(b.maxCombo) || b.maxCombo! < 0 || b.maxCombo! > total - counts.miss) return 'max combo is impossible for these counts'
  return { slug: b.slug!, difficulty: b.difficulty as Difficulty, counts, maxCombo: b.maxCombo!, cleared: b.cleared === true }
}

export async function handle(req: Request, store: Store, secret: string): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '')
  const secure = url.protocol === 'https:'
  const body = async () => { try { return await req.json() } catch { return null } }

  if (req.method === 'POST' && (path === '/signup' || path === '/login')) {
    const { username, password } = ((await body()) ?? {}) as { username?: string; password?: string }
    if (typeof username !== 'string' || !USERNAME.test(username)) return fail(400, 'Username: 3-20 letters, numbers, _ or -')
    if (typeof password !== 'string' || password.length < 8) return fail(400, 'Password: at least 8 characters')
    const existing = await store.get<User>(userKey(username))
    if (path === '/signup') {
      if (existing) return fail(409, 'That name is taken')
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
      const user: User = { name: username, salt, hash: await hashPassword(password, salt), created: new Date().toISOString(), settings: DEFAULT_SETTINGS }
      await store.set(userKey(username), user)
      return json({ name: user.name, settings: user.settings }, 201, { 'set-cookie': await sessionCookie(secret, user.name, secure) })
    }
    if (!existing || (await hashPassword(password, existing.salt)) !== existing.hash) return fail(401, 'Wrong username or password')
    return json({ name: existing.name, settings: existing.settings }, 200, { 'set-cookie': await sessionCookie(secret, existing.name, secure) })
  }

  if (req.method === 'POST' && path === '/logout') return json({ ok: true }, 200, { 'set-cookie': 'sess=; Path=/; Max-Age=0' })

  const leaderboard = path.match(/^\/leaderboard\/([a-z0-9-]+)\/(easy|normal|hard)$/)
  if (req.method === 'GET' && leaderboard) {
    return json((await store.get<ScoreRow[]>(boardKey(leaderboard[1]!, leaderboard[2] as Difficulty))) ?? [])
  }

  const name = await sessionUser(req, secret)
  if (req.method === 'GET' && path === '/session') return json({ signedIn: name !== null })
  if (!name) return fail(401, 'Sign in first')
  const user = await store.get<User>(userKey(name))
  if (!user) return fail(401, 'Sign in first')

  if (req.method === 'GET' && path === '/me') {
    return json({ name: user.name, settings: user.settings, bests: (await store.get<Bests>(bestsKey(name))) ?? {}, history: ((await store.get<ScoreRow[]>(historyKey(name))) ?? []).slice(0, 15) })
  }

  if (req.method === 'PUT' && path === '/me/settings') {
    const s = ((await body()) ?? {}) as Partial<Settings>
    const offsetMs = Number(s.offsetMs ?? user.settings.offsetMs)
    const speed = Number(s.speed ?? user.settings.speed)
    if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 300) return fail(400, 'Offset must be within ±300 ms')
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 3) return fail(400, 'Speed must be 0.5–3')
    user.settings = { offsetMs: Math.round(offsetMs), speed: Math.round(speed * 10) / 10 }
    await store.set(userKey(name), user)
    return json(user.settings)
  }

  if (req.method === 'POST' && path === '/scores') {
    const sub = validateSubmission(await body())
    if (typeof sub === 'string') return fail(400, sub)
    const total = charts.get(sub.slug)!.notes[sub.difficulty]
    const row: ScoreRow = { ...sub, user: user.name, ...scoreOf(sub.counts, total), at: new Date().toISOString() }
    const history = (await store.get<ScoreRow[]>(historyKey(name))) ?? []
    await store.set(historyKey(name), [row, ...history].slice(0, 50))
    const bests = (await store.get<Bests>(bestsKey(name))) ?? {}
    const key = `${sub.slug}/${sub.difficulty}`
    const personalBest = !bests[key] || row.score > bests[key]!.score
    if (personalBest) { bests[key] = row; await store.set(bestsKey(name), bests) }
    const board = ((await store.get<ScoreRow[]>(boardKey(sub.slug, sub.difficulty))) ?? []).filter((r) => r.user !== user.name || !personalBest)
    if (personalBest) board.push(row)
    board.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    const top = board.slice(0, 20)
    await store.set(boardKey(sub.slug, sub.difficulty), top)
    const rank = top.findIndex((r) => r.user === user.name && r.score === (personalBest ? row.score : bests[key]!.score)) + 1
    return json({ row, personalBest, previousBest: personalBest ? null : bests[key], rank: rank || null })
  }

  return fail(404, 'No such route')
}
