import { FONT, type Frame, JUDGE_COLOR, laneCenter, LANES, receptor } from './render'
import type { Scorecard } from './judge'
import type { Judgment } from '../../shared/types'

const HUD_LEFT = 58

type Star = { x: number; y: number; readonly z: number }

export type Hud = {
  readonly title: string
  readonly bpm: number
  readonly progress: number
  readonly voice: string
  readonly voiceAge: number
  readonly flash: { readonly judgment: Judgment; readonly age: number; readonly ms: number | null } | null
  readonly milestone: { readonly text: string; readonly age: number } | null
}

const SPECTRUM_BARS = 48
const STAR_COUNT = 90
const VOICE_LABEL: Readonly<Record<string, string>> = { kick: 'KICK', bass: 'BASS', snare: 'SNARE', lead: 'LEAD', hats: 'HATS', air: 'CYMBALS' }

export const makeStars = (): Star[] => Array.from({ length: STAR_COUNT }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }))

export function drawBackground(f: Frame, stars: Star[], spectrum: Uint8Array) {
  const { g, layout } = f
  const glow = 10 + f.bass * 14 + f.pulse * (f.downbeat ? 8 : 4)
  const bg = g.createRadialGradient(layout.w / 2, layout.h * 0.55, 10, layout.w / 2, layout.h * 0.55, Math.max(layout.w, layout.h) * 0.8)
  bg.addColorStop(0, `hsl(${f.hue}, 70%, ${glow}%)`)
  bg.addColorStop(1, `hsl(${(f.hue + 40) % 360}, 60%, 3%)`)
  g.fillStyle = bg
  g.fillRect(0, 0, layout.w, layout.h)
  for (const s of stars) {
    s.y = (s.y + 0.0008 * s.z * (1 + f.bass * 6)) % 1
    g.fillStyle = `rgba(255,255,255,${0.15 + s.z * 0.5})`
    g.fillRect(s.x * layout.w, s.y * layout.h, s.z * 2, s.z * 2 * (1 + f.bass * 4))
  }
  const barW = layout.w / SPECTRUM_BARS
  for (let i = 0; i < SPECTRUM_BARS; i++) {
    const v = (spectrum[Math.floor((i / SPECTRUM_BARS) * spectrum.length * 0.8)] ?? 0) / 255
    g.fillStyle = `hsla(${(f.hue + i * 4) % 360}, 90%, 60%, ${0.12 + v * 0.35})`
    g.fillRect(i * barW + 1, layout.h - v * layout.h * 0.28, barW - 2, v * layout.h * 0.28)
  }
}

export function drawField(f: Frame, held: readonly boolean[], fever: boolean) {
  const { g, layout } = f
  g.fillStyle = 'rgba(8,4,20,0.75)'
  g.fillRect(layout.x0 - 8, 0, layout.laneW * 4 + 16, layout.h)
  g.strokeStyle = fever ? `hsla(${f.hue}, 100%, 70%, ${0.5 + f.pulse * 0.5})` : `rgba(255,255,255,${0.08 + f.pulse * 0.12})`
  g.lineWidth = fever ? 3 : 1.5
  g.strokeRect(layout.x0 - 8, -2, layout.laneW * 4 + 16, layout.h + 4)
  const radius = layout.laneW * 0.36 * (1 + f.pulse * 0.14)
  for (const lane of LANES) {
    const down = held[lane] ?? false
    if (down) {
      g.fillStyle = 'rgba(255,255,255,0.1)'
      g.fillRect(layout.x0 + lane * layout.laneW + 2, layout.receptorY, layout.laneW - 4, layout.h)
    }
    const color = down ? 'rgba(255,255,255,0.95)' : `rgba(255,255,255,${0.35 + f.pulse * 0.3})`
    receptor(g, { x: laneCenter(layout, lane), y: layout.receptorY, r: radius, lane }, color)
  }
}

function text(g: CanvasRenderingContext2D, value: string, at: { x: number; y: number; font: string; color: string; align: CanvasTextAlign }) {
  g.textAlign = at.align
  g.font = at.font
  g.fillStyle = at.color
  g.fillText(value, at.x, at.y)
}

