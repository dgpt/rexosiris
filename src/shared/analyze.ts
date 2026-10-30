// Audio → rhythm chart. Pure TypeScript so it runs both offline (Bun, over the
// albums) and in the browser (a track the player uploads).
//
// Pipeline: spectral flux per instrument band → beat grid (tempo, phase,
// regression) → onsets per voice, snapped to the grid → 4-bar phrases → per
// phrase, follow the most salient voice (with hysteresis) → lanes from the
// hit's timbre within that voice, density from the phrase's energy.

export const HOP = 256
const FRAME = 1024

export const VOICES = [
  { name: 'kick', lo: 30, hi: 130 },
  { name: 'bass', lo: 130, hi: 400 },
  { name: 'snare', lo: 400, hi: 1600 },
  { name: 'lead', lo: 1600, hi: 4500 },
  { name: 'hats', lo: 4500, hi: 9000 },
  { name: 'air', lo: 9000, hi: 11000 },
] as const
export type VoiceName = (typeof VOICES)[number]['name']

export type Lane = 0 | 1 | 2 | 3
export type Quant = 4 | 8 | 16
export type Note = { t: number; lane: Lane; q?: Quant; len?: number }
export type Section = { t: number; voice: VoiceName; energy: number }
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

export type Analysis = {
  sampleRate: number
  duration: number
  bpm: number
  firstBeat: number
  envelope: Float32Array
  bandFlux: Float32Array[]
  bandCentroid: Float32Array[]
  bandLevel: Float32Array[]
  rms: Float32Array
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
  const bandBins = VOICES.map(({ lo, hi }) => [Math.max(1, Math.floor(lo / binHz)), Math.min(FRAME / 2, Math.ceil(hi / binHz))] as const)
  const prev = new Float64Array(FRAME / 2)
  const bandFlux = VOICES.map(() => new Float32Array(frames))
  const bandCentroid = VOICES.map(() => new Float32Array(frames))
  const bandLevel = VOICES.map(() => new Float32Array(frames))
  const envelope = new Float32Array(frames)
  const rms = new Float32Array(frames)
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME)
  for (let f = 0; f < frames; f++) {
    const off = f * HOP
    let sq = 0
    for (let i = 0; i < FRAME; i++) { const v = pcm[off + i] ?? 0; sq += v * v; re[i] = v * window[i]!; im[i] = 0 }
    rms[f] = Math.sqrt(sq / FRAME)
    fft(re, im)
    let total = 0
    for (let b = 0; b < bandBins.length; b++) {
      const [lo, hi] = bandBins[b]!
      let flux = 0, wsum = 0, msum = 0, level = 0
      for (let k = lo; k < hi; k++) {
        const mag = Math.log1p(10 * Math.hypot(re[k]!, im[k]!))
        level += mag
        const d = mag - prev[k]!
        if (d > 0) { flux += d; wsum += d * k }
        msum += d > 0 ? d : 0
        prev[k] = mag
      }
      bandFlux[b]![f] = flux / (hi - lo)
      bandLevel[b]![f] = level / (hi - lo)
      bandCentroid[b]![f] = msum > 0 ? (wsum / msum - lo) / Math.max(1, hi - lo) : 0.5
      total += flux / (hi - lo)
    }
    envelope[f] = total
  }
  normalize(envelope)
  bandFlux.forEach(normalize)
  normalize(rms)
  const fps = sampleRate / HOP
  let bpm = estimateTempo(envelope, fps)
  let phase = estimatePhase(envelope, fps, bpm)
  for (let pass = 0; pass < 3; pass++) ({ bpm, phase } = refineGrid(envelope, fps, bpm, phase))
  return { sampleRate, duration: pcm.length / sampleRate, bpm, firstBeat: phase + frameCenter(sampleRate), envelope, bandFlux, bandCentroid, bandLevel, rms }
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


type Hit = { t: number; slot: number; strength: number; timbre: number; voice: number; sustain: number }

export function voiceHits(a: Analysis, voice: number): Hit[] {
  const fps = a.sampleRate / HOP
  const flux = a.bandFlux[voice]!, cent = a.bandCentroid[voice]!
  const win = Math.round(0.5 * fps), minGap = Math.round(0.07 * fps)
  const out: Hit[] = []
  const step = 60 / a.bpm / 4
  const center = frameCenter(a.sampleRate)
  let last = -Infinity
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i]!
    if (v < 0.05 || v < flux[i - 1]! || v < flux[i + 1]!) continue
    let mean = 0, n = 0
    for (let j = Math.max(0, i - win); j < Math.min(flux.length, i + win); j++) { mean += flux[j]!; n++ }
    mean /= n
    if (v < mean * 1.5 + 0.04 || i - last < minGap) continue
    last = i
    const t = i / fps + center
    const slot = Math.round((t - a.firstBeat) / step)
    const snapped = a.firstBeat + slot * step
    if (Math.abs(snapped - t) > 0.045 || snapped < 1.2 || snapped > a.duration - 0.8) continue
    out.push({ t: snapped, slot, strength: v - mean, timbre: cent[i]!, voice, sustain: sustainAfter(a.bandLevel[voice]!, i, fps) })
  }
  return out
}

