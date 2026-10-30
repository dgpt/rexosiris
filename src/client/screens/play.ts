import type { SongChart } from '../../shared/types'
import { audioContext, loadSong, stopPreview } from '../audio'
import { decode, isSongChart } from '../decode'
import { esc, find, hueOf, onClick, render } from '../dom'
import { stopListening } from '../listen'
import { Session } from '../game/session'
import { nav } from '../nav'
import { currentSettings } from '../settings'
import { pickedSong, state } from '../state'
import { results } from './results'

export async function start() {
  stopPreview()
  stopListening()
  const song = pickedSong()
  render('loading', `<div class="loading"><div class="spinner"></div>Loading ${esc(song.title)}…</div>`)
  const [chartJson, buffer] = await Promise.all([fetch(`/charts/${song.slug}.json`).then((r): Promise<unknown> => r.json()), loadSong(song.slug)])
  await play(decode(chartJson, isSongChart, 'chart'), buffer, true)
}

export async function play(song: SongChart, buffer: AudioBuffer, ranked: boolean) {
  const ctx = audioContext()
  await ctx.resume()
  render('play', '<canvas id="stage" class="stage" aria-label="Playfield"></canvas><button type="button" class="quit" aria-label="Quit this song">×</button>')
  const hue = hueOf(song.slug === 'custom' ? song.title : song.slug)
  const settings = currentSettings()
  const session = new Session(find('#stage', HTMLCanvasElement), { ctx, buffer }, {
    title: song.title,
    notes: song.charts[state.picked.difficulty],
    sections: song.sections ?? [],
    bpm: song.bpm,
    firstBeat: song.firstBeat,
  }, { offsetMs: settings.offsetMs, speed: settings.speed, hue })
  onClick('.quit', () => { session.quit() })
  const result = await session.run()
  if (result.quit) {
    nav().select()
    return
  }
  results(song, { buffer, ranked, hue }, result)
}
