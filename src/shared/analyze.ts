// Audio → rhythm chart. Pure TypeScript so it runs both offline (Bun, over the
// album) and in the browser (Web Audio decode of a track the player uploads).

export const HOP = 256
const FRAME = 1024
const BANDS: [number, number][] = [[30, 180], [180, 1200], [1200, 5000], [5000, 11000]]

export type Lane = 0 | 1 | 2 | 3
export type Note = { t: number; lane: Lane }
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

export type Analysis = {
  sampleRate: number
  duration: number
  bpm: number
  firstBeat: number
  envelope: Float32Array
  bandFlux: Float32Array[]
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b]! * cr - im[b]! * ci
        const ti = re[b]! * ci + im[b]! * cr
        re[b] = re[a]! - tr; im[b] = im[a]! - ti
        re[a] = re[a]! + tr; im[a] = im[a]! + ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
}

export function analyze(pcm: Float32Array, sampleRate: number): Analysis {
  const frames = Math.max(0, Math.floor((pcm.length - FRAME) / HOP))
  const window = new Float64Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)))
  const binHz = sampleRate / FRAME
  const bandBins = BANDS.map(([lo, hi]) => [Math.max(1, Math.floor(lo / binHz)), Math.min(FRAME / 2, Math.ceil(hi / binHz))] as const)
  const prev = new Float64Array(FRAME / 2)
  const bandFlux = BANDS.map(() => new Float32Array(frames))
  const envelope = new Float32Array(frames)
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME)
  for (let f = 0; f < frames; f++) {
    const off = f * HOP
    for (let i = 0; i < FRAME; i++) { re[i] = (pcm[off + i] ?? 0) * window[i]!; im[i] = 0 }
    fft(re, im)
    let total = 0
    for (let b = 0; b < bandBins.length; b++) {
      const [lo, hi] = bandBins[b]!
      let flux = 0
      for (let k = lo; k < hi; k++) {
        const mag = Math.log1p(10 * Math.hypot(re[k]!, im[k]!))
        const d = mag - prev[k]!
        if (d > 0) flux += d
        prev[k] = mag
      }
      flux /= hi - lo
      bandFlux[b]![f] = flux
      total += flux
    }
    envelope[f] = total
  }
  normalize(envelope)
  bandFlux.forEach(normalize)
  const fps = sampleRate / HOP
  let bpm = estimateTempo(envelope, fps)
  let phase = estimatePhase(envelope, fps, bpm)
  for (let pass = 0; pass < 3; pass++) ({ bpm, phase } = refineGrid(envelope, fps, bpm, phase))
  return { sampleRate, duration: pcm.length / sampleRate, bpm, firstBeat: phase + frameCenter(sampleRate), envelope, bandFlux }
}

const frameCenter = (sampleRate: number) => FRAME / 2 / sampleRate

function normalize(x: Float32Array) {
  let max = 0
  for (const v of x) if (v > max) max = v
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] = x[i]! / max
}

export function estimateTempo(env: Float32Array, fps: number, minBpm = 75, maxBpm = 185): number {
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length)
  const c = env.map((v) => v - mean)
  let best = 120, bestScore = -Infinity
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const lag = (60 / bpm) * fps
    let s = 0
    for (const mult of [1, 2, 4]) {
      const L = lag * mult
      const l0 = Math.floor(L), frac = L - l0
      let acc = 0
      for (let i = 0; i + l0 + 1 < c.length; i++) acc += c[i]! * (c[i + l0]! * (1 - frac) + c[i + l0 + 1]! * frac)
      s += acc / mult
    }
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125) / 0.9, 2))
    s *= prior
    if (s > bestScore) { bestScore = s; best = bpm }
  }
  return Math.round(best * 4) / 4
}

export function estimatePhase(env: Float32Array, fps: number, bpm: number): number {
  const period = (60 / bpm) * fps
  let bestPhase = 0, bestScore = -Infinity
  for (let p = 0; p < period; p += 0.5) {
    let s = 0
    for (let t = p; t < env.length; t += period) {
      const i = Math.round(t)
      s += Math.max(env[i] ?? 0, 0.6 * (env[i - 1] ?? 0), 0.6 * (env[i + 1] ?? 0))
    }
    if (s > bestScore) { bestScore = s; bestPhase = p }
  }
  return bestPhase / fps
}

