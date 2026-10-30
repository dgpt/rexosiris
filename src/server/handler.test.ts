import { describe, expect, test } from 'bun:test'
import { handle, type Store } from './handler'
import index from '../shared/chart-index.json'

const memStore = (): Store => {
  const m = new Map<string, string>()
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : null), set: async (k, v) => void m.set(k, JSON.stringify(v)) }
}

const song = index[0]!
const easy = song.notes.easy

function client(store = memStore()) {
  let cookie = ''
  const req = async (method: string, path: string, body?: unknown) => {
    const res = await handle(new Request(`http://x/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) }), store, 'test-secret')
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]!
    return { status: res.status, body: (await res.json()) as any }
  }
  return { req, store }
}

const counts = (perfect: number, miss: number) => ({ perfect, great: 0, good: 0, miss })

describe('accounts', () => {
  test('a new player signs up, is signed in, and can read their own profile', async () => {
    const c = client()
    expect((await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })).status).toBe(201)
    const me = await c.req('GET', '/me')
    expect(me.body.name).toBe('spencer')
    expect(me.body.settings).toEqual({ offsetMs: 0, speed: 1 })
  })

  test('a taken name is refused, case-insensitively', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    expect((await client(c.store).req('POST', '/signup', { username: 'SPENCER', password: 'other1234' })).status).toBe(409)
  })

  test('a wrong password does not sign in, the right one does', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    const other = client(c.store)
    expect((await other.req('POST', '/login', { username: 'spencer', password: 'nope12345' })).status).toBe(401)
    expect((await other.req('GET', '/me')).status).toBe(401)
    expect((await other.req('POST', '/login', { username: 'spencer', password: 'hunter222' })).status).toBe(200)
    expect((await other.req('GET', '/me')).status).toBe(200)
  })

  test('a forged session cookie is refused', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    const res = await handle(new Request('http://x/api/me', { headers: { cookie: `sess=spencer.${Date.now() + 1e9}.forged` } }), c.store, 'test-secret')
    expect(res.status).toBe(401)
  })

  test('settings are validated and saved', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    expect((await c.req('PUT', '/me/settings', { offsetMs: 900 })).status).toBe(400)
    expect((await c.req('PUT', '/me/settings', { offsetMs: -42, speed: 1.5 })).body).toEqual({ offsetMs: -42, speed: 1.5 })
    expect((await c.req('GET', '/me')).body.settings).toEqual({ offsetMs: -42, speed: 1.5 })
  })
})

describe('scores', () => {
  test('a score is recomputed by the server from the judgment counts, not trusted from the client', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    const r = await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true, score: 1 })
    expect(r.body.row.score).toBe(1_000_000)
    expect(r.body.row.grade).toBe('SS')
    expect(r.body.personalBest).toBe(true)
    expect(r.body.rank).toBe(1)
  })

  test('counts that do not add up to the chart\'s notes are refused', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    const r = await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy + 50, 0), maxCombo: 10, cleared: true })
    expect(r.status).toBe(400)
  })

  test('a combo longer than the hits allow is refused', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    expect((await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy - 10, 10), maxCombo: easy, cleared: true })).status).toBe(400)
  })

  test('a worse run keeps the personal best, and the leaderboard holds one row per player, best first', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy - 20, 20), maxCombo: 50, cleared: true })
    const worse = await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy - 60, 60), maxCombo: 30, cleared: true })
    expect(worse.body.personalBest).toBe(false)
    const rival = client(c.store)
    await rival.req('POST', '/signup', { username: 'rival', password: 'hunter222' })
    await rival.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true })
    const board = (await c.req('GET', `/leaderboard/${song.slug}/easy`)).body
    expect(board.map((r: any) => r.user)).toEqual(['rival', 'spencer'])
    expect(board[1].counts.miss).toBe(20)
  })

  test('submitting needs a signed-in player', async () => {
    expect((await client().req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true })).status).toBe(401)
  })
})