function sustainAfter(level: Float32Array, i: number, fps: number): number {
  const at = (k: number) => ((level[k - 1] ?? 0) + (level[k] ?? 0) + (level[k + 1] ?? 0)) / 3
  const ref = Math.max(at(i + 2), at(i + 4))
  const floor = Math.min(at(i - 4), at(i - 2))
  if (ref - floor < 0.03) return 0
  let j = i + 4
  const limit = Math.min(level.length - 1, i + Math.round(4 * fps))
  while (j < limit && at(j) >= floor + (ref - floor) * 0.4) j++
  return (j - i) / fps
}

const BEATS_PER_PHRASE = 16
const TARGET: Record<Difficulty, { grid: 1 | 2 | 4; perBeat: number; second: boolean; chords: boolean; holds: boolean }> = {
  easy: { grid: 1, perBeat: 0.55, second: false, chords: false, holds: false },
  normal: { grid: 2, perBeat: 1.05, second: false, chords: false, holds: true },
  hard: { grid: 4, perBeat: 1.9, second: true, chords: true, holds: true },
}

const VOICE_WEIGHT = [1.0, 0.85, 1.15, 1.2, 0.8, 0.45]

export function sections(a: Analysis, hits: Hit[][]): Section[] {
  const beat = 60 / a.bpm, fps = a.sampleRate / HOP
  const phraseLen = beat * BEATS_PER_PHRASE
  const count = Math.max(1, Math.ceil((a.duration - a.firstBeat) / phraseLen))
  const raw: number[][] = []
  for (let p = 0; p < count; p++) {
    const t0 = a.firstBeat + p * phraseLen, t1 = t0 + phraseLen
    raw.push(hits.map((hs) => {
      const inside = hs.filter((h) => h.t >= t0 && h.t < t1)
      const onEighth = inside.filter((h) => h.slot % 2 === 0).length
      const regular = inside.length ? onEighth / inside.length : 0
      return inside.reduce((x, h) => x + h.strength, 0) * (0.6 + 0.4 * regular)
    }))
  }
  const mean = VOICES.map((_, v) => Math.max(1e-6, raw.reduce((s, r) => s + r[v]!, 0) / count))
  const out: Section[] = []
  let current = -1
  raw.forEach((r, p) => {
    const t0 = a.firstBeat + p * phraseLen, t1 = t0 + phraseLen
    const score = r.map((sal, v) => (VOICE_WEIGHT[v]! * sal) / Math.sqrt(mean[v]!))
    let best = score.indexOf(Math.max(...score))
    if (current >= 0 && score[current]! * 1.3 >= score[best]! && r[current]! > 0) best = current
    current = best
    let e = 0, n = 0
    for (let i = Math.max(0, Math.floor(t0 * fps)); i < Math.min(a.rms.length, Math.floor(t1 * fps)); i++) { e += a.rms[i]!; n++ }
    out.push({ t: round3(Math.max(0, t0)), voice: VOICES[best]!.name, energy: n ? e / n : 0 })
  })
  const max = Math.max(...out.map((s) => s.energy), 1e-6)
  out.forEach((s) => (s.energy = Math.round((s.energy / max) * 100) / 100))
  return out
}

const LANE_SPREAD: Lane[][] = [[1], [1, 2], [0, 1, 3], [0, 1, 2, 3]]

export function laneBins(values: number[]): (v: number) => Lane {
  if (values.length === 0) return () => 1
  const sorted = [...values].sort((x, y) => x - y)
  const span = Math.max(1e-6, sorted[sorted.length - 1]! - sorted[0]!)
  const gaps = sorted.slice(1).map((v, i) => ({ at: (v + sorted[i]!) / 2, size: v - sorted[i]! }))
  const minGap = Math.max(0.035, span * 0.12)
  const cuts = gaps.filter((g) => g.size >= minGap).sort((x, y) => y.size - x.size).slice(0, 3).map((g) => g.at).sort((x, y) => x - y)
  if (cuts.length === 0) {
    const q = [0.25, 0.5, 0.75].map((f) => sorted[Math.floor(f * (sorted.length - 1))]!)
    return (v) => (v <= q[0]! ? 0 : v <= q[1]! ? 1 : v <= q[2]! ? 2 : 3)
  }
  const lanes = LANE_SPREAD[cuts.length]!
  return (v) => lanes[cuts.filter((c) => v > c).length]!
}

