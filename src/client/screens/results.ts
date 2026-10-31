import { JUDGMENTS, scoreOf, type ScoreSubmission, type SongChart } from '../../shared/types'
import { api } from '../api'
import { esc, find, onClick, render, report, setHue } from '../dom'
import type { GameResult } from '../game/session'
import { nav } from '../nav'
import { state } from '../state'
import { drawTiming, meanOffset } from './timing'

const CALIBRATE_HINT_MS = 18

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
  return `<section class="results">
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

const submissionOf = (song: SongChart, result: GameResult): ScoreSubmission =>
  ({ slug: song.slug, difficulty: state.picked.difficulty, counts: result.counts, maxCombo: result.maxCombo, cleared: result.cleared })

function offerSignIn(song: SongChart, result: GameResult) {
  const saved = find('#saved', HTMLElement)
  saved.innerHTML = '<button id="keep" class="ghost">Sign in to save this score</button>'
  onClick('#keep', () => {
    state.pending = submissionOf(song, result)
    nav().auth()
  })
}

async function save(song: SongChart, result: GameResult) {
  const receipt = await api.submit(submissionOf(song, result))
  state.me = await api.me()
  const saved = find('#saved', HTMLElement)
  if (receipt.personalBest) saved.innerHTML = `<b class="pb">New personal best</b>${receipt.rank === null ? '' : ` · #${receipt.rank} on the leaderboard`}`
  else if (receipt.previousBest !== null) saved.textContent = `Saved. Your best is still ${receipt.previousBest.score.toLocaleString()} (${receipt.previousBest.grade}).`
}

export function results(song: SongChart, run: { buffer: AudioBuffer; ranked: boolean; hue: number }, result: GameResult) {
  setHue(run.hue)
  render('results', resultsMarkup(song, result, run.ranked))
  drawTiming(find('#timing', HTMLCanvasElement), result, song.duration)
  countUp(find('#score', HTMLElement), scoreOf(result.counts, song.charts[state.picked.difficulty].length).score)
  onClick('#again', () => (run.ranked ? nav().start() : nav().play(song, run.buffer, false)))
  onClick('#back', () => { nav().select() })
  if (run.ranked && state.me === null) offerSignIn(song, result)
  else if (run.ranked) {
    save(song, result).catch((error: unknown) => {
      find('#saved', HTMLElement).textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}`
      report(error)
    })
  }
}
