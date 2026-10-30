const FRAME = 512
const HOP = 64
const ATTACK_BEFORE = 2
const ATTACK_AFTER = 6
const LOUD_QUANTILE = 0.9
const SNAP_SECONDS = 0.04
const SNAP_FLOOR_QUANTILE = 0.75

export type Hearing = { readonly fps: number; readonly onsets: Float32Array; readonly loud: number; readonly snapFloor: number }

function onsetCurve(pcm: Float32Array) {
  const frames = Math.max(0, Math.floor((pcm.length - FRAME) / HOP))
  const out = new Float32Array(frames)
  let last = 0
  for (let f = 0; f < frames; f++) {
    let energy = 0
    for (let i = 0; i < FRAME; i++) energy += (pcm[f * HOP + i] ?? 0) ** 2
    const level = Math.log(1e-9 + energy)
    out[f] = Math.max(0, level - last)
    last = level
  }
  return out
}

const quantile = (sorted: readonly number[], q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0

export function hear(pcm: Float32Array, sampleRate: number): Hearing {
  const onsets = onsetCurve(pcm)
  const nonzero = Array.from(onsets).filter((x) => x > 0).toSorted((a, b) => a - b)
  return { fps: sampleRate / HOP, onsets, loud: quantile(nonzero, LOUD_QUANTILE) || 1, snapFloor: quantile(nonzero, SNAP_FLOOR_QUANTILE) }
}

const ATTACK_LAG_FRAMES = FRAME / HOP - 0.5
const frameOf = (hearing: Hearing, t: number) => Math.round(t * hearing.fps - ATTACK_LAG_FRAMES)
const timeOf = (hearing: Hearing, frame: number) => (frame + ATTACK_LAG_FRAMES) / hearing.fps

export function attackAt(hearing: Hearing, t: number) {
  const f = frameOf(hearing, t)
  let peak = 0
  for (let k = -ATTACK_BEFORE; k <= ATTACK_AFTER; k++) peak = Math.max(peak, hearing.onsets[f + k] ?? 0)
  return peak / hearing.loud
}

export function snapTime(hearing: Hearing, t: number) {
  const center = frameOf(hearing, t)
  const reach = Math.round(SNAP_SECONDS * hearing.fps)
  let best = { frame: center, score: 0 }
  for (let f = center - reach; f <= center + reach; f++) {
    const value = hearing.onsets[f] ?? 0
    const closeness = 1 - Math.abs(f - center) / (reach + 1)
    const score = value * (0.5 + 0.5 * closeness)
    if (value >= hearing.snapFloor && score > best.score) best = { frame: f, score }
  }
  return best.score > 0 ? timeOf(hearing, best.frame) : t
}
