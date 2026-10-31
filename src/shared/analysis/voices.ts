import { type Analysis, beatLength, framesPerSecond, type Hit, onsetLag, sample, VOICES } from './model'

const MIN_FLUX = 0.05
const LOCAL_WINDOW_SECONDS = 0.5
const MIN_GAP_SECONDS = 0.07
const SNAP_TOLERANCE_SECONDS = 0.045
const LEAD_IN_SECONDS = 1.2
const TAIL_SECONDS = 0.8
const SUSTAIN_HOLD_RATIO = 0.4
const SUSTAIN_MIN_RISE = 0.03
const SUSTAIN_MAX_SECONDS = 4

const smoothed = (level: Float32Array, k: number) => (sample(level, k - 1) + sample(level, k) + sample(level, k + 1)) / 3

export function sustainAfter(level: Float32Array, i: number, fps: number): number {
  const peak = Math.max(smoothed(level, i + 2), smoothed(level, i + 4))
  const floor = Math.min(smoothed(level, i - 4), smoothed(level, i - 2))
  if (peak - floor < SUSTAIN_MIN_RISE) return 0
  const limit = Math.min(level.length - 1, i + Math.round(SUSTAIN_MAX_SECONDS * fps))
  let j = i + 4
  while (j < limit && smoothed(level, j) >= floor + (peak - floor) * SUSTAIN_HOLD_RATIO) j++
  return (j - i) / fps
}

const isLocalPeak = (flux: Float32Array, i: number) => {
  const v = sample(flux, i)
  return v >= MIN_FLUX && v >= sample(flux, i - 1) && v >= sample(flux, i + 1)
}

function localMean(flux: Float32Array, i: number, radius: number) {
  const from = Math.max(0, i - radius)
  const to = Math.min(flux.length, i + radius)
  let total = 0
  for (let j = from; j < to; j++) total += sample(flux, j)
  return total / Math.max(1, to - from)
}

export function voiceHits(a: Analysis, voice: number): Hit[] {
  const flux = a.bandFlux[voice] ?? new Float32Array()
  const centroid = a.bandCentroid[voice] ?? new Float32Array()
  const level = a.bandLevel[voice] ?? new Float32Array()
  const fps = framesPerSecond(a.sampleRate)
  const radius = Math.round(LOCAL_WINDOW_SECONDS * fps)
  const minGap = Math.round(MIN_GAP_SECONDS * fps)
  const step = beatLength(a.bpm) / 4
  const hits: Hit[] = []
  let last = -Infinity
  for (let i = 1; i < flux.length - 1; i++) {
    if (!isLocalPeak(flux, i) || i - last < minGap) continue
    const mean = localMean(flux, i, radius)
    if (sample(flux, i) < mean * 1.5 + 0.04) continue
    last = i
    const t = i / fps + onsetLag(a.sampleRate)
    const slot = Math.round((t - a.firstBeat) / step)
    const snapped = a.firstBeat + slot * step
    const inWindow = snapped >= LEAD_IN_SECONDS && snapped <= a.duration - TAIL_SECONDS
    if (Math.abs(snapped - t) > SNAP_TOLERANCE_SECONDS || !inWindow) continue
    hits.push({ t: snapped, slot, strength: sample(flux, i) - mean, timbre: sample(centroid, i), voice, sustain: sustainAfter(level, i, fps) })
  }
  return hits
}

export const allVoiceHits = (a: Analysis) => VOICES.map((_, voice) => voiceHits(a, voice))
