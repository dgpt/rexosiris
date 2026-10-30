import { readFileSync, writeFileSync } from 'node:fs'
import { align, onsetsOf, tempoFits, type Alignment } from './align'
import { readProject } from './project'
import { notesOf, type ProjectNote } from './timeline'

const SR = 22_050
const MIN_NOTES = 50
const [pcmDir = '', listFile = '', out = '', ...only] = process.argv.slice(2)
if (out === '') throw new Error('usage: bun scripts/flp/match.ts <pcm-dir> <list of .flp paths> <out.json> [slug...]')

const lines = (path: string) => readFileSync(path, 'utf8').split('\n').filter((l) => l !== '')
const slugs = only.length > 0 ? only : lines(`${pcmDir}/slugs.txt`)

type Candidate = { readonly path: string; readonly tempo: number; readonly notes: readonly ProjectNote[] }

function candidate(path: string): Candidate | null {
  try {
    const project = readProject(new Uint8Array(readFileSync(path)))
    const notes = notesOf(project)
    return notes.length > MIN_NOTES ? { path, tempo: project.tempo, notes } : null
  } catch {
    return null
  }
}

const projects = lines(listFile).map((path) => candidate(path)).filter((c) => c !== null)
console.log(`${projects.length} projects parsed with notes`)

type Match = Alignment & { readonly path: string }
const results: Record<string, readonly Match[]> = {}
const describe = (m: Match | undefined) => m === undefined ? '-' : `${m.contrast.toFixed(2)} drift ${m.drift.toFixed(2)} hit ${m.hitRate.toFixed(2)} x${m.scale} ${m.path}`

for (const slug of slugs) {
  const buffer = readFileSync(`${pcmDir}/${slug}.f32`)
  const onsets = onsetsOf(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4), SR)
  const ranked = projects
    .filter((p) => tempoFits(p.tempo, onsets.bpm))
    .map((p): Match => Object.assign(align(onsets, p.notes), { path: p.path }))
    .filter((m) => m.contrast > 0)
    .toSorted((a, b) => b.contrast - a.contrast)
  results[slug] = ranked.slice(0, 5)
  const [top, runner] = ranked
  console.log(`${slug.padEnd(30)} ${describe(top)}   | next ${describe(runner)}`)
}
writeFileSync(out, JSON.stringify(results, null, 2))
