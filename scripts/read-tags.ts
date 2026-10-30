import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { isRecord, isString } from '../src/shared/guards'
import type { TrackMeta } from '../src/shared/types'

const FOLDERS = ['/mnt/c/Users/Admin/Music/what is real', '/mnt/c/Users/Admin/Music/e']

const slugOf = (file: string) =>
  basename(file, '.flac').replace(/ \(mastered\)(_2)?/, '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')

export const cleanTitle = (raw: string) =>
  raw
    .replace(/\s*\(mastered\)/i, '')
    .replace(/\s*\[[A-Z]\]\s*$/, '')
    .replace(/_\d+$/, '')
    .replaceAll('_', ' ')
    .trim()

type Tags = Readonly<Record<string, string>>

async function tagsOf(file: string): Promise<Tags> {
  const proc = Bun.spawn(['ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', file], { stdout: 'pipe', stderr: 'ignore' })
  const probed: unknown = await new Response(proc.stdout).json()
  const tags = isRecord(probed) && isRecord(probed['format']) && isRecord(probed['format']['tags']) ? probed['format']['tags'] : {}
  return Object.fromEntries(Object.entries(tags).filter((e): e is [string, string] => isString(e[1])).map(([k, v]) => [k.toLowerCase(), v.trim()]))
}

const first = (...values: readonly (string | undefined)[]) => values.find((v) => v !== undefined && v !== '') ?? ''

function trackOf(file: string, tags: Tags, shared: (key: string) => string): TrackMeta {
  const track = Number.parseInt(tags['track'] ?? '', 10)
  return {
    file,
    slug: slugOf(file),
    title: cleanTitle(first(tags['title'], basename(file, '.flac'))),
    artist: first(tags['album_artist'], shared('album_artist'), tags['artist'], shared('artist')),
    album: first(tags['album'], shared('album')),
    track: Number.isNaN(track) ? null : track,
  }
}

async function folderTracks(folder: string) {
  const files = [...new Bun.Glob('*.flac').scanSync({ cwd: folder, absolute: true })].toSorted()
  const tags = await Promise.all(files.map((f) => tagsOf(f)))
  const shared = (key: string) => first(...tags.map((t) => t[key]))
  return files.map((file, i) => trackOf(file, tags[i] ?? {}, shared))
}

const tracks = (await Promise.all(FOLDERS.map((f) => folderTracks(f)))).flat()
writeFileSync('scripts/tracks.json', `${JSON.stringify(tracks, null, 2)}\n`)
console.log(tracks.map((t) => `${t.album} #${t.track ?? '-'} ${t.title} — ${t.artist} (${t.slug})`).join('\n'))