export function drawHud(f: Frame, card: Scorecard, hud: Hud) {
  const { g, layout } = f
  const mid = layout.receptorY + (layout.h - layout.receptorY) * 0.42
  g.fillStyle = `hsl(${f.hue}, 90%, 65%)`
  g.fillRect(0, 0, layout.w * hud.progress, 3)
  text(g, hud.title, { x: HUD_LEFT, y: 34, font: `700 16px ${FONT}`, color: 'rgba(255,255,255,0.85)', align: 'left' })
  text(g, `${Math.round(hud.bpm)} BPM`, { x: HUD_LEFT, y: 52, font: `500 12px ${FONT}`, color: 'rgba(255,255,255,0.5)', align: 'left' })
  text(g, `${(card.accuracy * 100).toFixed(2)}%`, { x: layout.w - 20, y: 40, font: `700 26px ${FONT}`, color: '#fff', align: 'right' })
  const flawless = card.counts.miss === 0 && card.holds.ng === 0 && card.maxCombo > 0
  text(g, flawless ? 'FULL COMBO SO FAR' : '', { x: layout.w - 20, y: 60, font: `600 12px ${FONT}`, color: flawless ? '#ffd23d' : 'rgba(255,255,255,0.4)', align: 'right' })
  if (hud.voice !== '') {
    text(g, 'FOLLOWING', { x: 20, y: layout.h - 52, font: `600 11px ${FONT}`, color: 'rgba(255,255,255,0.45)', align: 'left' })
    const grow = Math.max(0, 1 - hud.voiceAge / 400)
    text(g, VOICE_LABEL[hud.voice] ?? hud.voice.toUpperCase(), { x: 20, y: layout.h - 28, font: `800 ${22 + grow * 10}px ${FONT}`, color: `hsl(${(f.hue + 160) % 360}, 95%, 70%)`, align: 'left' })
  }
  drawCenter(f, card, hud, mid)
}

function countdownLabel(t: number) {
  if (t < -1.6) return 'READY'
  if (t > -0.15) return 'GO'
  return String(Math.min(3, Math.ceil(-t / 0.5)))
}

function drawCenter(f: Frame, card: Scorecard, hud: Hud, mid: number) {
  const { g, layout } = f
  if (f.t < 0) text(g, countdownLabel(f.t), { x: layout.w / 2, y: mid, font: `900 64px ${FONT}`, color: 'rgba(255,255,255,0.92)', align: 'center' })
  if (card.combo >= 4) {
    text(g, String(card.combo), { x: layout.w / 2, y: mid + 60, font: `900 ${46 + f.pulse * 8}px ${FONT}`, color: card.fever ? `hsl(${f.hue}, 100%, 72%)` : 'rgba(255,255,255,0.9)', align: 'center' })
    text(g, 'COMBO', { x: layout.w / 2, y: mid + 80, font: `700 12px ${FONT}`, color: 'rgba(255,255,255,0.6)', align: 'center' })
  }
  if (hud.flash !== null && hud.flash.age < 500) {
    const pop = hud.flash.age < 75 ? 1.35 - hud.flash.age / 220 : 1
    g.save()
    g.translate(layout.w / 2, mid)
    g.scale(pop, pop)
    g.globalAlpha = 1 - Math.max(0, hud.flash.age - 300) / 200
    text(g, hud.flash.judgment.toUpperCase(), { x: 0, y: 0, font: `900 30px ${FONT}`, color: JUDGE_COLOR[hud.flash.judgment], align: 'center' })
    if (hud.flash.ms !== null && hud.flash.judgment !== 'perfect') text(g, hud.flash.ms < 0 ? 'EARLY' : 'LATE', { x: 0, y: 20, font: `700 12px ${FONT}`, color: 'rgba(255,255,255,0.7)', align: 'center' })
    g.restore()
  }
  if (hud.milestone !== null && hud.milestone.age < 1200) {
    g.globalAlpha = 1 - hud.milestone.age / 1200
    text(g, hud.milestone.text, { x: layout.w / 2, y: layout.receptorY + 90, font: `900 ${40 + (hud.milestone.age / 1200) * 30}px ${FONT}`, color: `hsl(${(f.hue + 60) % 360}, 100%, 70%)`, align: 'center' })
    g.globalAlpha = 1
  }
}
