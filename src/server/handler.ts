import index from '../../public/charts/index.json'
import { DIFFICULTIES, type Difficulty } from '../shared/analyze'
import { type Guard, isArrayOf, isCounts, isDifficulty, isRecord, isRecordOf, isScoreRow, isString, isWhole, type Settings } from '../shared/guards'
import { scoreOf, type ScoreRow, type ScoreSubmission } from '../shared/types'
import { CLEAR_COOKIE, isUser, newUser, passwordMatches, sessionCookie, sessionUser, type User } from './session'

export interface Store {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

type Context = { readonly req: Request; readonly store: Store; readonly secret: string; readonly secure: boolean; readonly params: readonly string[] }
type Route = { readonly method: 'GET' | 'POST' | 'PUT'; readonly path: RegExp; readonly run: (ctx: Context) => Promise<Response> }

class Refusal extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const refuse = (status: number, message: string): never => {
  throw new Refusal(status, message)
}

const DEFAULT_SETTINGS: Settings = { offsetMs: 0, speed: 0.5 }
const OFFSET_LIMIT_MS = 300
const SPEED = { min: 0.25, max: 3, step: 0.05 }
const BOARD_SIZE = 20
const HISTORY_KEPT = 50
const HISTORY_SHOWN = 15
const USERNAME = /^[a-zA-Z0-9_-]{3,20}$/
const MIN_PASSWORD_LENGTH = 8

const chartNotes = new Map(index.map((entry) => [entry.slug, entry.notes]))

const keys = {
  user: (name: string) => `user/${name.toLowerCase()}`,
  bests: (name: string) => `bests/${name.toLowerCase()}`,
  history: (name: string) => `history/${name.toLowerCase()}`,
  board: (slug: string, difficulty: Difficulty) => `board/${slug}/${difficulty}`,
}
const chartOf = (row: ScoreSubmission) => `${row.slug}/${row.difficulty}`

const isRows = isArrayOf(isScoreRow)
const isBests = isRecordOf(isScoreRow)

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await req.json().catch(() => null)
  return isRecord(parsed) ? parsed : refuse(400, 'Send a JSON object')
}

async function read<T>(store: Store, key: string, guard: Guard<T>, empty: T): Promise<T> {
  const value = await store.get(key)
  if (value === null) return empty
  if (!guard(value)) throw new Error(`stored ${key} is not in the shape this server writes`)
  return value
}

type Submission = ScoreSubmission & { readonly notes: number }

export function submissionOf(body: Record<string, unknown>): Submission {
  const { slug, difficulty, counts, maxCombo } = body
  const notes = isString(slug) ? chartNotes.get(slug) : undefined
  if (!isString(slug) || notes === undefined) return refuse(400, 'unknown song')
  if (!isDifficulty(difficulty)) return refuse(400, 'unknown difficulty')
  if (!isCounts(counts)) return refuse(400, 'counts must be whole numbers')
  const total = notes[difficulty]
  const judged = counts.perfect + counts.great + counts.good + counts.miss
  if (judged !== total) return refuse(400, `counts add up to ${judged}, but this chart has ${total} notes`)
  if (!isWhole(maxCombo) || maxCombo > total - counts.miss) return refuse(400, 'max combo is impossible for these counts')
  return { slug, difficulty, counts, maxCombo, cleared: body['cleared'] === true, notes: total }
}

export function placeOnBoard(board: readonly ScoreRow[], row: ScoreRow): { readonly board: ScoreRow[]; readonly rank: number | null } {
  const held = board.find((r) => r.user === row.user)
  const entries = held !== undefined && held.score >= row.score ? board : [...board.filter((r) => r.user !== row.user), row]
  const next = entries.toSorted((a, b) => b.score - a.score || a.at.localeCompare(b.at)).slice(0, BOARD_SIZE)
  const rank = next.findIndex((r) => r.user === row.user) + 1
  return { board: next, rank: rank === 0 ? null : rank }
}

function settingsFrom(body: Record<string, unknown>, current: Settings): Settings {
  const offsetMs = Number(body['offsetMs'] ?? current.offsetMs)
  const speed = Number(body['speed'] ?? current.speed)
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > OFFSET_LIMIT_MS) return refuse(400, `Offset must be within ±${OFFSET_LIMIT_MS} ms`)
  if (!Number.isFinite(speed) || speed < SPEED.min || speed > SPEED.max) return refuse(400, `Speed must be ${SPEED.min}–${SPEED.max}`)
  return { offsetMs: Math.round(offsetMs), speed: Math.round(speed / SPEED.step) * SPEED.step }
}

