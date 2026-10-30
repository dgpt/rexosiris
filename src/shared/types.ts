import type { Difficulty, Note, Section } from './analyze'

export type SongChart = {
  slug: string
  album: string
  title: string
  artist?: string
  bpm: number
  firstBeat: number
  duration: number
  charts: Record<Difficulty, Note[]>
  sections?: Section[]
}

export type ChartIndexEntry = {
  slug: string
  album: string
  title: string
  artist: string
  track: number | null
  bpm: number
  duration: number
  notes: Record<Difficulty, number>
  voices?: string[]
  holds?: Record<Difficulty, number>
}

export type Judgment = 'perfect' | 'great' | 'good' | 'miss'
export const JUDGMENTS: Judgment[] = ['perfect', 'great', 'good', 'miss']
export const WINDOWS_MS: Record<Exclude<Judgment, 'miss'>, number> = { perfect: 45, great: 90, good: 135 }
export const WEIGHT: Record<Judgment, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 }

export type Counts = Record<Judgment, number>

export type ScoreSubmission = { slug: string; difficulty: Difficulty; counts: Counts; maxCombo: number; cleared: boolean }

export type ScoreRow = ScoreSubmission & { user: string; score: number; accuracy: number; grade: string; at: string }

export function scoreOf(counts: Counts, total: number) {
  const earned = JUDGMENTS.reduce((s, j) => s + counts[j] * WEIGHT[j], 0)
  const accuracy = total === 0 ? 0 : earned / total
  return { score: Math.round(accuracy * 1_000_000), accuracy, grade: gradeOf(accuracy, counts.miss) }
}

export function gradeOf(accuracy: number, misses: number) {
  if (accuracy >= 0.99 && misses === 0) return 'SS'
  if (accuracy >= 0.95) return 'S'
  if (accuracy >= 0.9) return 'A'
  if (accuracy >= 0.8) return 'B'
  if (accuracy >= 0.7) return 'C'
  return 'D'
}

export type TrackMeta = {
  file: string
  slug: string
  title: string
  artist: string
  album: string
  track: number | null
}
