import { describe, expect, test } from 'bun:test'
import { clicks } from './test-audio'
import { fluxAt, onsetCurve } from './onsets'

const SR = 22_050
const BEAT = 0.5

function peakOffset(first: number, shape: 'kick' | 'tick'): number {
  const curve = onsetCurve(clicks({ first, beat: BEAT, seconds: 30, shape }, SR), SR)
  let best = { offset: 0, score: -1 }
  for (let offset = -0.03; offset <= 0.03; offset += 0.0005) {
    let score = 0
    for (let t = first; t < 29.5; t += BEAT) score += fluxAt(curve, t + offset)
    if (score > best.score) best = { offset, score }
  }
  return best.offset
}

describe('the onset curve puts an attack at the moment it starts', () => {
  for (const shape of ['kick', 'tick'] as const) {
    for (const first of [0.25, 0.2537]) {
      test(`a ${shape} at ${first} s reads within 1.5 ms`, () => {
        expect(Math.abs(peakOffset(first, shape))).toBeLessThan(0.0015)
      })
    }
  }
})
