import { describe, expect, test } from 'bun:test'
import { judge } from '../client/game/judge'
import { analyze, chart, chartWithSections } from './analyze'

const SR = 22050
function clickTrack(bpm: number, seconds: number, offset = 0.25) {
  const pcm = new Float32Array(SR * seconds)
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const start = Math.round(t * SR)
    for (let i = 0; i < 400 && start + i < pcm.length; i++) pcm[start + i] = Math.sin(i * 0.9) * Math.exp(-i / 60)
  }
  return pcm
}

describe('chart generation from audio', () => {
  for (const bpm of [96, 128, 150]) {
    test(`finds the tempo of a ${bpm} bpm click track`, () => {
      expect(Math.abs(analyze(clickTrack(bpm, 30), SR).bpm - bpm)).toBeLessThan(1.5)
    })
  }

  test('easy notes land on the clicks, within one analysis frame', () => {
    const a = analyze(clickTrack(120, 30, 0.25), SR)
    for (const n of chart(a, 'easy')) {
      const fromClick = ((n.t - 0.25) % 0.5 + 0.5) % 0.5
      expect(Math.min(fromClick, 0.5 - fromClick)).toBeLessThan(0.025)
    }
  })

  test('harder charts are denser, and easy never asks for the same lane twice within a beat', () => {
    const a = analyze(clickTrack(140, 40), SR)
    const [e, n, h] = [chart(a, 'easy'), chart(a, 'normal'), chart(a, 'hard')]
    expect(e.length).toBeLessThanOrEqual(n.length)
    expect(n.length).toBeLessThanOrEqual(h.length)
    const beat = 60 / 140
    const jacks = e.slice(1).filter((note, i) => note.lane === e[i]?.lane && note.t - (e[i]?.t ?? 0) <= beat * 1.01)
    expect(jacks).toEqual([])
  })

  test('silence produces no notes', () => {
    expect(chart(analyze(new Float32Array(SR * 20), SR), 'hard')).toEqual([])
  })
})

describe('judging a key press', () => {
  test('timing windows', () => {
    expect(judge(-30)).toBe('perfect')
    expect(judge(80)).toBe('great')
    expect(judge(-120)).toBe('good')
    expect(judge(200)).toBeNull()
  })
})

type Part = { from: number; to: number; hz: number | 'noise'; every: number; alt?: number }

function noise(seed: number) {
  let state = seed
  return () => {
    state = (state * 16_807) % 2_147_483_647
    return (state / 2_147_483_647) * 2 - 1
  }
}

function strike(pcm: Float32Array, at: number, hz: number | 'noise', rnd: () => number) {
  const s0 = Math.round(at * SR)
  for (let i = 0; i < 2000 && s0 + i < pcm.length; i++) {
    const env = Math.exp(-i / (hz === 'noise' ? 150 : 500))
    const wave = hz === 'noise' ? rnd() : Math.sin((2 * Math.PI * hz * i) / SR)
    pcm[s0 + i] = (pcm[s0 + i] ?? 0) + 0.6 * env * wave
  }
}

function synth(seconds: number, parts: readonly Part[]) {
  const pcm = new Float32Array(SR * seconds)
  const rnd = noise(7)
  for (const p of parts) {
    for (let k = 0, t = p.from; t < p.to; t += p.every, k++) strike(pcm, t, p.alt !== undefined && k % 2 === 1 ? p.alt : p.hz, rnd)
  }
  return pcm
}

const isHigh = (t: number) => Math.round((t - 0.25) / 0.5) % 2 === 1

describe('a smart chart follows the instrument that leads each phrase', () => {
  test('kick phrase, then a noise-hit phrase, then kick again: the chart leaves the kick when it stops and comes back with it', () => {
    const pcm = synth(26, [
      { from: 0.25, to: 8.25, hz: 55, every: 0.5 },
      { from: 8.25, to: 16.25, hz: 'noise', every: 0.25 },
      { from: 16.25, to: 26, hz: 55, every: 0.5 },
    ])
    const { sections } = chartWithSections(analyze(pcm, SR), 'normal')
    expect(sections.slice(0, 3).map((x) => x.voice === 'kick')).toEqual([true, false, true])
  })

  test('the same sound lands in the same lane, and the higher of two pitches lands to the right', () => {
    const pcm = synth(20, [{ from: 0.25, to: 20, hz: 2000, alt: 3800, every: 0.5 }])
    const a = analyze(pcm, SR)
    const { notes } = chartWithSections(a, 'normal')
    const high = [...new Set(notes.filter((n) => isHigh(n.t)).map((n) => n.lane))]
    const low = [...new Set(notes.filter((n) => !isHigh(n.t)).map((n) => n.lane))]
    expect([high.length, low.length]).toEqual([1, 1])
    expect(high[0] ?? -1).toBeGreaterThan(low[0] ?? 99)
  })

  test('notes are colored by their beat subdivision', () => {
    const a = analyze(clickTrack(120, 30), SR)
    const { notes } = chartWithSections(a, 'easy')
    expect(notes.every((n) => n.q === 4)).toBe(true)
  })
})
