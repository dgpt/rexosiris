import { describe, expect, test } from 'bun:test'
import type { Note } from '../../src/shared/analyze'
import { best, type Scored } from './pick'

const tap = (t: number, len?: number): Note => (len === undefined ? { t, lane: 1, q: 4 } : { t, lane: 1, q: 4, len })
const candidate = (file: string, attack: number, coverage: number, notes: readonly Note[]): Scored => ({
  file,
  attack,
  coverage,
  placed: { notes, dropped: 0, offGrid: 0 },
})

describe('the pick chooses between whole charts', () => {
  test('a chart that leaves loud parts empty is never picked, however well it lands', () => {
    const chosen = best([candidate('sparse', 0.99, 0.8, [tap(1)]), candidate('full', 0.9, 0.95, [tap(1)])])
    expect(chosen?.file).toBe('full')
  })

  test('a chart holding one note for most of the song is never picked', () => {
    const chosen = best([candidate('drone', 0.99, 1, [tap(0, 175.6), tap(2)]), candidate('playable', 0.95, 1, [tap(0, 6.8), tap(9)])])
    expect(chosen?.file).toBe('playable')
  })

  test('when nothing qualifies there is no pick', () => {
    expect(best([candidate('drone', 0.99, 1, [tap(0, 46)])])).toBeUndefined()
  })
})
