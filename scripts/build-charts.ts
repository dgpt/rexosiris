import { readFileSync, writeFileSync } from 'node:fs'
import { analyze, chartWithSections, DIFFICULTIES } from '../src/shared/analyze'
import type { ChartIndexEntry, SongChart, TrackMeta } from '../src/shared/types'

const pcmDir = process.argv[2]
if (!pcmDir) throw new Error('usage: bun scripts/build-charts.ts <pcm-dir>')
const SR = 22050
const tracks = JSON.parse(readFileSync('scripts/tracks.json', 'utf8')) as TrackMeta[]
const index: ChartIndexEntry[] = []
for (const { slug, title, artist, album, track } of tracks) {
  const buf = readFileSync(`${pcmDir}/${slug}.f32`)
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const t0 = performance.now()
  const a = analyze(pcm, SR)
  const built = Object.fromEntries(DIFFICULTIES.map((d) => [d, chartWithSections(a, d)]))
  const charts = Object.fromEntries(DIFFICULTIES.map((d) => [d, built[d]!.notes])) as SongChart['charts']
  const sections = built.hard!.sections
  const song: SongChart = { slug, album, title, artist, bpm: a.bpm, firstBeat: Math.round(a.firstBeat * 1000) / 1000, duration: Math.round(a.duration * 10) / 10, charts, sections }
  writeFileSync(`public/charts/${slug}.json`, JSON.stringify(song))
  index.push({ slug, album, title, artist, track, bpm: song.bpm, duration: song.duration, notes: Object.fromEntries(DIFFICULTIES.map((d) => [d, charts[d].length])) as ChartIndexEntry['notes'], voices: sections.map((x) => x.voice).filter((v, i, all) => i === 0 || all[i - 1] !== v), holds: Object.fromEntries(DIFFICULTIES.map((d) => [d, charts[d].filter((n) => n.len).length])) as ChartIndexEntry['notes'] })
  console.log(`${slug.padEnd(28)} ${a.bpm.toFixed(2).padStart(7)} bpm  beat0 ${song.firstBeat}s  ${DIFFICULTIES.map((d) => `${d}:${charts[d].length}`).join(' ')}  ${Math.round(performance.now() - t0)}ms  ${[...new Set(sections.map((x) => x.voice))].join('/')}  ${sections.map((x) => x.voice[0]).join('')}`)
}
writeFileSync('public/charts/index.json', JSON.stringify(index))
writeFileSync('src/shared/chart-index.json', JSON.stringify(index))