const PARTNER: Record<Lane, Lane> = { 0: 1, 1: 0, 2: 3, 3: 2 }

const quantOf = (slot: number): Quant => (slot % 4 === 0 ? 4 : slot % 2 === 0 ? 8 : 16)

export function chartWithSections(a: Analysis, difficulty: Difficulty): { notes: Note[]; sections: Section[] } {
  const hits = VOICES.map((_, v) => voiceHits(a, v))
  const secs = sections(a, hits)
  const beat = 60 / a.bpm
  const phraseLen = beat * BEATS_PER_PHRASE
  const { grid, perBeat, second, chords, holds } = TARGET[difficulty]
  const notes: Note[] = []
  let prevLane: Lane = 1, prevT = -1
  secs.forEach((sec, p) => {
    const t0 = a.firstBeat + p * phraseLen, t1 = t0 + phraseLen
    const vi = VOICES.findIndex((v) => v.name === sec.voice)
    const allowed = (h: Hit) => h.slot % (4 / grid) === 0
    const primary = hits[vi]!.filter((h) => h.t >= t0 && h.t < t1 && allowed(h))
    let pool = primary
    if (second) {
      const others = hits.map((hs, v) => ({ v, hs: hs.filter((h) => h.t >= t0 && h.t < t1 && h.slot % 2 === 0) })).filter((o) => o.v !== vi)
      const runner = others.sort((x, y) => y.hs.reduce((s, h) => s + h.strength, 0) - x.hs.reduce((s, h) => s + h.strength, 0))[0]
      if (runner) pool = [...primary, ...runner.hs.filter((h) => !primary.some((p2) => p2.slot === h.slot))]
    }
    const budget = Math.round(perBeat * BEATS_PER_PHRASE * (0.45 + 0.75 * sec.energy))
    const kept = [...pool].sort((x, y) => y.strength - x.strength).slice(0, budget).sort((x, y) => x.t - y.t)
    const maxGap = beat * (difficulty === 'easy' ? 4 : 2)
    const filler = hits.flatMap((hs) => hs.filter((h) => h.t >= t0 && h.t < t1 && allowed(h))).sort((x, y) => y.strength - x.strength)
    for (let pass = 0; pass < 8; pass++) {
      const edges = [t0 - beat, ...kept.map((h) => h.t), t1]
      let added = false
      for (let i = 0; i < edges.length - 1; i++) {
        if (edges[i + 1]! - edges[i]! <= maxGap || sec.energy < 0.18) continue
        const fill = filler.find((h) => h.t > edges[i]! + beat * 0.49 && h.t < edges[i + 1]! - beat * 0.49 && !kept.includes(h))
        if (fill) { kept.push(fill); added = true }
      }
      if (!added) break
      kept.sort((x, y) => x.t - y.t)
    }
    const bins = new Map<number, (v: number) => Lane>()
    for (const h of kept) {
      if (!bins.has(h.voice)) bins.set(h.voice, laneBins(kept.filter((k) => k.voice === h.voice).map((k) => k.timbre)))
      let lane = bins.get(h.voice)!(h.timbre)
      if (h.voice !== vi) lane = (3 - lane) as Lane
      const minGap = beat * (difficulty === 'easy' ? 1.01 : difficulty === 'normal' ? 0.6 : 0.3)
      if (lane === prevLane && h.t - prevT < minGap) lane = PARTNER[lane]
      if (h.t - prevT < 1e-3) continue
      const note: Note = { t: round3(h.t), lane, q: quantOf(h.slot) }
      if (holds && (h.voice === 1 || h.voice === 2 || h.voice === 3) && h.sustain >= beat * 1.2) note.len = round3(Math.min(4, Math.floor((h.sustain / beat) * 2) / 2) * beat)
      notes.push(note)
      if (chords && h.slot % 16 === 0 && h.strength > 0.35) notes.push({ t: round3(h.t), lane: ((lane + 2) % 4) as Lane, q: 4 })
      prevLane = lane
      prevT = h.t
    }
  })
  return { notes: trimHolds(notes, beat), sections: secs }
}

function trimHolds(notes: Note[], beat: number): Note[] {
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!
    if (!n.len) continue
    const nextSame = notes.slice(i + 1).find((m) => m.lane === n.lane)
    const room = nextSame ? nextSame.t - n.t - beat * 0.5 : n.len
    const len = Math.min(n.len, Math.floor((room / beat) * 2) / 2 * beat)
    if (len >= beat) n.len = round3(len)
    else delete n.len
  }
  return notes
}

export function chart(a: Analysis, difficulty: Difficulty): Note[] {
  return chartWithSections(a, difficulty).notes
}

const round3 = (x: number) => Math.round(x * 1000) / 1000
