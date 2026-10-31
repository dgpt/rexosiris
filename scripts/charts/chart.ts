import { existsSync, readFileSync } from 'node:fs'
import type { Difficulty } from '../../src/shared/analyze'
import { afterCountdown } from '../../src/shared/countdown'
import type { SongChart } from '../../src/shared/types'
import { anchored, type Grid } from './grid'
import { displayGrid, notesOf } from './notes'
import { onsetCurve } from './onsets'
import { readOsu } from './osu'
import { best, longestHold, loudWindows, type Scored, scored, strongFlux } from './pick'
import { chartFiles, pcmOf, SAMPLE_RATE, type Song, workPaths } from './songs'

export type Built = { readonly chart: SongChart; readonly picks: Record<Difficulty, Scored> }

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places
export const perDifficulty = <T>(of: (d: Difficulty) => T): Record<Difficulty, T> => ({ easy: of('easy'), normal: of('normal'), hard: of('hard') })

function gridOf(work: string, song: Song): Grid {
  const file = workPaths(work, song.track.slug).grid
  if (!existsSync(file)) throw new Error(`${song.track.slug}: no grid, run charts:generate first`)
  const [point] = readOsu(readFileSync(file, 'utf8')).timing
  if (point === undefined) throw new Error(`${file} has no timing point`)
  return anchored(point.beat, point.t)
}

export function buildChart(work: string, song: Song): Built {
  const grid = gridOf(work, song)
  const pcm = pcmOf(work, song.track)
  const curve = onsetCurve(pcm, SAMPLE_RATE)
  const strong = strongFlux(curve)
  const loud = loudWindows(pcm, SAMPLE_RATE)
  const pick = (difficulty: Difficulty): Scored => {
    const files = chartFiles(work, song.track.slug, difficulty)
    const candidates = files.map((file) => scored({ file, placed: notesOf(readOsu(readFileSync(file, 'utf8')), grid) }, curve, strong, loud))
    const chosen = best(candidates)
    if (chosen !== undefined) return chosen
    const each = candidates.map((c) => `covers ${Math.round(c.coverage * 100)}%, longest hold ${longestHold(c.placed.notes).toFixed(1)} s`)
    throw new Error(`${song.track.slug} ${difficulty}: none of ${files.length} charts is playable (${each.join('; ')})`)
  }
  const picks = perDifficulty(pick)
  const display = displayGrid(grid)
  const { slug, album, title, artist } = song.track
  const chart: SongChart = {
    slug,
    album,
    title,
    artist,
    bpm: round(60 / display.beat, 2),
    firstBeat: round(display.firstBeat, 3),
    duration: round(curve.duration, 1),
    charts: perDifficulty((d) => afterCountdown(picks[d].placed.notes)),
  }
  return { chart, picks }
}
