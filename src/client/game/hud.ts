import { COUNTDOWN_SECONDS } from '../../shared/countdown'
import type { Judgment } from '../../shared/types'
import type { Scorecard } from './judge'
import { FONT, type Frame, JUDGE_COLOR } from './render'

export type Hud = {
  readonly title: string
  readonly bpm: number
  readonly progress: number
  readonly voice: string
  readonly voiceAge: number
  readonly flash: { readonly judgment: Judgment; readonly age: number; readonly ms: number | null } | null
  readonly milestone: { readonly text: string; readonly age: number } | null
}

const HUD_LEFT = 58
const GO_SECONDS = 0.5
const FLASH_MS = 500
const MILESTONE_MS = 1200
const VOICE_LABEL: Readonly<Record<string, string>> = { kick: 'KICK', bass: 'BASS', snare: 'SNARE', lead: 'LEAD', hats: 'HATS', air: 'CYMBALS' }

type TextAt = { readonly x: number; readonly y: number; readonly font: string; readonly color: string; readonly align: CanvasTextAlign }

function text(g: CanvasRenderingContext2D, value: string, at: TextAt) {
  g.textAlign = at.align
  g.font = at.font
  g.fillStyle = at.color
  g.fillText(value, at.x, at.y)
}

const fieldMiddle = (f: Frame) => f.layout.receptorY + (f.layout.h - f.layout.receptorY) * 0.45

export function drawCombo(f: Frame, card: Scorecard) {
  if (card.combo < 4) return
  const { g, layout } = f
  const y = fieldMiddle(f)
  g.globalAlpha = 0.5
  text(g, String(card.combo), { x: layout.w / 2, y, font: `900 ${64 + f.pulse * 10}px ${FONT}`, color: card.fever ? `hsl(${f.hue}, 100%, 72%)` : '#fff', align: 'center' })
  text(g, 'COMBO', { x: layout.w / 2, y: y + 26, font: `700 13px ${FONT}`, color: '#fff', align: 'center' })
  g.globalAlpha = 1
}

export function drawHud(f: Frame, card: Scorecard, hud: Hud) {
  const { g, layout } = f
  g.fillStyle = `hsl(${f.hue}, 90%, 65%)`
  g.fillRect(0, 0, layout.w * hud.progress, 3)
  text(g, hud.title, { x: HUD_LEFT, y: 34, font: `700 16px ${FONT}`, color: 'rgba(255,255,255,0.85)', align: 'left' })
  text(g, `${Math.round(hud.bpm)} BPM`, { x: HUD_LEFT, y: 52, font: `500 12px ${FONT}`, color: 'rgba(255,255,255,0.5)', align: 'left' })
  text(g, `${(card.accuracy * 100).toFixed(2)}%`, { x: layout.w - 20, y: 40, font: `700 26px ${FONT}`, color: '#fff', align: 'right' })
  if (card.counts.miss === 0 && card.holds.ng === 0 && card.maxCombo > 0) text(g, 'FULL COMBO SO FAR', { x: layout.w - 20, y: 60, font: `600 12px ${FONT}`, color: '#ffd23d', align: 'right' })
  if (hud.voice !== '') {
    text(g, 'FOLLOWING', { x: 20, y: layout.h - 52, font: `600 11px ${FONT}`, color: 'rgba(255,255,255,0.45)', align: 'left' })
    const grow = Math.max(0, 1 - hud.voiceAge / 400)
    text(g, VOICE_LABEL[hud.voice] ?? hud.voice.toUpperCase(), { x: 20, y: layout.h - 28, font: `800 ${22 + grow * 10}px ${FONT}`, color: `hsl(${(f.hue + 160) % 360}, 95%, 70%)`, align: 'left' })
  }
  drawJudgment(f, hud)
  drawCountdown(f)
  drawMilestone(f, hud)
}

function drawJudgment(f: Frame, hud: Hud) {
  const flash = hud.flash
  if (flash === null || flash.age >= FLASH_MS) return
  const { g, layout } = f
  const top = layout.receptorY - layout.r
  const pop = flash.age < 90 ? 1.3 - (flash.age / 90) * 0.3 : 1
  g.save()
  g.translate(layout.w / 2, top - 30)
  g.scale(pop, pop)
  g.globalAlpha = 1 - Math.max(0, flash.age - 300) / 200
  g.shadowColor = JUDGE_COLOR[flash.judgment]
  g.shadowBlur = 14
  text(g, flash.judgment.toUpperCase(), { x: 0, y: 0, font: `900 28px ${FONT}`, color: JUDGE_COLOR[flash.judgment], align: 'center' })
  g.shadowBlur = 0
  if (flash.ms !== null && flash.judgment !== 'perfect') text(g, flash.ms < 0 ? 'EARLY' : 'LATE', { x: 0, y: 17, font: `700 11px ${FONT}`, color: 'rgba(255,255,255,0.75)', align: 'center' })
  g.restore()
}

function countdownLook(t: number) {
  if (t >= COUNTDOWN_SECONDS) {
    const k = (t - COUNTDOWN_SECONDS) / GO_SECONDS
    return { label: 'GO', scale: 1 + k * 0.3, alpha: 1 - k }
  }
  const phase = t - Math.floor(t)
  const label = String(Math.min(COUNTDOWN_SECONDS, Math.ceil(COUNTDOWN_SECONDS - t)))
  return { label, scale: 1.25 - Math.min(1, phase * 4) * 0.25, alpha: 1 - Math.max(0, phase - 0.7) / 0.3 }
}

function drawCountdown(f: Frame) {
  if (f.t >= COUNTDOWN_SECONDS + GO_SECONDS) return
  const { g, layout } = f
  const look = countdownLook(f.t)
  g.save()
  g.translate(layout.w / 2, fieldMiddle(f))
  g.scale(look.scale, look.scale)
  g.globalAlpha = Math.max(0, look.alpha)
  g.shadowColor = `hsl(${f.hue}, 100%, 70%)`
  g.shadowBlur = 24
  text(g, look.label, { x: 0, y: 24, font: `900 88px ${FONT}`, color: '#fff', align: 'center' })
  g.restore()
}

function drawMilestone(f: Frame, hud: Hud) {
  const milestone = hud.milestone
  if (milestone === null || milestone.age >= MILESTONE_MS) return
  const { g, layout } = f
  const k = milestone.age / MILESTONE_MS
  g.globalAlpha = 1 - k
  text(g, milestone.text, { x: layout.w / 2, y: fieldMiddle(f) - 70, font: `900 ${40 + k * 30}px ${FONT}`, color: `hsl(${(f.hue + 60) % 360}, 100%, 70%)`, align: 'center' })
  g.globalAlpha = 1
}
