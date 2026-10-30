import { audioContext, heardTime, stopPreview } from '../audio'
import { find, onClick, render } from '../dom'
import { nav } from '../nav'
import { currentSettings, saveSettings } from '../settings'
import { metronome, type Metronome, PERIOD } from './metronome'

const TAPS = 20
const WARMUP_BEATS = 3
const STRAY_MS = 150
const MAX_SPREAD_MS = 70

export function median(xs: readonly number[]) {
  const sorted = xs.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function spread(xs: readonly number[]) {
  const sorted = xs.toSorted((a, b) => a - b)
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0
  return at(0.75) - at(0.25)
}

type Ui = { readonly dot: HTMLElement; readonly bar: HTMLElement; readonly hint: HTMLElement }
type Taps = { readonly offset: number; readonly spread: number }

function listenForTaps(ctx: AudioContext, ui: Ui, signal: AbortSignal, done: (taps: Taps | null) => void) {
  let clicks: Metronome | null = null
  let lastBeat = -1
  const deltas: number[] = []
  const settle = (taps: Taps | null) => {
    removeEventListener('keydown', onKey)
    clicks?.stop()
    done(taps)
  }
  const tap = (at: number) => {
    if (clicks === null) return
    const t = heardTime(ctx, at) - clicks.startedAt
    const beat = Math.round(t / PERIOD)
    const ms = (t - beat * PERIOD) * 1000
    if (beat < WARMUP_BEATS) return
    const stray = Math.abs(ms) > STRAY_MS || beat === lastBeat
    lastBeat = beat
    ui.hint.textContent = stray ? 'That one missed the click. Tap once per click, right as you hear it.' : ''
    if (stray) return
    deltas.push(ms)
    ui.bar.style.width = `${(deltas.length / TAPS) * 100}%`
    if (deltas.length >= TAPS) settle({ offset: Math.round(median(deltas)), spread: spread(deltas) })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return
    e.preventDefault()
    if (clicks === null) clicks = metronome(ctx, ui.dot, signal)
    else tap(e.timeStamp)
  }
  signal.addEventListener('abort', () => { settle(null) })
  addEventListener('keydown', onKey)
}

const measure = (ctx: AudioContext, ui: Ui, signal: AbortSignal) =>
  new Promise<Taps | null>((resolve) => { listenForTaps(ctx, ui, signal, resolve) })

const signed = (ms: number) => (ms < 0 ? `${-ms} ms early` : `${ms} ms late`)

function verdict(offset: number) {
  if (offset === 0) return 'Saved: you tap right on the click.'
  const shift = offset > 0 ? `notes will wait ${offset} ms for you` : `notes will come ${-offset} ms early to meet you`
  return `Saved: you tap ${signed(offset)}, so ${shift}.`
}

const intro = (welcome: boolean) => welcome
  ? `<h2>One thing first</h2><p>Every setup has its own lag between the music and your keys. Tap along to some clicks so the notes line up with yours.</p>`
  : '<h2>Calibrate</h2><p>Tap along to the clicks so the notes line up with your speakers and keyboard.</p>'

const markup = (welcome: boolean, previous: number) => `<section class="card glass cal">${intro(welcome)}
  <div class="beatdot" id="dot"></div>
  <div class="calbar" aria-hidden="true"><i id="calbar"></i></div>
  <p class="muted">Press <kbd>Space</kbd> to start the clicks, then tap <kbd>Space</kbd> on every click.</p>
  <p id="calibrate-hint" class="hint" role="status"></p>
  <p id="calibrate-result" class="result" role="status">${previous === 0 ? '' : `Last time: ${signed(previous)}.`}</p>
  <div class="row"><button id="calibrate-again" class="ghost" hidden>Again</button><button id="calibrate-back" class="ghost">${welcome ? 'Skip' : 'Back'}</button></div></section>`

export async function calibrate(options: { readonly welcome?: boolean } = {}) {
  const welcome = options.welcome === true
  stopPreview()
  render('calibrate', markup(welcome, currentSettings().offsetMs))
  const abort = new AbortController()
  onClick('#calibrate-back', () => {
    abort.abort()
    nav().select()
  })
  onClick('#calibrate-again', () => calibrate(options))
  const ctx = audioContext()
  await ctx.resume()
  const ui: Ui = { dot: find('#dot', HTMLElement), bar: find('#calbar', HTMLElement), hint: find('#calibrate-hint', HTMLElement) }
  const taps = await measure(ctx, ui, abort.signal)
  if (taps === null) return
  const result = find('#calibrate-result', HTMLElement)
  find('#calibrate-again', HTMLButtonElement).hidden = false
  if (taps.spread > MAX_SPREAD_MS) {
    result.textContent = 'Those taps were too uneven to measure, so nothing was saved. Try again?'
    return
  }
  await saveSettings({ offsetMs: taps.offset })
  result.textContent = verdict(taps.offset)
  find('#calibrate-back', HTMLButtonElement).textContent = welcome ? 'Pick a song' : 'Done'
}
