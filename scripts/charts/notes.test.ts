import { describe, expect, test } from 'bun:test'
import { anchored } from './grid'
import { fold, notesOf } from './notes'
import type { HitObject } from './osu'

const at = (t: number, column: number, end: number | null = null): HitObject => ({ t, column, end })
const lanes = (objects: readonly HitObject[]) => fold(objects, 4).map((f) => f.lane)

describe('four columns fold into three lanes', () => {
  test('the outer columns go left and right, the inner ones up', () => {
    expect(lanes([at(0, 0), at(1, 3), at(2, 1)])).toEqual([0, 2, 1])
  })

  test('stepping between the two inner columns steps the same way, so no repeated lane is invented', () => {
    expect(lanes([at(0, 1), at(1, 2), at(2, 1), at(3, 2)])).toEqual([1, 2, 1, 2])
  })

  test('two notes at once never share a lane', () => {
    const [a, b] = lanes([at(0, 1), at(0, 2)])
    expect(a).not.toBe(b)
  })

  test('a lane held by a long note takes nothing until it lets go; a note with nowhere to go is dropped and counted', () => {
    const objects = [at(0, 0, 2), at(0, 3, 2), at(0, 1, 2), at(1, 2)]
    expect(lanes(objects)).toEqual([0, 2, 1])
    expect(notesOf({ keys: 4, timing: [], objects }, anchored(0.5, 0)).dropped).toBe(1)
  })
})

test('notes land on the grid, and a note too far from any line keeps its time and is counted', () => {
  const placed = notesOf({ keys: 4, timing: [], objects: [at(0.508, 0), at(0.71875, 3)] }, anchored(0.5, 0))
  expect(placed.notes.map((n) => n.t)).toEqual([0.5, 0.71875])
  expect(placed.offGrid).toBe(1)
})
