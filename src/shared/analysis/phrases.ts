import { type Analysis, beatLength, framesPerSecond, type Hit, round3, sample, type Section, sum, VOICES } from './model'

export const BEATS_PER_PHRASE = 16
const STAY_BIAS = 1.3

export type Phrase = { readonly index: number; readonly t0: number; readonly t1: number }

export function phrasesOf(a: Analysis): Phrase[] {
  const length = beatLength(a.bpm) * BEATS_PER_PHRASE
  const count = Math.max(1, Math.ceil((a.duration - a.firstBeat) / length))
  return Array.from({ length: count }, (_, index) => ({ index, t0: a.firstBeat + index * length, t1: a.firstBeat + (index + 1) * length }))
}

export const within = (phrase: Phrase) => (h: Hit) => h.t >= phrase.t0 && h.t < phrase.t1

function salience(hits: readonly Hit[]) {
  if (hits.length === 0) return 0
  const regularity = hits.filter((h) => h.slot % 2 === 0).length / hits.length
  return sum(hits.map((h) => h.strength)) * (0.6 + 0.4 * regularity)
}

function energyOf(a: Analysis, phrase: Phrase) {
  const fps = framesPerSecond(a.sampleRate)
  const from = Math.max(0, Math.floor(phrase.t0 * fps))
  const to = Math.min(a.rms.length, Math.floor(phrase.t1 * fps))
  let total = 0
  for (let i = from; i < to; i++) total += sample(a.rms, i)
  return to > from ? total / (to - from) : 0
}

function leaders(raw: readonly number[][]): number[] {
  const mean = VOICES.map((_, v) => Math.max(1e-6, sum(raw.map((r) => r[v] ?? 0)) / raw.length))
  let current = -1
  return raw.map((r) => {
    const score = r.map((s, v) => ((VOICES[v]?.weight ?? 1) * s) / Math.sqrt(mean[v] ?? 1))
    const best = score.indexOf(Math.max(...score))
    const stay = current >= 0 && (r[current] ?? 0) > 0 && (score[current] ?? 0) * STAY_BIAS >= (score[best] ?? 0)
    current = stay ? current : best
    return current
  })
}

export function sections(a: Analysis, hits: readonly Hit[][]): Section[] {
  const phrases = phrasesOf(a)
  const raw = phrases.map((p) => hits.map((hs) => salience(hs.filter((h) => within(p)(h)))))
  const energies = phrases.map((p) => energyOf(a, p))
  const loudest = Math.max(...energies, 1e-6)
  return leaders(raw).map((voice, i) => ({
    t: round3(Math.max(0, phrases[i]?.t0 ?? 0)),
    voice: VOICES[voice]?.name ?? 'kick',
    energy: Math.round(((energies[i] ?? 0) / loudest) * 100) / 100,
  }))
}
