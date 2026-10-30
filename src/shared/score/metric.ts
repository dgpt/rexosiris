import type { Quant } from '../analysis/model'

export type ScoreGrid = { readonly beat: number; readonly origin: number }

const ON_GRID = 0.06
export const BEATS_PER_PHRASE = 16

const on = (position: number, step: number) => Math.abs(position / step - Math.round(position / step)) < ON_GRID

export const positionOf = (grid: ScoreGrid, t: number) => (t - grid.origin) / grid.beat

export function strengthOf(grid: ScoreGrid, t: number) {
  const p = positionOf(grid, t)
  if (on(p, 4)) return 4
  if (on(p, 1)) return 3
  if (on(p, 0.5)) return 2
  if (on(p, 0.25)) return 1
  return 0
}

export function quantOf(grid: ScoreGrid, t: number): Quant {
  const p = positionOf(grid, t)
  if (on(p, 1)) return 4
  if (on(p, 0.5)) return 8
  return 16
}

export const phraseOf = (grid: ScoreGrid, t: number) => Math.floor(positionOf(grid, t) / BEATS_PER_PHRASE)

export const phraseStart = (grid: ScoreGrid, phrase: number) => grid.origin + phrase * BEATS_PER_PHRASE * grid.beat
