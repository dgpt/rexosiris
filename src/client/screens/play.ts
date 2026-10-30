import { JUDGMENTS, scoreOf, type SongChart } from '../../shared/types'
import { api } from '../api'
import { audioContext, loadSong, stopPreview } from '../audio'
import { decode, isSongChart } from '../decode'
import { esc, find, hueOf, onClick, render, report, setHue } from '../dom'
import { type GameResult, Session } from '../game/session'
import { nav } from '../nav'
import { currentSettings } from '../settings'
import { pickedSong, state } from '../state'
import { drawTiming, meanOffset } from './timing'

const CALIBRATE_HINT_MS = 18

export async function start() {
  stopPreview()
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

function flawlessBanner(result: GameResult) {
  if (result.counts.miss > 0 || result.holds.ng > 0) return ''
  const allPerfect = result.counts.great + result.counts.good === 0
  return `<p class="fc">${allPerfect ? 'ALL PERFECT' : 'FULL COMBO'}</p>`
}

function timingCaption(mean: number) {
  const hint = Math.abs(mean) > CALIBRATE_HINT_MS ? ` · try Calibrate (you hit ${mean > 0 ? 'late' : 'early'})` : ''
  return `Every hit, early above the line and late below. Average ${mean >= 0 ? '+' : ''}${mean.toFixed(0)} ms${hint}`
}

function resultsMarkup(song: SongChart, result: GameResult, ranked: boolean) {
  const local = scoreOf(result.counts, song.charts[state.picked.difficulty].length)
  const holds = result.holds.ok + result.holds.ng > 0 ? `<p class="muted">Holds ${result.holds.ok} OK · ${result.holds.ng} NG</p>` : ''
  return `<section class="results glass">
    <p class="kicker">${esc(song.title)} · ${state.picked.difficulty}</p>
    <div class="grade g-${local.grade}">${local.grade}</div>
    ${flawlessBanner(result)}
    <p class="score"><span id="score">0</span><small>${(local.accuracy * 100).toFixed(2)}%${result.cleared ? '' : ' · <span class="failed">health ran out</span>'}</small></p>
    <ul class="counts">${JUDGMENTS.map((j) => `<li class="${j}"><span>${j}</span><b>${result.counts[j]}</b></li>`).join('')}<li><span>max combo</span><b>${result.maxCombo}</b></li></ul>
    ${holds}
    <figure class="timing"><canvas id="timing" width="560" height="140" aria-label="Timing of every hit"></canvas><figcaption>${timingCaption(meanOffset(result))}</figcaption></figure>
    <p id="saved" class="muted">${ranked ? 'Saving…' : 'Your own track: not ranked.'}</p>
    <div class="row"><button id="again">Retry</button><button id="back" class="ghost">Song select</button></div></section>`
}

function countUp(el: HTMLElement, to: number) {
  const started = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - started) / 1100)
    el.textContent = Math.round(to * (1 - (1 - k) ** 3)).toLocaleString()
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

async function save(song: SongChart, result: GameResult) {
  const receipt = await api.submit({ slug: song.slug, difficulty: state.picked.difficulty, counts: result.counts, maxCombo: result.maxCombo, cleared: result.cleared })
  state.me = await api.me()
  const saved = find('#saved', HTMLElement)
  if (receipt.personalBest) saved.innerHTML = `<b class="pb">New personal best</b>${receipt.rank === null ? '' : ` · #${receipt.rank} on the leaderboard`}`
  else if (receipt.previousBest !== null) saved.textContent = `Saved. Your best is still ${receipt.previousBest.score.toLocaleString()} (${receipt.previousBest.grade}).`
}

function results(song: SongChart, run: { buffer: AudioBuffer; ranked: boolean; hue: number }, result: GameResult) {
  setHue(run.hue)
  render('results', resultsMarkup(song, result, run.ranked))
  drawTiming(find('#timing', HTMLCanvasElement), result, song.duration)
  countUp(find('#score', HTMLElement), scoreOf(result.counts, song.charts[state.picked.difficulty].length).score)
  onClick('#again', () => (run.ranked ? start() : play(song, run.buffer, false)))
  onClick('#back', () => { nav().select() })
  if (run.ranked) {
    save(song, result).catch((error: unknown) => {
      find('#saved', HTMLElement).textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}`
      report(error)
    })
  }
}
