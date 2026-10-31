export const HOP = 256
export const FRAME = 1024

export const VOICES = [
  { name: 'kick', lo: 30, hi: 130, weight: 1, sustains: false },
  { name: 'bass', lo: 130, hi: 400, weight: 0.85, sustains: true },
  { name: 'snare', lo: 400, hi: 1600, weight: 1.15, sustains: true },
  { name: 'lead', lo: 1600, hi: 4500, weight: 1.2, sustains: true },
  { name: 'hats', lo: 4500, hi: 9000, weight: 0.8, sustains: false },
  { name: 'air', lo: 9000, hi: 11_000, weight: 0.45, sustains: false },
] as const

export type VoiceName = (typeof VOICES)[number]['name']
export type Lane = 0 | 1 | 2
export type Quant = 4 | 8 | 16
export type Note = { readonly t: number; readonly lane: Lane; readonly q: Quant; readonly len?: number }
export type Section = { readonly t: number; readonly voice: string; readonly energy: number }
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']

export type Analysis = {
  readonly sampleRate: number
  readonly duration: number
  readonly bpm: number
  readonly firstBeat: number
  readonly envelope: Float32Array
  readonly bandFlux: readonly Float32Array[]
  readonly bandCentroid: readonly Float32Array[]
  readonly bandLevel: readonly Float32Array[]
  readonly rms: Float32Array
}

export type Hit = {
  readonly t: number
  readonly slot: number
  readonly strength: number
  readonly timbre: number
  readonly voice: number
  readonly sustain: number
}

export const framesPerSecond = (sampleRate: number) => sampleRate / HOP
export const frameCenter = (sampleRate: number) => FRAME / 2 / sampleRate
export const beatLength = (bpm: number) => 60 / bpm
export const sample = (xs: ArrayLike<number>, i: number) => xs[i] ?? 0
export const round3 = (x: number) => Math.round(x * 1000) / 1000
export const sum = (xs: Iterable<number>) => {
  let total = 0
  for (const x of xs) total += x
  return total
}
