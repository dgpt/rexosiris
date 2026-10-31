import type { Lane } from '../../shared/analyze'
import { FLASH_MS, type LaneFlash } from './flashes'
import type { Scorecard } from './judge'
import { type Frame, HOLD_GOLD, JUDGE_COLOR, laneCenter, LANES, receptor } from './render'

export type LaneView = { readonly held: boolean; readonly holding: boolean; readonly flash: LaneFlash | null }

const BEAM_REACH = 0.55
const HEALTH_GAP = 10
const HEALTH_W = 6
const WHITE = '#ffffff'

export const withAlpha = (hex: string, alpha: number) => `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')}`

const fading = (flash: LaneFlash) => 1 - flash.age / FLASH_MS[flash.kind]

function beamOf(view: LaneView, pulse: number): { readonly color: string; readonly alpha: number } | null {
  if (view.flash !== null) return { color: view.flash.color, alpha: (view.flash.kind === 'miss' ? 0.4 : 0.32) * fading(view.flash) }
  if (view.holding) return { color: HOLD_GOLD, alpha: 0.2 + pulse * 0.08 }
  if (view.held) return { color: WHITE, alpha: 0.14 }
  return null
}

function drawBeam(f: Frame, lane: Lane, view: LaneView) {
  const beam = beamOf(view, f.pulse)
  if (beam === null) return
  const { g, layout } = f
  const top = layout.receptorY - layout.r - 6
  const bottom = layout.receptorY + (layout.h - layout.receptorY) * BEAM_REACH
  const grad = g.createLinearGradient(0, top, 0, bottom)
  grad.addColorStop(0, withAlpha(beam.color, beam.alpha))
  grad.addColorStop(0.25, withAlpha(beam.color, beam.alpha * 0.8))
  grad.addColorStop(1, withAlpha(beam.color, 0))
  g.fillStyle = grad
  g.fillRect(layout.x0 + lane * layout.laneW + 2, top, layout.laneW - 4, bottom - top)
}

type Look = { readonly stroke: string; readonly fill: string | null; readonly width: number; readonly scale: number; readonly dx: number }

function lookOf(view: LaneView, pulse: number): Look {
  const flash = view.flash
  if (flash !== null && flash.kind === 'miss') {
    const k = fading(flash)
    return { stroke: JUDGE_COLOR.miss, fill: withAlpha(JUDGE_COLOR.miss, 0.3 * k), width: 3.5, scale: 1, dx: Math.sin(flash.age / 16) * 5 * k }
  }
  if (flash !== null) {
    const k = fading(flash)
    return { stroke: flash.color, fill: withAlpha(flash.color, 0.85 * k), width: 3.5, scale: 1 + 0.14 * k, dx: 0 }
  }
  if (view.holding) return { stroke: HOLD_GOLD, fill: withAlpha(HOLD_GOLD, 0.45 + pulse * 0.2), width: 3.5, scale: 0.94, dx: 0 }
  if (view.held) return { stroke: 'rgba(255,255,255,0.95)', fill: 'rgba(255,255,255,0.22)', width: 3, scale: 0.92, dx: 0 }
  return { stroke: `rgba(255,255,255,${0.35 + pulse * 0.3})`, fill: null, width: 3, scale: 1 + pulse * 0.06, dx: 0 }
}

export function drawField(f: Frame, lanes: readonly LaneView[], fever: boolean) {
  const { g, layout } = f
  g.fillStyle = 'rgba(8,4,20,0.75)'
  g.fillRect(layout.fieldX, 0, layout.fieldW, layout.h)
  g.strokeStyle = fever ? `hsla(${f.hue}, 100%, 70%, ${0.5 + f.pulse * 0.5})` : `rgba(255,255,255,${0.08 + f.pulse * 0.12})`
  g.lineWidth = fever ? 3 : 1.5
  g.strokeRect(layout.fieldX, -2, layout.fieldW, layout.h + 4)
  g.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 1; i < LANES.length; i++) g.fillRect(layout.x0 + i * layout.laneW - 0.5, 0, 1, layout.h)
  for (const lane of LANES) {
    const view = lanes[lane] ?? { held: false, holding: false, flash: null }
    drawBeam(f, lane, view)
    const look = lookOf(view, f.pulse)
    receptor(g, { x: laneCenter(layout, lane) + look.dx, y: layout.receptorY, r: layout.r * look.scale, lane }, look)
  }
}

export function drawHealth(f: Frame, card: Scorecard) {
  const { g, layout } = f
  const x = layout.fieldX + layout.fieldW + HEALTH_GAP
  const height = layout.h * 0.5
  const top = layout.h * 0.25
  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.beginPath()
  g.roundRect(x, top, HEALTH_W, height, HEALTH_W / 2)
  g.fill()
  const healthy = card.health > 0.35 ? JUDGE_COLOR.perfect : JUDGE_COLOR.miss
  const fill = card.fever ? `hsl(${f.hue},100%,65%)` : healthy
  g.fillStyle = fill
  g.shadowColor = fill
  g.shadowBlur = 12
  g.beginPath()
  g.roundRect(x, top + height * (1 - card.health), HEALTH_W, height * card.health, HEALTH_W / 2)
  g.fill()
  g.shadowBlur = 0
}
