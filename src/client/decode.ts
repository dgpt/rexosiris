import { DIFFICULTIES } from '../shared/analyze'
import { isArrayOf, isDifficulty, isNumber, isRecord, isRecordOf, isScoreRow, isSettings, isString, type Guard, type Settings } from '../shared/guards'
import type { ChartIndexEntry, ScoreRow, SongChart } from '../shared/types'

export { isDifficulty, isRecord, isSettings, type Settings }
export type Me = {
  readonly name: string
  readonly settings: Settings
  readonly bests: Readonly<Record<string, ScoreRow>>
  readonly history: readonly ScoreRow[]
}
export type SubmitResult = { readonly personalBest: boolean; readonly previousBest: ScoreRow | null; readonly rank: number | null }

export const isMe = (v: unknown): v is Me =>
  isRecord(v) && isString(v['name']) && isSettings(v['settings']) && isRecordOf(isScoreRow)(v['bests']) && isArrayOf(isScoreRow)(v['history'])

export const isSubmitResult = (v: unknown): v is SubmitResult =>
  isRecord(v) && typeof v['personalBest'] === 'boolean' && (v['previousBest'] === null || isScoreRow(v['previousBest'])) && (v['rank'] === null || isNumber(v['rank']))

export const isIndexEntry = (v: unknown): v is ChartIndexEntry =>
  isRecord(v) && isString(v['slug']) && isString(v['title']) && isString(v['album']) && isNumber(v['bpm']) && isNumber(v['duration']) && isRecord(v['notes'])

const hasEveryChart = (v: unknown) => isRecord(v) && DIFFICULTIES.every((d) => Array.isArray(v[d]))

export const isSongChart = (v: unknown): v is SongChart =>
  isRecord(v) && isString(v['slug']) && isString(v['title']) && isNumber(v['bpm']) && isNumber(v['firstBeat']) && isNumber(v['duration']) && hasEveryChart(v['charts'])

export const isLeaderboard = isArrayOf(isScoreRow)
export const isIndex = isArrayOf(isIndexEntry)
export const isSession = (v: unknown): v is { signedIn: boolean } => isRecord(v) && typeof v['signedIn'] === 'boolean'

export function decode<T>(value: unknown, guard: Guard<T>, what: string): T {
  if (!guard(value)) throw new TypeError(`The server sent a ${what} this page does not understand`)
  return value
}
