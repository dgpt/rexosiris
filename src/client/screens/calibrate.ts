import { audioContext, stopPreview } from '../audio'
import { find, onClick, render } from '../dom'
import { nav } from '../nav'
import { saveSettings } from '../settings'

const BPM = 100
const TAPS = 16
const WARMUP_BEATS = 2
const PERIOD = 60 / BPM

export function median(xs: readonly number[]) {
  const sorted = xs.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function click(ctx: AudioContext, at: number, accent: boolean) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = accent ? 1320 : 880
  gain.gain.setValueAtTime(0.5, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + 0.07)
}

function pulseDot(ctx: AudioContext, dot: HTMLElement, startedAt: number, signal: AbortSignal) {
  const frame = () => {
    if (signal.aborted) return
    const phase = (((ctx.currentTime - startedAt) / PERIOD) % 1 + 1) % 1
    dot.style.transform = `scale(${1 + 0.4 * Math.max(0, 1 - phase * 4)})`
    requestAnimationFrame(frame)
  }
  frame()
}

type TapUi = { readonly dot: HTMLElement; readonly message: HTMLElement }

function listenForTaps(ctx: AudioContext, ui: TapUi, signal: AbortSignal, done: (offset: number | null) => void) {
  let startedAt = Number.NaN
  const deltas: number[] = []
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    e.preventDefault()
    if (Number.isNaN(startedAt)) {
      startedAt = ctx.currentTime + 0.5
      for (let i = 0; i < TAPS + 8; i++) click(ctx, startedAt + i * PERIOD, i % 4 === 0)
      ui.message.textContent = 'Tap on every click…'
      pulseDot(ctx, ui.dot, startedAt, signal)
      return
    }
    const t = ctx.currentTime - startedAt
    const beat = Math.round(t / PERIOD)
    if (beat < WARMUP_BEATS) return
    deltas.push((t - beat * PERIOD) * 1000)
    ui.message.textContent = `${deltas.length} / ${TAPS}`
    if (deltas.length >= TAPS) settle(Math.round(median(deltas)))
  }
  const settle = (offset: number | null) => {
    removeEventListener('keydown', onKey)
    done(offset)
  }
  signal.addEventListener('abort', () => { settle(null) })
  addEventListener('keydown', onKey)
}

const measure = (ctx: AudioContext, ui: TapUi, signal: AbortSignal) =>
  new Promise<number | null>((resolve) => { listenForTaps(ctx, ui, signal, resolve) })

function verdict(offset: number) {
  if (Math.abs(offset) <= 10) return 'Right on the click. Nothing to fix.'
  if (offset > 0) return `You tap ${offset} ms after the click, so notes will wait ${offset} ms for you.`
  return `You tap ${-offset} ms before the click, so notes will come ${-offset} ms early to meet you.`
}

const intro = (welcome: boolean) => welcome
  ? `<h2>One thing first</h2><p>Every setup has its own lag between the music and your keys. Tap along to some clicks so the notes line up with yours.</p>`
  : '<h2>Calibrate</h2><p>Tap along to the clicks so the notes line up with your speakers and keyboard.</p>'

export async function calibrate(options: { readonly welcome?: boolean } = {}) {
  const welcome = options.welcome === true
  stopPreview()
  render('select', `<section class="card glass cal">${intro(welcome)}
    <div class="beatdot" id="dot"></div><p id="calibrate-message" class="muted">Press <kbd>Space</kbd> to start, then tap <kbd>Space</kbd> on every click. ${TAPS} taps.</p>
    <div class="row"><button id="calibrate-back" class="ghost">${welcome ? 'Skip' : 'Back'}</button></div></section>`)
  const abort = new AbortController()
  onClick('#calibrate-back', () => {
    abort.abort()
    nav().select()
  })
  const ctx = audioContext()
  await ctx.resume()
  const message = find('#calibrate-message', HTMLElement)
  const offset = await measure(ctx, { dot: find('#dot', HTMLElement), message }, abort.signal)
  if (offset === null) return
  await saveSettings({ offsetMs: offset })
  message.textContent = verdict(offset)
  find('#calibrate-back', HTMLButtonElement).textContent = welcome ? 'Pick a song' : 'Done'
}
