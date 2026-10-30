import { readFileSync, writeFileSync } from 'node:fs'
import { analyze, chart, DIFFICULTIES } from '../src/shared/analyze'
import type { ChartIndexEntry, SongChart } from '../src/shared/types'

const pcmDir = process.argv[2]
if (!pcmDir) throw new Error('usage: bun scripts/build-charts.ts <pcm-dir>')
const SR = 22050
const rows = readFileSync('scripts/tracks.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))
const index: ChartIndexEntry[] = []
for (const [album = '', slug = '', title = ''] of rows) {
  const buf = readFileSync(`${pcmDir}/${slug}.f32`)
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const t0 = performance.now()
  const a = analyze(pcm, SR)
  const charts = Object.fromEntries(DIFFICULTIES.map((d) => [d, chart(a, d)])) as SongChart['charts']
  const song: SongChart = { slug: slug!, album: album!, title: title!, bpm: a.bpm, firstBeat: Math.round(a.firstBeat * 1000) / 1000, duration: Math.round(a.duration * 10) / 10, charts }
  writeFileSync(`public/charts/${slug}.json`, JSON.stringify(song))
  index.push({ slug: slug!, album: album!, title: title!, bpm: song.bpm, duration: song.duration, notes: Object.fromEntries(DIFFICULTIES.map((d) => [d, charts[d].length])) as ChartIndexEntry['notes'] })
  console.log(`${slug.padEnd(28)} ${a.bpm.toFixed(2).padStart(7)} bpm  beat0 ${song.firstBeat}s  ${DIFFICULTIES.map((d) => `${d}:${charts[d].length}`).join(' ')}  ${Math.round(performance.now() - t0)}ms`)
}
writeFileSync('public/charts/index.json', JSON.stringify(index))
writeFileSync('src/shared/chart-index.json', JSON.stringify(index))
