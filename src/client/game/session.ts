import type { Lane, Note, Section } from '../../shared/analyze'
import type { Counts, Judgment } from '../../shared/types'
import { heardTime } from '../audio'
import { Effects } from './effects'
import { LaneFlashes } from './flashes'
import { drawCombo, drawHud } from './hud'
import { FEVER_COMBO, judge, KEY_LANES, MISS_AFTER_SECONDS, type Offset, Scorecard } from './judge'
import { drawNotes, isHold, type LiveNote } from './notes'
import { type Frame, HOLD_GOLD, JUDGE_COLOR, laneCenter, LANES, layoutFor } from './render'
import { drawBackground, drawField, drawHealth, makeStars } from './stage'

export type GameResult = {
  readonly counts: Counts
  readonly maxCombo: number
  readonly cleared: boolean
  readonly quit: boolean
  readonly offsets: readonly Offset[]
  readonly holds: { readonly ok: number; readonly ng: number }
}

export type Song = {
  readonly title: string
  readonly notes: readonly Note[]
  readonly sections: readonly Section[]
  readonly bpm: number
  readonly firstBeat: number
}

export type Options = { readonly offsetMs: number; readonly speed: number; readonly hue: number }

const START_MARGIN_SECONDS = 0.05
const HOLD_RELEASE_GRACE = 0.08

