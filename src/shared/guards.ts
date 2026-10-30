import { DIFFICULTIES, type Difficulty } from './analysis/model'
import { JUDGMENTS, type Counts, type ScoreRow } from './types'

export type Guard<T> = (value: unknown) => value is T
export type Settings = { readonly offsetMs: number; readonly speed: number }

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const isString = (v: unknown): v is string => typeof v === 'string'
export const isWhole = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v >= 0
export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.some((d) => d === v)
export const isArrayOf = <T>(guard: Guard<T>) => (v: unknown): v is T[] => Array.isArray(v) && v.every((x) => guard(x))
export const isRecordOf = <T>(guard: Guard<T>) => (v: unknown): v is Record<string, T> => isRecord(v) && Object.values(v).every((x) => guard(x))

export const isSettings = (v: unknown): v is Settings => isRecord(v) && isNumber(v['offsetMs']) && isNumber(v['speed'])
export const isCounts = (v: unknown): v is Counts => isRecord(v) && JUDGMENTS.every((j) => isWhole(v[j]))

export const isScoreRow = (v: unknown): v is ScoreRow =>
  isRecord(v) && isString(v['user']) && isString(v['slug']) && isDifficulty(v['difficulty']) && isCounts(v['counts'])
  && isNumber(v['maxCombo']) && isNumber(v['score']) && isNumber(v['accuracy']) && isString(v['grade']) && isString(v['at'])
