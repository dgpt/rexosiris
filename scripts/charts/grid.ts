import { fluxAt, type OnsetCurve } from './onsets'
import type { TimingPoint } from './osu'

export type Grid = { readonly beat: number; readonly firstBeat: number }
export type Fit = { readonly grid: Grid; readonly tempoChange: number; readonly shift: number; readonly thirds: readonly number[] }

const LONG_SECTION_SECONDS = 10
const SAME_TEMPO = 0.005
const TEMPO_REACH = 0.005
const TEMPO_STEP = 0.00005
const PHASE_REACH = 0.06
const THIRD_REACH = 0.03
const PHASE_STEP = 0.0005
const SNAP_DIVISIONS = [8, 6] as const
const SNAP_REACH = 0.025

export const anchored = (beat: number, at: number): Grid => ({ beat, firstBeat: ((at % beat) + beat) % beat })

export function heard(points: readonly TimingPoint[], end: number): Grid {
  const sections = points.map((p, i) => ({ t: p.t, beat: p.beat, span: (points[i + 1]?.t ?? end) - p.t }))
  const longest = sections.toSorted((a, b) => b.span - a.span)[0]
  if (longest === undefined) throw new Error('the timing pass found no tempo')
  const anchors = sections.filter((s) => s === longest || (s.span >= LONG_SECTION_SECONDS && Math.abs(s.beat / longest.beat - 1) < SAME_TEMPO))
  const counts = anchors.map((s) => Math.round((s.t - longest.t) / longest.beat))
  const meanCount = counts.reduce((a, b) => a + b, 0) / anchors.length
  const meanT = anchors.reduce((a, s) => a + s.t, 0) / anchors.length
  const spread = counts.reduce((a, k) => a + (k - meanCount) ** 2, 0)
  const beat = spread === 0 ? longest.beat : anchors.reduce((a, s, i) => a + ((counts[i] ?? 0) - meanCount) * (s.t - meanT), 0) / spread
  return anchored(beat, meanT - beat * meanCount)
}

export function atOctaveOf(project: Grid, reference: Grid): Grid {
  const octave = 2 ** Math.round(Math.log2(project.beat / reference.beat))
  return anchored(project.beat / octave, project.firstBeat)
}

function beatsAround(middle: number, beat: number, from: number, to: number): number[] {
  const first = middle - Math.floor((middle - from) / beat) * beat
  return Array.from({ length: Math.max(0, Math.floor((to - first) / beat) + 1) }, (_, i) => first + i * beat)
}

function bestShift(curve: OnsetCurve, beats: readonly number[], reach: number) {
  let best = { shift: 0, score: -1 }
  for (let shift = -reach; shift <= reach + PHASE_STEP / 2; shift += PHASE_STEP) {
    const score = beats.reduce((total, t) => total + fluxAt(curve, t + shift), 0) / Math.max(1, beats.length)
    if (score > best.score) best = { shift, score }
  }
  return best
}

export function fitToOnsets(grid: Grid, curve: OnsetCurve): Fit {
  const count = Math.floor((curve.duration - grid.firstBeat) / grid.beat)
  const middle = grid.firstBeat + Math.floor(count / 2) * grid.beat
  let best = { beat: grid.beat, shift: 0, score: -1 }
  for (let change = -TEMPO_REACH; change <= TEMPO_REACH + TEMPO_STEP / 2; change += TEMPO_STEP) {
    const beat = grid.beat * (1 + change)
    const { shift, score } = bestShift(curve, beatsAround(middle, beat, 0.05, curve.duration - 0.1), PHASE_REACH)
    if (score > best.score) best = { beat, shift, score }
  }
  const fitted = anchored(best.beat, middle + best.shift)
  const third = curve.duration / 3
  const thirds = [0, 1, 2].map((i) => bestShift(curve, beatsAround(middle + best.shift, best.beat, i * third, (i + 1) * third), THIRD_REACH).shift)
  return { grid: fitted, tempoChange: best.beat / grid.beat - 1, shift: best.shift, thirds }
}

export function snap(t: number, grid: Grid): number | null {
  const nearest = SNAP_DIVISIONS.map((division) => {
    const step = grid.beat / division
    return grid.firstBeat + Math.round((t - grid.firstBeat) / step) * step
  }).toSorted((a, b) => Math.abs(a - t) - Math.abs(b - t))[0] ?? t
  return Math.abs(nearest - t) <= SNAP_REACH ? Math.round(nearest * 1000) / 1000 : null
}
