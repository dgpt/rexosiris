import index from '../shared/chart-index.json'
import { isArrayOf, isCounts, isDifficulty, isRecord, isRecordOf, isScoreRow, isString, isWhole, type Settings } from '../shared/guards'
import { scoreOf, type ScoreRow, type ScoreSubmission } from '../shared/types'
import { CLEAR_COOKIE, hashPassword, isUser, newUser, sessionCookie, sessionUser, type User } from './session'

export interface Store {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

type Context = { readonly req: Request; readonly store: Store; readonly secret: string; readonly secure: boolean }
type PublicRoute = (ctx: Context, params: readonly string[]) => Response | Promise<Response>
type PrivateRoute = (ctx: Context, user: User) => Promise<Response>

const DEFAULT_SETTINGS: Settings = { offsetMs: 0, speed: 0.5 }
const BOARD_SIZE = 20
const HISTORY_SIZE = 50
const HISTORY_SHOWN = 15
const noteCounts = new Map(index.map((c) => [c.slug, c.notes]))

const USERNAME = /^[a-zA-Z0-9_-]{3,20}$/
const userKey = (name: string) => `user/${name.toLowerCase()}`
const boardKey = (slug: string, difficulty: string) => `board/${slug}/${difficulty}`
const bestsKey = (name: string) => `bests/${name.toLowerCase()}`
const historyKey = (name: string) => `history/${name.toLowerCase()}`

const isRows = isArrayOf(isScoreRow)
const isBests = isRecordOf(isScoreRow)

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const fail = (status: number, error: string) => json({ error }, status)

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await req.json().catch(() => null)
  return isRecord(parsed) ? parsed : {}
}

async function read<T>(store: Store, key: string, guard: (v: unknown) => v is T, fallback: T): Promise<T> {
  const value = await store.get(key)
  return guard(value) ? value : fallback
}

export function validateSubmission(body: unknown): ScoreSubmission | string {
  if (!isRecord(body)) return 'unknown song'
  const { slug, difficulty, counts, maxCombo } = body
  const chartNotes = isString(slug) ? noteCounts.get(slug) : undefined
  if (chartNotes === undefined || !isString(slug)) return 'unknown song'
  if (!isDifficulty(difficulty)) return 'unknown difficulty'
  if (!isCounts(counts)) return 'counts must be whole numbers'
  const total = chartNotes[difficulty]
  const sum = counts.perfect + counts.great + counts.good + counts.miss
  if (sum !== total) return `counts add up to ${sum}, but this chart has ${total} notes`
  if (!isWhole(maxCombo) || maxCombo > total - counts.miss) return 'max combo is impossible for these counts'
  return { slug, difficulty, counts, maxCombo, cleared: body['cleared'] === true }
}

async function credentials(req: Request) {
  const { username, password } = await bodyOf(req)
  if (!isString(username) || !USERNAME.test(username)) return 'Username: 3-20 letters, numbers, _ or -'
  if (!isString(password) || password.length < 8) return 'Password: at least 8 characters'
  return { username, password }
}

const signedIn = async (ctx: Context, user: User, status: number) =>
  json({ name: user.name, settings: user.settings }, status, { 'set-cookie': await sessionCookie(ctx.secret, user.name, ctx.secure) })

const signup: PublicRoute = async (ctx) => {
  const creds = await credentials(ctx.req)
  if (isString(creds)) return fail(400, creds)
  if (isUser(await ctx.store.get(userKey(creds.username)))) return fail(409, 'That name is taken')
  const user = await newUser(creds.username, creds.password, DEFAULT_SETTINGS)
  await ctx.store.set(userKey(user.name), user)
  return signedIn(ctx, user, 201)
}

const login: PublicRoute = async (ctx) => {
  const creds = await credentials(ctx.req)
  if (isString(creds)) return fail(400, creds)
  const user = await ctx.store.get(userKey(creds.username))
  if (!isUser(user) || (await hashPassword(creds.password, user.salt)) !== user.hash) return fail(401, 'Wrong username or password')
  return signedIn(ctx, user, 200)
}

const logout: PublicRoute = () => json({ ok: true }, 200, { 'set-cookie': CLEAR_COOKIE })

const session: PublicRoute = async (ctx) => json({ signedIn: (await sessionUser(ctx.req, ctx.secret)) !== null })

const leaderboard: PublicRoute = async (ctx, [slug = '', difficulty = '']) => json(await read(ctx.store, boardKey(slug, difficulty), isRows, []))

