import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIFFICULTIES, type Difficulty } from '../../src/shared/analyze'
import { isSongChart } from '../../src/client/decode'
import type { ChartIndexEntry, SongChart } from '../../src/shared/types'
import { buildChart, perDifficulty } from './chart'
import type { Scored } from './pick'
import { type Song, songs } from './songs'

const CHARTS = 'public/charts'
const INDEX = join(CHARTS, 'index.json')

const work = process.argv[2] ?? ''
if (work === '') throw new Error('usage: bun scripts/charts/assemble.ts <work-dir> [slug...]')

const entryOf = (song: Song, chart: SongChart): ChartIndexEntry => ({
  slug: chart.slug,
  album: chart.album,
  title: chart.title,
  artist: chart.artist ?? song.track.artist,
  track: song.track.track,
  bpm: chart.bpm,
  duration: chart.duration,
  notes: perDifficulty((d) => chart.charts[d].length),
  holds: perDifficulty((d) => chart.charts[d].filter((n) => (n.len ?? 0) > 0).length),
})

const report = (picks: Record<Difficulty, Scored>) =>
  DIFFICULTIES.map((d) => {
    const p = picks[d]
    return `${d} ${p.placed.notes.length} (attack ${p.attack.toFixed(3)}, covers ${Math.round(p.coverage * 100)}%, off grid ${p.placed.offGrid}, dropped ${p.placed.dropped})`
  }).join('  ')

for (const song of songs(process.argv.slice(3))) {
  const { chart, picks } = buildChart(work, song)
  writeFileSync(join(CHARTS, `${song.track.slug}.json`), JSON.stringify(chart))
  console.log(`${song.track.slug.padEnd(42)} ${chart.bpm.toFixed(2)} bpm  ${report(picks)}`)
}

const index = songs([]).map((song) => {
  const parsed: unknown = JSON.parse(readFileSync(join(CHARTS, `${song.track.slug}.json`), 'utf8'))
  if (!isSongChart(parsed)) throw new Error(`${CHARTS}/${song.track.slug}.json is not a chart`)
  return entryOf(song, parsed)
})
writeFileSync(INDEX, JSON.stringify(index))
console.log(`${INDEX}: ${index.length} songs`)