export function refineGrid(env: Float32Array, fps: number, bpm: number, phase: number) {
  const period = (60 / bpm) * fps
  const search = Math.max(2, Math.round(0.06 * fps))
  const ks: number[] = [], ts: number[] = []
  for (let k = 0; phase * fps + k * period < env.length; k++) {
    const c = Math.round(phase * fps + k * period)
    let best = -1, at = c
    for (let i = c - search; i <= c + search; i++) if ((env[i] ?? -1) > best) { best = env[i]!; at = i }
    if (best > 0.15) { ks.push(k); ts.push(at / fps) }
  }
  if (ks.length < 8) return { bpm, phase }
  const n = ks.length, mk = ks.reduce((a, b) => a + b) / n, mt = ts.reduce((a, b) => a + b) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (ks[i]! - mk) * (ts[i]! - mt); sxx += (ks[i]! - mk) ** 2 }
  const beat = sxy / sxx
  if (!(beat > 0) || Math.abs(60 / beat - bpm) > 2) return { bpm, phase }
  let first = mt - beat * mk
  while (first - beat >= 0) first -= beat
  return { bpm: 60 / beat, phase: first }
}

const DENSITY: Record<Difficulty, { subdiv: number; perSecond: number; chords: boolean }> = {
  easy: { subdiv: 1, perSecond: 1.3, chords: false },
  normal: { subdiv: 2, perSecond: 2.6, chords: false },
  hard: { subdiv: 4, perSecond: 4.6, chords: true },
}

export function chart(a: Analysis, difficulty: Difficulty): Note[] {
  const fps = a.sampleRate / HOP
  const { subdiv, perSecond, chords } = DENSITY[difficulty]
  const step = 60 / a.bpm / subdiv
  const tol = Math.max(1, Math.round(0.035 * fps))
  type Slot = { t: number; score: number; band: number; strong: boolean; index: number }
  const slots: Slot[] = []
  for (let index = 0, t = a.firstBeat; t < a.duration - 1; index++, t += step) {
    if (t < 1.5) continue
    const c = Math.round((t - frameCenter(a.sampleRate)) * fps)
    let score = 0, band = 0, bandBest = -1
    for (let i = c - tol; i <= c + tol; i++) score = Math.max(score, a.envelope[i] ?? 0)
    for (let b = 0; b < a.bandFlux.length; b++) {
      let v = 0
      for (let i = c - tol; i <= c + tol; i++) v = Math.max(v, a.bandFlux[b]![i] ?? 0)
      if (v > bandBest) { bandBest = v; band = b }
    }
    const onBeat = index % subdiv === 0
    slots.push({ t, score: score * (onBeat ? 1.25 : 1), band, strong: onBeat && index % (subdiv * 4) === 0, index })
  }
  const target = Math.round(perSecond * a.duration)
  const threshold = [...slots].sort((x, y) => y.score - x.score)[Math.min(slots.length - 1, target)]?.score ?? 0
  const floor = 0.08
  const notes: Note[] = []
  let last: Lane = 1, prevBand = -1
  for (const s of slots) {
    if (s.score < Math.max(threshold, floor)) continue
    let lane = laneFor(s.band, s.index, last, prevBand)
    if (difficulty === 'easy' && lane === last) lane = ((lane + 2) % 4) as Lane
    notes.push({ t: round3(s.t), lane })
    if (chords && s.strong && s.score > 0.6) notes.push({ t: round3(s.t), lane: ((lane + 2) % 4) as Lane })
    last = lane
    prevBand = s.band
  }
  return notes
}

function laneFor(band: number, index: number, last: Lane, prevBand: number): Lane {
  const home: Lane[][] = [[0, 3], [1, 0], [2, 1], [3, 2]]
  const options = home[band]!
  if (band === prevBand) return options[index % 2]!
  return options[0] === last ? options[1]! : options[0]!
}

const round3 = (x: number) => Math.round(x * 1000) / 1000
