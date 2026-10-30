import { fft, hann } from './fft'
import { estimatePhase, estimateTempo, refineGrid } from './grid'
import { type Analysis, FRAME, framesPerSecond, HOP, onsetLag, sample, VOICES } from './model'

type Frame = { readonly re: Float64Array; readonly im: Float64Array; readonly prev: Float64Array }

type Channel = {
  readonly lo: number
  readonly hi: number
  readonly flux: Float32Array
  readonly level: Float32Array
  readonly centroid: Float32Array
}

const channelsFor = (sampleRate: number, frames: number): Channel[] => {
  const binHz = sampleRate / FRAME
  return VOICES.map((v) => ({
    lo: Math.max(1, Math.floor(v.lo / binHz)),
    hi: Math.min(FRAME / 2, Math.ceil(v.hi / binHz)),
    flux: new Float32Array(frames),
    level: new Float32Array(frames),
    centroid: new Float32Array(frames),
  }))
}

function normalize(x: Float32Array) {
  const max = x.reduce((m, v) => Math.max(m, v), 0)
  if (max > 0) x.forEach((v, i) => { x[i] = v / max })
}

function measure(frame: Frame, channel: Channel, f: number) {
  let flux = 0
  let weighted = 0
  let level = 0
  for (let k = channel.lo; k < channel.hi; k++) {
    const mag = Math.log1p(10 * Math.hypot(sample(frame.re, k), sample(frame.im, k)))
    const rise = mag - sample(frame.prev, k)
    level += mag
    if (rise > 0) {
      flux += rise
      weighted += rise * k
    }
    frame.prev[k] = mag
  }
  const width = Math.max(1, channel.hi - channel.lo)
  channel.flux[f] = flux / width
  channel.level[f] = level / width
  channel.centroid[f] = flux > 0 ? (weighted / flux - channel.lo) / width : 0.5
  return flux / width
}

function loadFrame(pcm: Float32Array, offset: number, window: Float64Array, frame: Frame) {
  let energy = 0
  for (let i = 0; i < FRAME; i++) {
    const v = sample(pcm, offset + i)
    energy += v * v
    frame.re[i] = v * sample(window, i)
    frame.im[i] = 0
  }
  fft(frame.re, frame.im)
  return Math.sqrt(energy / FRAME)
}

export function analyze(pcm: Float32Array, sampleRate: number): Analysis {
  const frames = Math.max(0, Math.floor((pcm.length - FRAME) / HOP))
  const channels = channelsFor(sampleRate, frames)
  const window = hann(FRAME)
  const frame: Frame = { re: new Float64Array(FRAME), im: new Float64Array(FRAME), prev: new Float64Array(FRAME / 2) }
  const envelope = new Float32Array(frames)
  const rms = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    rms[f] = loadFrame(pcm, f * HOP, window, frame)
    envelope[f] = channels.reduce((total, channel) => total + measure(frame, channel, f), 0)
  }
  for (const x of [envelope, rms, ...channels.map((c) => c.flux)]) normalize(x)
  const fps = framesPerSecond(sampleRate)
  const tempo = estimateTempo(envelope, fps)
  const grid = refineGrid(envelope, fps, { bpm: tempo, phase: estimatePhase(envelope, fps, tempo) })
  return {
    sampleRate,
    duration: pcm.length / sampleRate,
    bpm: grid.bpm,
    firstBeat: grid.phase + onsetLag(sampleRate),
    envelope,
    bandFlux: channels.map((c) => c.flux),
    bandCentroid: channels.map((c) => c.centroid),
    bandLevel: channels.map((c) => c.level),
    rms,
  }
}
