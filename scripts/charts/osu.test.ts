import { expect, test } from 'bun:test'
import { anchored } from './grid'
import { readOsu, timingReference } from './osu'

test('a timing reference reads back as the grid it was written from', () => {
  const grid = anchored(60 / 190.42, 0.017_8)
  const [point] = readOsu(timingReference(grid, 'drive.flac')).timing
  expect(point?.beat).toBeCloseTo(grid.beat, 9)
  expect(point?.t).toBeCloseTo(grid.firstBeat, 9)
})

test('mania hit objects read as column, time and hold end; inherited timing points are not tempos', () => {
  const text = [
    '[Difficulty]',
    'CircleSize:4',
    '[TimingPoints]',
    '100,500,4,2,0,100,1,0',
    '600,-100,4,2,0,100,0,0',
    '[HitObjects]',
    '448,192,1500,128,0,2250:0:0:0:0:',
    '64,192,1000,1,0,0:0:0:0:',
  ].join('\n')
  const map = readOsu(text)
  expect(map.keys).toBe(4)
  expect(map.timing).toEqual([{ t: 0.1, beat: 0.5 }])
  expect(map.objects).toEqual([{ t: 1, column: 0, end: null }, { t: 1.5, column: 3, end: 2.25 }])
})
