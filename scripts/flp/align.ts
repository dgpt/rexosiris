import { analyze } from '../../src/shared/analyze'
import { framesPerSecond, onsetLag } from '../../src/shared/analysis/model'
import type { ProjectNote } from './timeline'

export type Onsets = { readonly envelope: Float32Array; readonly fps: number; readonly lag: number; readonly strong: number; readonly duration: number; readonly bpm: number }
export type Alignment = { readonly scale: number; readonly offset: number; readonly contrast: number; readonly hitRate: number; readonly drift: number }

const SEARCH_SECONDS = { from: -4, to: 12 }
const HIT_WINDOW_SECONDS = 0.025
const STRONG_ONSET_QUANTILE = 0.85
const SCALES = [0.5, 1] as const

export function onsetsOf(pcm: Float32Array, sampleRate: number): Onsets {
  const { envelope, duration, bpm } = analyze(pcm, sampleRate)
  const sorted = Array.from(envelope).toSorted((a, b) => a - b)
  return { envelope, fps: framesPerSecond(sampleRate), lag: onsetLag(sampleRate), strong: sorted[Math.floor(sorted.length * STRONG_ONSET_QUANTILE)] ?? 0, duration, bpm }
}

function framesOf(notes: readonly ProjectNote[], fps: number, scale: number) {
  return [...new Set(notes.map((note) => Math.round(note.t * scale * fps)))]
}

function bestLag(onsets: Onsets, frames: readonly number[]) {
  const scores: number[] = []
  let best = { lag: 0, score: -Infinity }
  for (let lag = Math.round(SEARCH_SECONDS.from * onsets.fps); lag <= Math.round(SEARCH_SECONDS.to * onsets.fps); lag++) {
    let score = 0
    for (const f of frames) score += onsets.envelope[f + lag] ?? 0
    scores.push(score)
    if (score > best.score) best = { lag, score }
  }
  const median = scores.toSorted((a, b) => a - b)[Math.floor(scores.length / 2)] ?? 0
  return { lag: best.lag, contrast: median > 0 ? best.score / median : 0 }
}

function hitRate(onsets: Onsets, frames: readonly number[], lag: number) {
  const reach = Math.ceil(HIT_WINDOW_SECONDS * onsets.fps)
  let hits = 0
  for (const f of frames) {
    let peak = 0
    for (let k = -reach; k <= reach; k++) peak = Math.max(peak, onsets.envelope[f + lag + k] ?? 0)
    if (peak >= onsets.strong) hits += 1
  }
  return frames.length === 0 ? 0 : hits / frames.length
}

function alignAt(onsets: Onsets, notes: readonly ProjectNote[], scale: number): Alignment {
  const frames = framesOf(notes, onsets.fps, scale)
  const half = onsets.envelope.length / 2
  const whole = bestLag(onsets, frames)
  const first = bestLag(onsets, frames.filter((f) => f < half))
  const second = bestLag(onsets, frames.filter((f) => f >= half))
  return { scale, offset: whole.lag / onsets.fps + onsets.lag, contrast: whole.contrast, hitRate: hitRate(onsets, frames, whole.lag), drift: (second.lag - first.lag) / onsets.fps }
}

export function align(onsets: Onsets, notes: readonly ProjectNote[]): Alignment {
  const end = Math.max(0, ...notes.map((n) => n.t + n.length))
  const plausible = SCALES.filter((scale) => Math.abs(end * scale - onsets.duration) < onsets.duration * 0.35)
  const tried = plausible.map((scale) => alignAt(onsets, notes, scale))
  return tried.toSorted((a, b) => b.contrast - a.contrast)[0] ?? { scale: 0, offset: 0, contrast: 0, hitRate: 0, drift: Infinity }
}

const TEMPO_RATIOS = [0.5, 1, 2, 4]
const TEMPO_TOLERANCE = 0.015

export const tempoFits = (projectTempo: number, songBpm: number) =>
  TEMPO_RATIOS.some((r) => Math.abs(projectTempo / (songBpm * r) - 1) < TEMPO_TOLERANCE)