async function credentials(req: Request) {
  const { username, password } = await bodyOf(req)
  if (!isString(username) || !USERNAME.test(username)) return refuse(400, 'Username: 3-20 letters, numbers, _ or -')
  if (!isString(password) || password.length < MIN_PASSWORD_LENGTH) return refuse(400, `Password: at least ${MIN_PASSWORD_LENGTH} characters`)
  return { username, password }
}

const signIn = async (ctx: Context, user: User, status: number) =>
  json({ name: user.name, settings: user.settings }, status, { 'set-cookie': await sessionCookie(ctx.secret, user.name, ctx.secure) })

const signedIn = (run: (ctx: Context, user: User) => Promise<Response>) => async (ctx: Context) => {
  const name = await sessionUser(ctx.req, ctx.secret)
  const user = name === null ? null : await ctx.store.get(keys.user(name))
  return isUser(user) ? run(ctx, user) : refuse(401, 'Sign in first')
}

async function signup(ctx: Context) {
  const { username, password } = await credentials(ctx.req)
  if (isUser(await ctx.store.get(keys.user(username)))) return refuse(409, 'That name is taken')
  const user = await newUser(username, password, DEFAULT_SETTINGS)
  await ctx.store.set(keys.user(user.name), user)
  return signIn(ctx, user, 201)
}

async function login(ctx: Context) {
  const { username, password } = await credentials(ctx.req)
  const user = await ctx.store.get(keys.user(username))
  if (!isUser(user) || !(await passwordMatches(password, user))) return refuse(401, 'Wrong username or password')
  return signIn(ctx, user, 200)
}

const logout = () => Promise.resolve(json({ ok: true }, 200, { 'set-cookie': CLEAR_COOKIE }))

const session = async (ctx: Context) => json({ signedIn: (await sessionUser(ctx.req, ctx.secret)) !== null })

async function leaderboard(ctx: Context) {
  const [slug = '', difficulty] = ctx.params
  if (!isDifficulty(difficulty)) return refuse(404, 'No such route')
  return json(await read(ctx.store, keys.board(slug, difficulty), isRows, []))
}

const me = signedIn(async (ctx, user) =>
  json({
    name: user.name,
    settings: user.settings,
    bests: await read(ctx.store, keys.bests(user.name), isBests, {}),
    history: (await read(ctx.store, keys.history(user.name), isRows, [])).slice(0, HISTORY_SHOWN),
  }),
)

const settings = signedIn(async (ctx, user) => {
  const next = settingsFrom(await bodyOf(ctx.req), user.settings)
  await ctx.store.set(keys.user(user.name), { ...user, settings: next })
  return json(next)
})

const submit = signedIn(async (ctx, user) => {
  const { notes, ...submission } = submissionOf(await bodyOf(ctx.req))
  const row: ScoreRow = { ...submission, user: user.name, ...scoreOf(submission.counts, notes), at: new Date().toISOString() }
  const history = await read(ctx.store, keys.history(user.name), isRows, [])
  await ctx.store.set(keys.history(user.name), [row, ...history].slice(0, HISTORY_KEPT))
  const bests = await read(ctx.store, keys.bests(user.name), isBests, {})
  const previous = bests[chartOf(row)]
  const personalBest = previous === undefined || row.score > previous.score
  if (personalBest) await ctx.store.set(keys.bests(user.name), { ...bests, [chartOf(row)]: row })
  const placed = placeOnBoard(await read(ctx.store, keys.board(row.slug, row.difficulty), isRows, []), row)
  await ctx.store.set(keys.board(row.slug, row.difficulty), placed.board)
  return json({ row, personalBest, previousBest: personalBest ? null : previous, rank: placed.rank })
})

const ROUTES: readonly Route[] = [
  { method: 'POST', path: /^\/signup$/, run: signup },
  { method: 'POST', path: /^\/login$/, run: login },
  { method: 'POST', path: /^\/logout$/, run: logout },
  { method: 'GET', path: /^\/session$/, run: session },
  { method: 'GET', path: new RegExp(`^/leaderboard/([a-z0-9-]+)/(${DIFFICULTIES.join('|')})$`), run: leaderboard },
  { method: 'GET', path: /^\/me$/, run: me },
  { method: 'PUT', path: /^\/me\/settings$/, run: settings },
  { method: 'POST', path: /^\/scores$/, run: submit },
]

async function answered(response: Promise<Response>): Promise<Response> {
  try {
    return await response
  } catch (error) {
    if (error instanceof Refusal) return json({ error: error.message }, error.status)
    throw error
  }
}

export function handle(req: Request, store: Store, secret: string): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '')
  for (const route of ROUTES) {
    const match = req.method === route.method ? route.path.exec(path) : null
    if (match !== null) return answered(route.run({ req, store, secret, secure: url.protocol === 'https:', params: match.slice(1) }))
  }
  return Promise.resolve(json({ error: 'No such route' }, 404))
}
