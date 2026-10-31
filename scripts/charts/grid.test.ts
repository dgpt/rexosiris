import { describe, expect, test } from 'bun:test'
import { anchored, atOctaveOf, fitToOnsets, heard, snap } from './grid'
import { onsetCurve } from './onsets'
import { clicks } from './test-audio'

const SR = 22_050
const offGrid = (t: number, grid: { beat: number; firstBeat: number }) => {
  const off = (((t - grid.firstBeat) % grid.beat) + grid.beat) % grid.beat
  return Math.min(off, grid.beat - off)
}

describe('the tempo a timing pass heard becomes one grid for the whole song', () => {
  test('two long sections reported at slightly different tempos both land on the fitted grid', () => {
    const grid = heard([{ t: 6.494, beat: 60 / 110.4 }, { t: 97.788, beat: 60 / 110.44 }], 190)
    expect(offGrid(6.494, grid)).toBeLessThan(0.001)
    expect(offGrid(97.788, grid)).toBeLessThan(0.001)
  })

  test('a pass that only heard the second half still gives a grid from the start of the song', () => {
    const grid = heard([{ t: 97.788, beat: 60 / 110.44 }], 190)
    expect(grid.firstBeat).toBeLessThan(grid.beat)
    expect(offGrid(97.788, grid)).toBeLessThan(0.001)
  })
})

test("a project grid takes the octave the model hears: drive's 95.21 bpm becomes 190.42", () => {
  const grid = atOctaveOf(anchored(60 / 95.21, 0.607), anchored(60 / 190.4, 0.29))
  expect(60 / grid.beat).toBeCloseTo(190.42, 2)
  expect(offGrid(0.607, grid)).toBeLessThan(0.000_001)
})

describe('a grid is fitted to where the hits land', () => {
  const truth = anchored(60 / 120.42, 0.311)
  const curve = onsetCurve(clicks({ first: truth.firstBeat, beat: truth.beat, seconds: 120, shape: 'kick' }, SR), SR)
  const fit = fitToOnsets(anchored(60 / 120.3, 0.3), curve)

  test('a tempo 0.1% off and a phase 11 ms early are both corrected', () => {
    expect(Math.abs(fit.grid.beat / truth.beat - 1)).toBeLessThan(0.0001)
    expect(offGrid(truth.firstBeat + 100 * truth.beat, fit.grid)).toBeLessThan(0.002)
  })

  test('each third of the song reads on the beat after the fit', () => {
    for (const third of fit.thirds) expect(Math.abs(third)).toBeLessThan(0.002)
  })
})

test('a note within 25 ms of an eighth or a sixth of a beat lands on it; further off it stays where it was', () => {
  const grid = anchored(0.5, 0.25)
  expect(snap(0.25 + 0.0625 + 0.01, grid)).toBe(0.313)
  expect(snap(0.25 + 0.5 / 6 + 0.012, grid)).toBe(0.333)
  expect(snap(0.25 + 0.0625 * 3.5, grid)).toBeNull()
})
