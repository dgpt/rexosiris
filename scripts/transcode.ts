import { existsSync } from 'node:fs'
import { songs } from './charts/songs'

const BITRATE = '128k'

for (const { track } of songs([])) {
  const out = `public/audio/${track.slug}.mp3`
  if (existsSync(out)) continue
  const encode = Bun.spawnSync(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', track.file, '-vn', '-ac', '2', '-b:a', BITRATE, out])
  if (encode.exitCode !== 0) throw new Error(`ffmpeg could not encode ${track.file}: ${encode.stderr.toString()}`)
  console.log(out)
}
