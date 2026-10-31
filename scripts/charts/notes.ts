import type { Lane, Note, Quant } from '../../src/shared/analyze'
import { anchored, type Grid, snap } from './grid'
import type { Beatmap, HitObject } from './osu'

export type Placed = { readonly notes: readonly Note[]; readonly dropped: number; readonly offGrid: number }

const CHORD_SECONDS = 0.005
const ON_BEAT = 0.06
const DISPLAY_MAX_BPM = 150
const LANES: readonly Lane[] = [0, 1, 2]

type Fold = { readonly column: number; readonly lane: Lane }

export function displayGrid(grid: Grid): Grid {
  let beat = grid.beat
  while (60 / beat > DISPLAY_MAX_BPM) beat *= 2
  return anchored(beat, grid.firstBeat)
}

function wanted(object: HitObject, keys: number, previous: Fold | null): Lane {
  if (keys === 3) return LANES[object.column] ?? 1
  if (object.column === 0) return 0
  if (object.column === keys - 1) return 2
  const previousInner = previous !== null && previous.lane === 1 && previous.column !== 0 && previous.column !== keys - 1
  if (!previousInner || previous.column === object.column) return 1
  return object.column > previous.column ? 2 : 0
}

function freeLane(want: Lane, t: number, taken: ReadonlySet<Lane>, busyUntil: readonly number[]): Lane | null {
  const open = (lane: Lane) => !taken.has(lane) && (busyUntil[lane] ?? 0) <= t
  if (open(want)) return want
  return LANES.filter((lane) => open(lane)).toSorted((a, b) => Math.abs(a - want) - Math.abs(b - want))[0] ?? null
}

export function fold(objects: readonly HitObject[], keys: number): { readonly object: HitObject; readonly lane: Lane }[] {
  const busyUntil = [0, 0, 0]
  const folded: { readonly object: HitObject; readonly lane: Lane }[] = []
  let previous: Fold | null = null
  let chordPrevious: Fold | null = null
  let chordAt = Number.NEGATIVE_INFINITY
  let taken = new Set<Lane>()
  for (const object of objects) {
    if (object.t - chordAt > CHORD_SECONDS) {
      chordAt = object.t
      taken = new Set<Lane>()
      chordPrevious = previous
    }
    const lane = freeLane(wanted(object, keys, chordPrevious), object.t, taken, busyUntil)
    if (lane === null) continue
    taken.add(lane)
    busyUntil[lane] = object.end ?? object.t
    folded.push({ object, lane })
    previous = { column: object.column, lane }
  }
  return folded
}

function quantOf(t: number, grid: Grid): Quant {
  const beats = (t - grid.firstBeat) / grid.beat
  const near = (step: number) => Math.abs(beats / step - Math.round(beats / step)) < ON_BEAT
  if (near(1)) return 4
  if (near(0.5)) return 8
  return 16
}

export function notesOf(map: Beatmap, grid: Grid): Placed {
  const folded = fold(map.objects, map.keys)
  const display = displayGrid(grid)
  let offGrid = 0
  const notes = folded.map(({ object, lane }): Note => {
    const snapped = snap(object.t, grid)
    if (snapped === null) offGrid += 1
    const t = snapped ?? object.t
    const until = object.end === null ? null : (snap(object.end, grid) ?? object.end)
    const q = quantOf(t, display)
    return until === null || until <= t ? { t, lane, q } : { t, lane, q, len: Math.round((until - t) * 1000) / 1000 }
  })
  return { notes, dropped: map.objects.length - folded.length, offGrid }
}
