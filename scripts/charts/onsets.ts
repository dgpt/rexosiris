import { fft, hann } from '../../src/shared/analysis/fft'

const SIZE = 256
const STEP = 32
export const ONSET_DELAY_SECONDS = 0.008

export type OnsetCurve = { readonly flux: Float32Array; readonly rate: number; readonly duration: number }

export function onsetCurve(pcm: Float32Array, sampleRate: number): OnsetCurve {
  const frames = Math.max(0, Math.floor((pcm.length - SIZE) / STEP))
  const window = hann(SIZE)
  const re = new Float64Array(SIZE)
  const im = new Float64Array(SIZE)
  const previous = new Float64Array(SIZE / 2)
  const flux = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < SIZE; i++) {
      re[i] = (pcm[f * STEP + i] ?? 0) * (window[i] ?? 0)
      im[i] = 0
    }
    fft(re, im)
    let rise = 0
    for (let k = 0; k < SIZE / 2; k++) {
      const magnitude = Math.log1p(Math.hypot(re[k] ?? 0, im[k] ?? 0))
      rise += Math.max(0, magnitude - (previous[k] ?? 0))
      previous[k] = magnitude
    }
    flux[f] = rise
  }
  return { flux, rate: sampleRate / STEP, duration: pcm.length / sampleRate }
}

export function fluxAt(curve: OnsetCurve, t: number): number {
  const position = (t - ONSET_DELAY_SECONDS) * curve.rate
  const i = Math.floor(position)
  const after = position - i
  return (curve.flux[i] ?? 0) * (1 - after) + (curve.flux[i + 1] ?? 0) * after
}
