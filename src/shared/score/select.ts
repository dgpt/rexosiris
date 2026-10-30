import type { Analysis } from '../analysis/model'
import { framesPerSecond } from '../analysis/model'
import { type ScoreGrid, strengthOf } from './metric'
import type { VoiceKind, VoiceNote } from './voices'

export type Profile = {
  readonly minGap: number
  readonly minGapSeconds: number
  readonly jackGap: number
  readonly holdMin: number
  readonly fillAfter: number | null
}

export const KIND_WEIGHT: Readonly<Record<VoiceKind, number>> = { lead: 1.2, snare: 1.05, kick: 1, bass: 0.95, chords: 0.9, perc: 0.7, hats: 0.55 }
const PEAK_REACH_FRAMES = 2

export function thin(notes: readonly VoiceNote[], grid: ScoreGrid, minGap: number, keep: readonly VoiceNote[] = []): VoiceNote[] {
  const gap = minGap * grid.beat * 0.98
  const kept: VoiceNote[] = [...keep]
  const ranked = notes.toSorted((a, b) => strengthOf(grid, b.t) - strengthOf(grid, a.t) || b.velocity - a.velocity || a.t - b.t)
  for (const note of ranked) {
    if (kept.every((k) => Math.abs(k.t - note.t) >= gap)) kept.push(note)
  }
  return kept.slice(keep.length).toSorted((a, b) => a.t - b.t)
}

function peakAt(envelope: Float32Array, frame: number) {
  let peak = 0
  for (let k = -PEAK_REACH_FRAMES; k <= PEAK_REACH_FRAMES; k++) peak = Math.max(peak, envelope[frame + k] ?? 0)
  return peak
}

export function audibility(audio: Analysis, notes: readonly VoiceNote[], window: { readonly from: number; readonly to: number }) {
  if (notes.length === 0) return 0
  const fps = framesPerSecond(audio.sampleRate)
  const from = Math.max(0, Math.floor(window.from * fps))
  const to = Math.min(audio.envelope.length, Math.ceil(window.to * fps))
  let base = 0
  for (let f = from; f < to; f++) base += audio.envelope[f] ?? 0
  base /= Math.max(1, to - from)
  const atNotes = notes.reduce((total, n) => total + peakAt(audio.envelope, Math.round(n.t * fps)), 0) / notes.length
  return base > 0 ? atNotes / base : 0
}

const MUSICAL_GAPS = [0.25, 0.5, 1, 2, 4]

export function gapInBeats(profile: Profile, beat: number) {
  const needed = Math.max(profile.minGap, profile.minGapSeconds / beat)
  return MUSICAL_GAPS.find((g) => g >= needed * 0.98) ?? needed
}
