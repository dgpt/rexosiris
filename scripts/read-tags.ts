import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { TrackMeta } from '../src/shared/types'

const FOLDERS = ['/mnt/c/Users/Admin/Music/what is real', '/mnt/c/Users/Admin/Music/e']

const slugOf = (file: string) =>
  basename(file, '.flac').replace(/ \(mastered\)(_2)?/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const cleanTitle = (raw: string) =>
  raw
    .replace(/\s*\(mastered\)/i, '')
    .replace(/\s*\[[A-Z]\]\s*$/, '')
    .replace(/_\d+$/, '')
    .replace(/_/g, ' ')
    .trim()

async function tagsOf(file: string): Promise<Record<string, string>> {
  const proc = Bun.spawn(['ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', file], { stdout: 'pipe', stderr: 'ignore' })
  const json = (await new Response(proc.stdout).json()) as { format?: { tags?: Record<string, string> } }
  return Object.fromEntries(Object.entries(json.format?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()]))
}

const tracks: TrackMeta[] = []
for (const folder of FOLDERS) {
  const files = [...new Bun.Glob('*.flac').scanSync({ cwd: folder, absolute: true })].sort()
  const tags = await Promise.all(files.map(tagsOf))
  const shared = (key: string) => tags.map((t) => t[key]).find((v) => v) ?? ''
  tags.forEach((t, i) => {
    tracks.push({
      file: files[i]!,
      slug: slugOf(files[i]!),
      title: cleanTitle(t.title || basename(files[i]!, '.flac')),
      artist: t.album_artist || shared('album_artist') || t.artist || shared('artist'),
      album: t.album || shared('album'),
      track: t.track ? Number.parseInt(t.track, 10) : null,
    })
  })
}
writeFileSync('scripts/tracks.json', `${JSON.stringify(tracks, null, 2)}\n`)
console.log(tracks.map((t) => `${t.album} #${t.track ?? '-'} ${t.title} — ${t.artist} (${t.slug})`).join('\n'))
