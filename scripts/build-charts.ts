import { readFileSync, writeFileSync } from 'node:fs'
import { analyze, chartWithSections, type Analysis, type Difficulty, type Note, type Section } from '../src/shared/analyze'
import { isArrayOf, isNumber, isRecord, isString } from '../src/shared/guards'
import type { ChartIndexEntry, SongChart, TrackMeta } from '../src/shared/types'

const SR = 22_050
const pcmDir = process.argv[2] ?? ''
if (pcmDir === '') throw new Error('usage: bun scripts/build-charts.ts <pcm-dir>')

const isTrack = (v: unknown): v is TrackMeta =>
  isRecord(v) && isString(v['file']) && isString(v['slug']) && isString(v['title']) && isString(v['artist']) && isString(v['album']) && (v['track'] === null || isNumber(v['track']))

const parsed: unknown = JSON.parse(readFileSync('scripts/tracks.json', 'utf8'))
if (!isArrayOf(isTrack)(parsed)) throw new Error('scripts/tracks.json is not a track list: run bun scripts/read-tags.ts')

const perDifficulty = <T>(of: (d: Difficulty) => T): Record<Difficulty, T> => ({ easy: of('easy'), normal: of('normal'), hard: of('hard') })
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places
const voicePath = (sections: readonly Section[]) => sections.map((x) => x.voice).filter((v, i, all) => i === 0 || all[i - 1] !== v)

function songOf(track: TrackMeta, a: Analysis): SongChart {
  const charts = perDifficulty((d) => chartWithSections(a, d))
  const { slug, album, title, artist } = track
  const notes: Record<Difficulty, Note[]> = perDifficulty((d) => [...charts[d].notes])
  return { slug, album, title, artist, bpm: a.bpm, firstBeat: round(a.firstBeat, 3), duration: round(a.duration, 1), charts: notes, sections: [...charts.hard.sections] }
}

function entryOf(track: TrackMeta, song: SongChart): ChartIndexEntry {
  return {
    slug: song.slug,
    album: song.album,
    title: song.title,
    artist: track.artist,
    track: track.track,
    bpm: song.bpm,
    duration: song.duration,
    notes: perDifficulty((d) => song.charts[d].length),
    voices: voicePath(song.sections ?? []),
    holds: perDifficulty((d) => song.charts[d].filter((n) => (n.len ?? 0) > 0).length),
  }
}

const index = parsed.map((track) => {
  const buf = readFileSync(`${pcmDir}/${track.slug}.f32`)
  const started = performance.now()
  const song = songOf(track, analyze(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), SR))
  writeFileSync(`public/charts/${track.slug}.json`, JSON.stringify(song))
  const entry = entryOf(track, song)
  const counts = Object.entries(entry.notes).map(([d, n]) => `${d}:${n}`).join(' ')
  console.log(`${track.slug.padEnd(28)} ${song.bpm.toFixed(2).padStart(7)} bpm  ${counts}  ${Math.round(performance.now() - started)}ms  ${(entry.voices ?? []).join('>')}`)
  return entry
})
writeFileSync('public/charts/index.json', JSON.stringify(index))
writeFileSync('src/shared/chart-index.json', JSON.stringify(index))