export class Session {
  private readonly card = new Scorecard()
  private readonly effects = new Effects()
  private readonly flashes = new LaneFlashes()
  private readonly stars = makeStars()
  private readonly notes: LiveNote[]
  private readonly held = [false, false, false]
  private readonly active: (LiveNote | null)[] = [null, null, null]
  private readonly touches = new Map<number, Lane>()
  private readonly spectrum: Uint8Array<ArrayBuffer>
  private readonly analyser: AnalyserNode
  private readonly source: AudioBufferSourceNode
  private readonly startAt: number
  private next = 0
  private flash: { judgment: Judgment; at: number; ms: number | null } | null = null
  private milestone: { text: string; at: number } | null = null
  private voice = { name: '', since: 0 }
  private done = false
  private stop: ((quit: boolean) => void) | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: { readonly ctx: AudioContext; readonly buffer: AudioBuffer },
    private readonly song: Song,
    private readonly options: Options,
  ) {
    this.notes = song.notes.map((n) => ({ ...n, state: 'waiting', droppedAt: null }))
    this.source = audio.ctx.createBufferSource()
    this.source.buffer = audio.buffer
    this.analyser = audio.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount)
    this.source.connect(this.analyser).connect(audio.ctx.destination)
    this.startAt = audio.ctx.currentTime + START_MARGIN_SECONDS
  }

  run(): Promise<GameResult> {
    return new Promise((resolve) => { this.attach(resolve) })
  }

  private attach(resolve: (result: GameResult) => void) {
    const onKey = (e: KeyboardEvent) => { this.key(e, finish) }
    const onUp = (e: KeyboardEvent) => { this.release(KEY_LANES[e.code]) }
    const onTouch = (e: TouchEvent) => { this.touch(e) }
    const onTouchEnd = (e: TouchEvent) => { this.untouch(e) }
    const onBlur = () => { this.releaseAll() }
    const finish = (quit: boolean) => {
      if (this.done) return
      this.done = true
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onUp)
      this.canvas.removeEventListener('touchstart', onTouch)
      this.canvas.removeEventListener('touchend', onTouchEnd)
      this.canvas.removeEventListener('touchcancel', onTouchEnd)
      removeEventListener('blur', onBlur)
      this.source.stop()
      resolve(this.result(quit))
    }
    this.stop = finish
    addEventListener('keydown', onKey)
    addEventListener('keyup', onUp)
    this.canvas.addEventListener('touchstart', onTouch, { passive: false })
    this.canvas.addEventListener('touchend', onTouchEnd)
    this.canvas.addEventListener('touchcancel', onTouchEnd)
    addEventListener('blur', onBlur)
    this.source.start(this.startAt)
    const tick = () => {
      if (this.done) return
      if (this.frame()) finish(false)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  quit() {
    this.stop?.(true)
  }

  private songTime(at?: number) {
    return heardTime(this.audio.ctx, at) - this.startAt - this.options.offsetMs / 1000
  }

  private key(e: KeyboardEvent, finish: (quit: boolean) => void) {
    if (e.code === 'Escape') {
      finish(true)
      return
    }
    const lane = KEY_LANES[e.code]
    if (lane === undefined || e.repeat) return
    e.preventDefault()
    this.press(lane, this.songTime(e.timeStamp))
  }

  private touch(e: TouchEvent) {
    e.preventDefault()
    const box = this.canvas.getBoundingClientRect()
    const layout = layoutFor(box.width, box.height)
    for (const t of e.changedTouches) {
      const lane = Math.floor((t.clientX - box.left - layout.x0) / layout.laneW)
      const known = LANES.find((l) => l === lane)
      if (known !== undefined) {
        this.touches.set(t.identifier, known)
        this.press(known, this.songTime(e.timeStamp))
      }
    }
  }

  private untouch(e: TouchEvent) {
    for (const t of e.changedTouches) {
      this.release(this.touches.get(t.identifier))
      this.touches.delete(t.identifier)
    }
  }

  private releaseAll() {
    this.touches.clear()
    for (const lane of LANES) this.release(lane)
  }

  private release(lane: Lane | undefined) {
    if (lane !== undefined) this.held[lane] = false
  }

  private press(lane: Lane, t: number) {
    this.held[lane] = true
    const candidates = this.notes.slice(this.next).filter((n) => n.state === 'waiting' && n.lane === lane && n.t - t <= MISS_AFTER_SECONDS)
    const target = candidates.toSorted((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
    if (target === undefined) return
    const ms = (t - target.t) * 1000
    const judgment = judge(ms)
    if (judgment === null) return
    target.state = isHold(target) ? 'holding' : 'hit'
    if (isHold(target)) this.active[lane] = target
    this.score(judgment, target, ms)
  }

  private score(judgment: Judgment, note: LiveNote, ms: number | null) {
    const wasFever = this.card.fever
    this.card.record(judgment, note.t, ms)
    this.flash = { judgment, at: performance.now(), ms }
    const layout = layoutFor(this.canvas.clientWidth, this.canvas.clientHeight)
    this.flashes.strike(note.lane, judgment === 'miss' ? 'miss' : 'hit', JUDGE_COLOR[judgment])
    if (judgment !== 'miss') this.effects.burst(laneCenter(layout, note.lane), layout.receptorY, JUDGE_COLOR[judgment], judgment === 'perfect' ? 14 : 8)
    if (wasFever && !this.card.fever) this.milestone = { text: 'FEVER LOST', at: performance.now() }
    if (this.card.combo === FEVER_COMBO) this.milestone = { text: 'FEVER!', at: performance.now() }
    else if (this.card.combo > 0 && this.card.combo % 50 === 0) this.milestone = { text: `${this.card.combo} COMBO`, at: performance.now() }
  }

  private sweep(t: number) {
    for (; this.next < this.notes.length; this.next++) {
      const note = this.notes[this.next]
      if (note === undefined || (note.state === 'waiting' && t - note.t <= MISS_AFTER_SECONDS)) break
      if (note.state === 'waiting') {
        note.state = 'missed'
        this.score('miss', note, null)
      }
    }
    for (const lane of LANES) this.settleHold(lane, t)
  }

  private settleHold(lane: Lane, t: number) {
    const hold = this.active[lane]
    if (hold === null || hold === undefined) return
    const end = hold.t + (hold.len ?? 0)
    if (t >= end) this.finishHold(lane, hold, null)
    else if (!(this.held[lane] ?? false) && t < end - HOLD_RELEASE_GRACE) this.finishHold(lane, hold, t)
  }

  private finishHold(lane: Lane, hold: LiveNote, droppedAt: number | null) {
    const ok = droppedAt === null
    hold.state = ok ? 'held' : 'dropped'
    hold.droppedAt = droppedAt
    this.active[lane] = null
    this.card.hold(ok)
    this.flashes.strike(lane, ok ? 'released' : 'miss', ok ? HOLD_GOLD : JUDGE_COLOR.miss)
    const layout = layoutFor(this.canvas.clientWidth, this.canvas.clientHeight)
    if (ok) this.effects.burst(laneCenter(layout, lane), layout.receptorY, HOLD_GOLD, 12)
  }

  private frame(): boolean {
    const t = this.songTime()
    this.sweep(t)
    this.draw(t)
    if (t <= this.audio.buffer.duration + 0.5) return false
    for (const note of this.notes.slice(this.next).filter((n) => n.state === 'waiting')) {
      note.state = 'missed'
      this.score('miss', note, null)
    }
    return true
  }

  private makeFrame(t: number): Frame {
    const dpr = devicePixelRatio
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== Math.round(w * dpr)) this.canvas.width = Math.round(w * dpr)
    if (this.canvas.height !== Math.round(h * dpr)) this.canvas.height = Math.round(h * dpr)
    const g = this.canvas.getContext('2d')
    if (g === null) throw new Error('Canvas 2D is not available')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.analyser.getByteFrequencyData(this.spectrum)
    const beat = (t - this.song.firstBeat) / (60 / this.song.bpm)
    const pulse = t >= 0 ? (1 - (beat - Math.floor(beat))) ** 4 : 0
    const bass = this.spectrum.slice(0, 6).reduce((a, b) => a + b, 0) / (6 * 255)
    const hue = (this.options.hue + (this.card.fever ? (performance.now() / 40) % 360 : 0)) % 360
    const pxPerSec = Math.max(380, h * 0.75) * this.options.speed
    return { g, layout: layoutFor(w, h), t, pulse, downbeat: Math.floor(beat) % 4 === 0, hue, bass, pxPerSec }
  }

  private draw(t: number) {
    const f = this.makeFrame(t)
    const now = performance.now()
    const section = this.song.sections.findLast((s) => s.t <= t)
    if (section !== undefined && section.voice !== this.voice.name) this.voice = { name: section.voice, since: now }
    drawBackground(f, this.stars, this.spectrum)
    drawField(f, LANES.map((lane) => ({ held: this.held[lane] ?? false, holding: this.active[lane] !== null, flash: this.flashes.of(lane) })), this.card.fever)
    drawCombo(f, this.card)
    drawNotes(f, this.notes)
    this.effects.draw(f.g, f.layout.r)
    drawHealth(f, this.card)
    drawHud(f, this.card, {
      title: this.song.title,
      bpm: this.song.bpm,
      progress: Math.min(1, Math.max(0, t / this.audio.buffer.duration)),
      voice: this.voice.name,
      voiceAge: now - this.voice.since,
      flash: this.flash === null ? null : { judgment: this.flash.judgment, age: now - this.flash.at, ms: this.flash.ms },
      milestone: this.milestone === null ? null : { text: this.milestone.text, age: now - this.milestone.at },
    })
  }

  private result(quit: boolean): GameResult {
    const dead = this.notes.filter((n) => isHold(n) && n.state === 'missed').length
    return { counts: this.card.counts, maxCombo: this.card.maxCombo, cleared: this.card.cleared, quit, offsets: this.card.offsets, holds: { ok: this.card.holds.ok, ng: this.card.holds.ng + dead } }
  }
}
