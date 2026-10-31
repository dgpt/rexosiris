import type { Note } from '../../src/shared/analyze'
import { fluxAt, type OnsetCurve } from './onsets'
import type { Placed } from './notes'

export type Candidate = { readonly file: string; readonly placed: Placed }
export type Scored = Candidate & { readonly attack: number; readonly coverage: number }

const WINDOW_SECONDS = 4
const QUIET_OF_LOUDEST = 0.1
const MIN_COVERAGE = 0.9
const LONGEST_HOLD_SECONDS = 12
const ATTACK_REACH = 0.025
const ATTACK_STEP = 0.001
const STRONG_QUANTILE = 0.95

export function loudWindows(pcm: Float32Array, sampleRate: number): boolean[] {
  const size = WINDOW_SECONDS * sampleRate
  const rms: number[] = []
  for (let start = 0; start + size <= pcm.length; start += size) {
    let energy = 0
    for (let i = start; i < start + size; i++) energy += (pcm[i] ?? 0) ** 2
    rms.push(Math.sqrt(energy / size))
  }
  const loudest = rms.toSorted((a, b) => a - b)[Math.floor(rms.length * 0.9)] ?? 0
  return rms.map((r) => r >= QUIET_OF_LOUDEST * loudest)
}

function coverage(notes: readonly Note[], loud: readonly boolean[]): number {
  const struck = new Set(notes.map((n) => Math.floor(n.t / WINDOW_SECONDS)))
  const active = loud.flatMap((isLoud, w) => (isLoud ? [w] : []))
  return active.filter((w) => struck.has(w)).length / Math.max(1, active.length)
}

function attack(notes: readonly Note[], curve: OnsetCurve, strong: number): number {
  const strength = (t: number) => {
    let peak = 0
    for (let d = -ATTACK_REACH; d <= ATTACK_REACH; d += ATTACK_STEP) peak = Math.max(peak, fluxAt(curve, t + d))
    return Math.min(1, peak / strong)
  }
  return notes.reduce((total, n) => total + strength(n.t), 0) / Math.max(1, notes.length)
}

export const strongFlux = (curve: OnsetCurve) => Float32Array.from(curve.flux).toSorted()[Math.floor(curve.flux.length * STRONG_QUANTILE)] ?? 1

export const scored = (candidate: Candidate, curve: OnsetCurve, strong: number, loud: readonly boolean[]): Scored => ({
  file: candidate.file,
  placed: candidate.placed,
  attack: attack(candidate.placed.notes, curve, strong),
  coverage: coverage(candidate.placed.notes, loud),
})

export const longestHold = (notes: readonly Note[]) => Math.max(0, ...notes.map((n) => n.len ?? 0))

export const playable = (c: Scored) => c.coverage >= MIN_COVERAGE && longestHold(c.placed.notes) <= LONGEST_HOLD_SECONDS

export const best = (candidates: readonly Scored[]): Scored | undefined => candidates.filter((c) => playable(c)).toSorted((a, b) => b.attack - a.attack)[0]
