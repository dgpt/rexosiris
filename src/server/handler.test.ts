import { describe, expect, test } from 'bun:test'
import index from '../shared/chart-index.json'
import { handle, type Store } from './handler'

const memStore = (): Store => {
  const m = new Map<string, unknown>()
  return {
    get: (k) => Promise.resolve(m.get(k) ?? null),
    set: (k, v) => { m.set(k, structuredClone(v)); return Promise.resolve() },
  }
}

const [song] = index
if (song === undefined) throw new Error('chart index is empty: run bun run charts first')
const easy = song.notes.easy

function client(store = memStore()) {
  let cookie = ''
  const req = async (method: string, path: string, body?: unknown) => {
    const init = { method, headers: { 'content-type': 'application/json', cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }
    const res = await handle(new Request(`http://x/api${path}`, init), store, 'test-secret')
    const set = res.headers.get('set-cookie')
    if (set !== null) cookie = set.split(';')[0] ?? ''
    const parsed: unknown = await res.json()
    return { status: res.status, body: parsed }
  }
  return { req, store }
}

const counts = (perfect: number, miss: number) => ({ perfect, great: 0, good: 0, miss })

describe('accounts', () => {
  test('a new player signs up, is signed in, and can read their own profile', async () => {
    const c = client()
    expect((await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })).status).toBe(201)
    const me = await c.req('GET', '/me')
    expect(me.body).toMatchObject({ name: 'spencer', settings: { offsetMs: 0, speed: 0.5 } })
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
    expect((await c.req('GET', '/me')).body).toMatchObject({ settings: { offsetMs: -42, speed: 1.5 } })
  })
})

describe('scores', () => {
  test('a score is recomputed by the server from the judgment counts, not trusted from the client', async () => {
    const c = client()
    await c.req('POST', '/signup', { username: 'spencer', password: 'hunter222' })
    const r = await c.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true, score: 1 })
    expect(r.body).toMatchObject({ row: { score: 1_000_000, grade: 'SS' }, personalBest: true, rank: 1 })
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
    expect(worse.body).toMatchObject({ personalBest: false })
    const rival = client(c.store)
    await rival.req('POST', '/signup', { username: 'rival', password: 'hunter222' })
    await rival.req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true })
    const board = (await c.req('GET', `/leaderboard/${song.slug}/easy`)).body
    expect(board).toMatchObject([{ user: 'rival' }, { user: 'spencer', counts: { miss: 20 } }])
  })

  test('submitting needs a signed-in player', async () => {
    expect((await client().req('POST', '/scores', { slug: song.slug, difficulty: 'easy', counts: counts(easy, 0), maxCombo: easy, cleared: true })).status).toBe(401)
  })
})
