import { beatLength, sample, sum } from './model'

export type Grid = { readonly bpm: number; readonly phase: number }

const TEMPO_RANGE = { min: 75, max: 185, step: 0.25 }
const PREFERRED_BPM = 125
const LAG_MULTIPLES = [1, 2, 4]
const REFINE_SEARCH_SECONDS = 0.06
const REFINE_MIN_ONSET = 0.15
const REFINE_MIN_BEATS = 8
const REFINE_MAX_DRIFT_BPM = 2

function autocorrelation(centered: Float32Array, lag: number) {
  const whole = Math.floor(lag)
  const frac = lag - whole
  let acc = 0
  for (let i = 0; i + whole + 1 < centered.length; i++) {
    acc += sample(centered, i) * (sample(centered, i + whole) * (1 - frac) + sample(centered, i + whole + 1) * frac)
  }
  return acc
}

const tempoPrior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / PREFERRED_BPM) / 0.9) ** 2)

export function estimateTempo(envelope: Float32Array, fps: number): number {
  const mean = sum(envelope) / Math.max(1, envelope.length)
  const centered = envelope.map((v) => v - mean)
  let best = { bpm: PREFERRED_BPM, score: -Infinity }
  for (let bpm = TEMPO_RANGE.min; bpm <= TEMPO_RANGE.max; bpm += TEMPO_RANGE.step) {
    const lag = beatLength(bpm) * fps
    const score = tempoPrior(bpm) * sum(LAG_MULTIPLES.map((m) => autocorrelation(centered, lag * m) / m))
    if (score > best.score) best = { bpm, score }
  }
  return Math.round(best.bpm * 4) / 4
}

const peakNear = (envelope: Float32Array, i: number) =>
  Math.max(sample(envelope, i), 0.6 * sample(envelope, i - 1), 0.6 * sample(envelope, i + 1))

export function estimatePhase(envelope: Float32Array, fps: number, bpm: number): number {
  const period = beatLength(bpm) * fps
  let best = { phase: 0, score: -Infinity }
  for (let phase = 0; phase < period; phase += 0.5) {
    let score = 0
    for (let t = phase; t < envelope.length; t += period) score += peakNear(envelope, Math.round(t))
    if (score > best.score) best = { phase, score }
  }
  return best.phase / fps
}

function strongestNear(envelope: Float32Array, center: number, radius: number) {
  let best = { value: -1, at: center }
  for (let i = center - radius; i <= center + radius; i++) {
    const value = envelope[i] ?? -1
    if (value > best.value) best = { value, at: i }
  }
  return best
}

function fitLine(xs: readonly number[], ys: readonly number[]) {
  const mx = sum(xs) / xs.length
  const my = sum(ys) / ys.length
  let sxy = 0
  let sxx = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * ((ys[i] ?? my) - my)
    sxx += (x - mx) ** 2
  })
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

function refineOnce(envelope: Float32Array, fps: number, grid: Grid): Grid {
  const period = beatLength(grid.bpm) * fps
  const radius = Math.max(2, Math.round(REFINE_SEARCH_SECONDS * fps))
  const beats: number[] = []
  const times: number[] = []
  for (let k = 0; grid.phase * fps + k * period < envelope.length; k++) {
    const peak = strongestNear(envelope, Math.round(grid.phase * fps + k * period), radius)
    if (peak.value > REFINE_MIN_ONSET) {
      beats.push(k)
      times.push(peak.at / fps)
    }
  }
  if (beats.length < REFINE_MIN_BEATS) return grid
  const { slope, intercept } = fitLine(beats, times)
  if (slope <= 0 || Math.abs(60 / slope - grid.bpm) > REFINE_MAX_DRIFT_BPM) return grid
  const phase = intercept - Math.floor(intercept / slope) * slope
  return { bpm: 60 / slope, phase }
}

export function refineGrid(envelope: Float32Array, fps: number, grid: Grid): Grid {
  return [1, 2, 3].reduce((g) => refineOnce(envelope, fps, g), grid)
}
