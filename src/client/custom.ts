import { analyze, chart, DIFFICULTIES, type Difficulty } from '../shared/analyze'
import type { SongChart } from '../shared/types'

const ANALYSIS_RATE = 22050

export async function chartFromFile(ctx: AudioContext, file: File, onStage: (s: string) => void): Promise<{ song: SongChart; buffer: AudioBuffer }> {
  onStage('Decoding audio…')
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
  onStage('Mixing down for analysis…')
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * ANALYSIS_RATE), ANALYSIS_RATE)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination)
  src.start()
  const mono = (await offline.startRendering()).getChannelData(0)
  onStage('Finding the beat…')
  await new Promise((r) => setTimeout(r, 0))
  const a = analyze(mono, ANALYSIS_RATE)
  const charts = Object.fromEntries(DIFFICULTIES.map((d) => [d, chart(a, d)])) as Record<Difficulty, ReturnType<typeof chart>>
  const title = file.name.replace(/\.[^.]+$/, '')
  return {
    buffer,
    song: { slug: 'custom', album: 'your track', title, bpm: a.bpm, firstBeat: a.firstBeat, duration: a.duration, charts },
  }
}