const me: PrivateRoute = async (ctx, user) => json({
  name: user.name,
  settings: user.settings,
  bests: await read(ctx.store, bestsKey(user.name), isBests, {}),
  history: (await read(ctx.store, historyKey(user.name), isRows, [])).slice(0, HISTORY_SHOWN),
})

function settingsFrom(body: Record<string, unknown>, current: Settings): Settings | string {
  const offsetMs = Number(body['offsetMs'] ?? current.offsetMs)
  const speed = Number(body['speed'] ?? current.speed)
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 300) return 'Offset must be within ±300 ms'
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 3) return 'Speed must be 0.25–3'
  return { offsetMs: Math.round(offsetMs), speed: Math.round(speed * 20) / 20 }
}

const settings: PrivateRoute = async (ctx, user) => {
  const next = settingsFrom(await bodyOf(ctx.req), user.settings)
  if (isString(next)) return fail(400, next)
  await ctx.store.set(userKey(user.name), { ...user, settings: next })
  return json(next)
}

async function rankOnBoard(store: Store, row: ScoreRow, personalBest: boolean, best: ScoreRow) {
  const key = boardKey(row.slug, row.difficulty)
  const board = (await read(store, key, isRows, [])).filter((r) => r.user !== row.user || !personalBest)
  if (personalBest) board.push(row)
  const top = board.toSorted((a, b) => b.score - a.score || a.at.localeCompare(b.at)).slice(0, BOARD_SIZE)
  await store.set(key, top)
  const rank = top.findIndex((r) => r.user === row.user && r.score === best.score) + 1
  return rank === 0 ? null : rank
}

const submit: PrivateRoute = async (ctx, user) => {
  const sub = validateSubmission(await bodyOf(ctx.req))
  if (isString(sub)) return fail(400, sub)
  const total = noteCounts.get(sub.slug)?.[sub.difficulty] ?? 0
  const row: ScoreRow = { ...sub, user: user.name, ...scoreOf(sub.counts, total), at: new Date().toISOString() }
  const history = await read(ctx.store, historyKey(user.name), isRows, [])
  await ctx.store.set(historyKey(user.name), [row, ...history].slice(0, HISTORY_SIZE))
  const bests = await read(ctx.store, bestsKey(user.name), isBests, {})
  const key = `${sub.slug}/${sub.difficulty}`
  const previous = bests[key]
  const personalBest = previous === undefined || row.score > previous.score
  if (personalBest) await ctx.store.set(bestsKey(user.name), { ...bests, [key]: row })
  const rank = await rankOnBoard(ctx.store, row, personalBest, personalBest ? row : previous)
  return json({ row, personalBest, previousBest: personalBest ? null : previous, rank })
}

const PUBLIC: readonly (readonly [string, RegExp, PublicRoute])[] = [
  ['POST', /^\/signup$/, signup],
  ['POST', /^\/login$/, login],
  ['POST', /^\/logout$/, logout],
  ['GET', /^\/session$/, session],
  ['GET', /^\/leaderboard\/([a-z0-9-]+)\/(easy|normal|hard)$/, leaderboard],
]

const PRIVATE: readonly (readonly [string, RegExp, PrivateRoute])[] = [
  ['GET', /^\/me$/, me],
  ['PUT', /^\/me\/settings$/, settings],
  ['POST', /^\/scores$/, submit],
]

async function currentUser(ctx: Context): Promise<User | null> {
  const name = await sessionUser(ctx.req, ctx.secret)
  if (name === null) return null
  const user = await ctx.store.get(userKey(name))
  return isUser(user) ? user : null
}

export async function handle(req: Request, store: Store, secret: string): Promise<Response> {
  const url = new URL(req.url)
  const ctx: Context = { req, store, secret, secure: url.protocol === 'https:' }
  const path = url.pathname.replace(/^\/api/, '')
  const open = PUBLIC.map(([method, pattern, route]) => ({ route, match: req.method === method ? pattern.exec(path) : null })).find((r) => r.match !== null)
  if (open !== undefined && open.match !== null) return open.route(ctx, open.match.slice(1))
  const route = PRIVATE.find(([method, pattern]) => req.method === method && pattern.test(path))?.[2]
  if (route === undefined) return fail(404, 'No such route')
  const user = await currentUser(ctx)
  return user === null ? fail(401, 'Sign in first') : route(ctx, user)
}
