import { describe, expect, test } from 'bun:test'
import { analyze, chart } from './analyze'
import { judge } from '../client/game'

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

  test('harder charts are denser, and easy never repeats a lane twice in a row', () => {
    const a = analyze(clickTrack(140, 40), SR)
    const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((d) => chart(a, d))
    expect(e!.length).toBeLessThanOrEqual(n!.length)
    expect(n!.length).toBeLessThanOrEqual(h!.length)
    for (let i = 1; i < e!.length; i++) expect(e![i]!.lane).not.toBe(e![i - 1]!.lane)
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

import { chartWithSections } from './analyze'

function synth(seconds: number, parts: { from: number; to: number; hz: number | 'noise'; every: number; alt?: number }[]) {
  const pcm = new Float32Array(SR * seconds)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (const p of parts) {
    let k = 0
    for (let t = p.from; t < p.to; t += p.every, k++) {
      const hz = p.alt && k % 2 ? p.alt : p.hz
      const s0 = Math.round(t * SR)
      for (let i = 0; i < 2000 && s0 + i < pcm.length; i++) {
        const env = Math.exp(-i / (hz === 'noise' ? 150 : 500))
        pcm[s0 + i] = pcm[s0 + i]! + 0.6 * env * (hz === 'noise' ? rnd() : Math.sin((2 * Math.PI * (hz as number) * i) / SR))
      }
    }
  }
  return pcm
}

describe('a smart chart follows the instrument that leads each phrase', () => {
  test('kick phrase, then a noise-hit phrase, then kick again: the chart leaves the kick when it stops and comes back with it', () => {
    const pcm = synth(26, [
      { from: 0.25, to: 8.25, hz: 55, every: 0.5 },
      { from: 8.25, to: 16.25, hz: 'noise', every: 0.25 },
      { from: 16.25, to: 26, hz: 55, every: 0.5 },
    ])
    const { sections } = chartWithSections(analyze(pcm, SR), 'normal')
    expect(sections[0]!.voice).toBe('kick')
    expect(sections[1]!.voice).not.toBe('kick')
    expect(sections[2]!.voice).toBe('kick')
  })

  test('the same sound lands in the same lane, and the higher of two pitches lands to the right', () => {
    const pcm = synth(20, [{ from: 0.25, to: 20, hz: 2000, alt: 3800, every: 0.5 }])
    const a = analyze(pcm, SR)
    const { notes } = chartWithSections(a, 'normal')
    const low = new Set<number>(), high = new Set<number>()
    for (const n of notes) {
      const k = Math.round((n.t - 0.25) / 0.5)
      ;(k % 2 ? high : low).add(n.lane)
    }
    expect(low.size).toBe(1)
    expect(high.size).toBe(1)
    expect([...high][0]!).toBeGreaterThan([...low][0]!)
  })

  test('notes are colored by their beat subdivision', () => {
    const a = analyze(clickTrack(120, 30), SR)
    const { notes } = chartWithSections(a, 'easy')
    expect(notes.every((n) => n.q === 4)).toBe(true)
  })
})
