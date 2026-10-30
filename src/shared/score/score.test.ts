import { describe, expect, test } from 'bun:test'
import { analyze } from '../analyze'
import { chartFromScore } from './chart'
import { hear, snapTime } from './hearing'
import { partsOf, type ScoreNote, voicesOf } from './voices'

const SR = 22_050

function clicks(times: readonly number[], seconds: number) {
  const pcm = new Float32Array(SR * seconds)
  for (const at of times) {
    const s0 = Math.round(at * SR)
    for (let i = 0; i < 2000 && s0 + i < pcm.length; i++) pcm[s0 + i] = (pcm[s0 + i] ?? 0) + Math.sin(i * 0.3) * Math.exp(-i / 400)
  }
  return pcm
}

const beats = (from: number, to: number, every: number) => Array.from({ length: Math.floor((to - from) / every) }, (_, i) => from + i * every)

describe('hearing where a sound really starts', () => {
  test('a note placed 15 ms late or 20 ms early is moved onto the click within 3 ms', () => {
    const times = beats(0.5, 9.5, 0.5)
    const hearing = hear(clicks(times, 10), SR)
    for (const t of times.slice(1, -1)) {
      expect(Math.abs(snapTime(hearing, t + 0.015) - t)).toBeLessThan(0.003)
      expect(Math.abs(snapTime(hearing, t - 0.02) - t)).toBeLessThan(0.003)
    }
  })

  test('a note with no sound near it keeps its time', () => {
    const hearing = hear(clicks([1, 2], 4), SR)
    expect(snapTime(hearing, 3.3)).toBe(3.3)
  })
})

const note = (channel: string, key: number, t: number): ScoreNote => ({ t, length: 0.1, channel, key, velocity: 100 })

describe('choosing what to chart from the project', () => {
  test('two synths doubling one line are one part', () => {
    const times = beats(0, 8, 0.25)
    const voices = voicesOf([...times.map((t) => note('lead a', 72, t)), ...times.map((t) => note('lead b', 60, t))])
    expect(partsOf(voices)).toHaveLength(1)
  })

  test('the bass line leads, not the drums, when both play', () => {
    const times = beats(0.5, 16.5, 0.5)
    const notes = [...times.map((t, i) => note('bass', 36 + (i % 4), t)), ...times.map((t) => note('drums', 36, t)), ...times.map((t) => note('drums', 38, t + 0.25))]
    const pcm = clicks([...times, ...times.map((t) => t + 0.25)], 18)
    const chart = chartFromScore(voicesOf(notes), { audio: analyze(pcm, SR), hearing: hear(pcm, SR) }, { beat: 0.5, origin: 0.5 }, 'normal')
    expect(chart.sections.every((s) => s.voice === 'bass')).toBe(true)
  })
})
