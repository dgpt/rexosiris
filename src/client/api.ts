import type { Difficulty } from '../shared/analyze'
import type { ScoreSubmission } from '../shared/types'
import { decode, isLeaderboard, isMe, isRecord, isSession, isSettings, isSubmitResult, type Settings } from './decode'

type Method = 'GET' | 'POST' | 'PUT'

async function call(method: Method, path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, init)
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = isRecord(data) && typeof data['error'] === 'string' ? data['error'] : `HTTP ${res.status}`
    throw new Error(message)
  }
  return data
}

export const api = {
  session: async () => decode(await call('GET', '/session'), isSession, 'session').signedIn,
  me: async () => decode(await call('GET', '/me'), isMe, 'profile'),
  signup: (username: string, password: string) => call('POST', '/signup', { username, password }),
  login: (username: string, password: string) => call('POST', '/login', { username, password }),
  logout: () => call('POST', '/logout'),
  settings: async (patch: Partial<Settings>) => decode(await call('PUT', '/me/settings', patch), isSettings, 'settings'),
  submit: async (run: ScoreSubmission) => decode(await call('POST', '/scores', run), isSubmitResult, 'score receipt'),
  leaderboard: async (slug: string, difficulty: Difficulty) =>
    decode(await call('GET', `/leaderboard/${slug}/${difficulty}`), isLeaderboard, 'leaderboard'),
}
