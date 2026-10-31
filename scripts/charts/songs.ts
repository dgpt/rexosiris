import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Difficulty } from '../../src/shared/analyze'
import { isArrayOf, isNumber, isRecord, isString } from '../../src/shared/guards'
import type { TrackMeta } from '../../src/shared/types'
import { type ProjectLink, readLinks } from '../flp/link'

export const SAMPLE_RATE = 22_050
export const STARS: Record<Difficulty, number> = { easy: 0.9, normal: 1.4, hard: 2.1 }

export type Song = { readonly track: TrackMeta; readonly link: ProjectLink | undefined }

const isTrack = (v: unknown): v is TrackMeta =>
  isRecord(v) && isString(v['file']) && isString(v['slug']) && isString(v['title']) && isString(v['artist']) && isString(v['album']) && (v['track'] === null || isNumber(v['track']))

export function songs(only: readonly string[]): Song[] {
  const parsed: unknown = JSON.parse(readFileSync('scripts/tracks.json', 'utf8'))
  if (!isArrayOf(isTrack)(parsed)) throw new Error('scripts/tracks.json is not a track list: run bun scripts/read-tags.ts')
  const links = readLinks()
  const unknown = only.filter((slug) => !parsed.some((t) => t.slug === slug))
  if (unknown.length > 0) throw new Error(`not in scripts/tracks.json: ${unknown.join(', ')}`)
  return parsed.filter((t) => only.length === 0 || only.includes(t.slug)).map((track) => ({ track, link: links[track.slug] }))
}

export const workPaths = (work: string, slug: string) => ({
  pcm: join(work, 'pcm', `${slug}.f32`),
  timing: (seed: number) => join(work, 'timing', slug, `s${seed}`),
  grid: join(work, 'grids', `${slug}.osu`),
  chart: (difficulty: Difficulty, seed: number) => join(work, 'charts', slug, `${difficulty}-s${seed}`),
  charts: join(work, 'charts', slug),
})

export const beatmapIn = (dir: string): string | undefined => {
  const name = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('.osu')) : undefined
  return name === undefined ? undefined : join(dir, name)
}

export function chartFiles(work: string, slug: string, difficulty: Difficulty): string[] {
  const dir = workPaths(work, slug).charts
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((d) => d.startsWith(`${difficulty}-s`))
    .flatMap((d) => beatmapIn(join(dir, d)) ?? [])
}

export function audioOf(work: string, track: TrackMeta): string {
  const linked = join(work, 'audio', `${track.slug}${extname(track.file)}`)
  if (!existsSync(linked)) {
    mkdirSync(join(work, 'audio'), { recursive: true })
    symlinkSync(track.file, linked)
  }
  return linked
}

export function pcmOf(work: string, track: TrackMeta): Float32Array {
  const file = workPaths(work, track.slug).pcm
  if (!existsSync(file)) {
    mkdirSync(join(work, 'pcm'), { recursive: true })
    const decode = Bun.spawnSync(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', track.file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', file])
    if (decode.exitCode !== 0) throw new Error(`ffmpeg could not decode ${track.file}: ${decode.stderr.toString()}`)
  }
  const bytes = readFileSync(file)
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}
