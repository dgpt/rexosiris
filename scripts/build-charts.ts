import { readFileSync, writeFileSync } from 'node:fs'
import { analyze, chartWithSections, type Analysis, type Difficulty, type Note } from '../src/shared/analyze'
import { chartFromScore, type ScoreChart } from '../src/shared/score/chart'
import { hear, type Hearing, snapTime } from '../src/shared/score/hearing'
import { voicesOf } from '../src/shared/score/voices'
import { type ProjectLink, readLinks } from './flp/link'
import { readProject } from './flp/project'
import { placed } from './flp/timeline'
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

type Charted = { readonly charts: Record<Difficulty, ScoreChart>; readonly bpm: number; readonly firstBeat: number; readonly source: 'project' | 'audio' }

function fromProject(link: ProjectLink, a: Analysis, pcm: Float32Array): Charted {
  const { notes, grid } = placed(readProject(new Uint8Array(readFileSync(link.flp))), link)
  const voices = voicesOf(notes)
  const heard = { audio: a, hearing: hear(pcm, SR) }
  const firstBeat = ((grid.origin % grid.beat) + grid.beat) % grid.beat
  return { charts: perDifficulty((d) => chartFromScore(voices, heard, grid, d)), bpm: round(60 / grid.beat, 2), firstBeat: round(firstBeat, 3), source: 'project' }
}

function snapped(notes: readonly Note[], hearing: Hearing): Note[] {
  return notes.map((n): Note => ({ ...n, t: round(snapTime(hearing, n.t), 3) })).toSorted((x, y) => x.t - y.t)
}

function fromAudio(a: Analysis, pcm: Float32Array): Charted {
  const charts = perDifficulty((d) => chartWithSections(a, d))
  const hearing = hear(pcm, SR)
  return { charts: perDifficulty((d) => ({ notes: snapped(charts[d].notes, hearing), sections: [...charts[d].sections] })), bpm: a.bpm, firstBeat: round(a.firstBeat, 3), source: 'audio' }
}

function songOf(track: TrackMeta, pcm: Float32Array, link: ProjectLink | undefined): SongChart & { readonly source: Charted['source'] } {
  const a = analyze(pcm, SR)
  const charted = link === undefined ? fromAudio(a, pcm) : fromProject(link, a, pcm)
  const { slug, album, title, artist } = track
  const notes: Record<Difficulty, Note[]> = perDifficulty((d) => charted.charts[d].notes)
  return { slug, album, title, artist, bpm: charted.bpm, firstBeat: charted.firstBeat, duration: round(a.duration, 1), charts: notes, sections: charted.charts.normal.sections, source: charted.source }
}

function entryOf(track: TrackMeta, song: SongChart & { readonly source: Charted['source'] }): ChartIndexEntry {
  return {
    source: song.source,
    slug: song.slug,
    album: song.album,
    title: song.title,
    artist: track.artist,
    track: track.track,
    bpm: song.bpm,
    duration: song.duration,
    notes: perDifficulty((d) => song.charts[d].length),
    holds: perDifficulty((d) => song.charts[d].filter((n) => (n.len ?? 0) > 0).length),
  }
}

const links = readLinks()
const index = parsed.map((track) => {
  const buf = readFileSync(`${pcmDir}/${track.slug}.f32`)
  const started = performance.now()
  const song = songOf(track, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), links[track.slug])
  writeFileSync(`public/charts/${track.slug}.json`, JSON.stringify(song))
  const entry = entryOf(track, song)
  const counts = Object.entries(entry.notes).map(([d, n]) => `${d}:${n}`).join(' ')
  console.log(`${track.slug.padEnd(28)} ${song.bpm.toFixed(2).padStart(7)} bpm  ${counts}  ${Math.round(performance.now() - started)}ms  ${song.source}`)
  return entry
})
writeFileSync('public/charts/index.json', JSON.stringify(index))
writeFileSync('src/shared/chart-index.json', JSON.stringify(index))
