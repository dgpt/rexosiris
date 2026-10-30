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
