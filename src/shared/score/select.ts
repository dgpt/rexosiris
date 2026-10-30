import { type ScoreGrid, strengthOf } from './metric'
import type { VoiceNote } from './voices'

export type Profile = {
  readonly minGap: number
  readonly minGapSeconds: number
  readonly jackGap: number
  readonly holdMin: number
  readonly fillAfter: number | null
}


export function thin(notes: readonly VoiceNote[], grid: ScoreGrid, minGap: number, keep: readonly VoiceNote[] = []): VoiceNote[] {
  const gap = minGap * grid.beat * 0.98
  const kept: VoiceNote[] = [...keep]
  const ranked = notes.toSorted((a, b) => strengthOf(grid, b.t) - strengthOf(grid, a.t) || b.velocity - a.velocity || a.t - b.t)
  for (const note of ranked) {
    if (kept.every((k) => Math.abs(k.t - note.t) >= gap)) kept.push(note)
  }
  return kept.slice(keep.length).toSorted((a, b) => a.t - b.t)
}

const MUSICAL_GAPS = [0.25, 0.5, 1, 2, 4]

export function gapInBeats(profile: Profile, beat: number) {
  const needed = Math.max(profile.minGap, profile.minGapSeconds / beat)
  return MUSICAL_GAPS.find((g) => g >= needed * 0.98) ?? needed
}
