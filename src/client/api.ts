import type { Difficulty } from '../shared/analyze'
import type { ScoreRow, ScoreSubmission } from '../shared/types'

export type Settings = { offsetMs: number; speed: number }
export type Me = { name: string; settings: Settings; bests: Record<string, ScoreRow>; history: ScoreRow[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  me: () => call<Me>('GET', '/me'),
  signup: (username: string, password: string) => call<{ name: string }>('POST', '/signup', { username, password }),
  login: (username: string, password: string) => call<{ name: string }>('POST', '/login', { username, password }),
  logout: () => call('POST', '/logout'),
  settings: (s: Partial<Settings>) => call<Settings>('PUT', '/me/settings', s),
  submit: (s: ScoreSubmission) => call<{ row: ScoreRow; personalBest: boolean; previousBest: ScoreRow | null; rank: number | null }>('POST', '/scores', s),
  leaderboard: (slug: string, d: Difficulty) => call<ScoreRow[]>('GET', `/leaderboard/${slug}/${d}`),
}
