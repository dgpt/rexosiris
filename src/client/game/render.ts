import type { Lane } from '../../shared/analyze'
import type { Judgment } from '../../shared/types'

export type Layout = {
  readonly x0: number
  readonly laneW: number
  readonly receptorY: number
  readonly r: number
  readonly fieldX: number
  readonly fieldW: number
  readonly fadeTop: number
  readonly w: number
  readonly h: number
}

export type Frame = {
  readonly g: CanvasRenderingContext2D
  readonly layout: Layout
  readonly t: number
  readonly pulse: number
  readonly downbeat: boolean
  readonly hue: number
  readonly bass: number
  readonly pxPerSec: number
}

export const LANES: readonly Lane[] = [0, 1, 2]
export const LANE_ROTATION: Readonly<Record<Lane, number>> = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2 }
export const QUANT_COLOR: Readonly<Record<number, readonly [string, string]>> = { 4: ['#ff3d7f', '#ffb3cc'], 8: ['#3db8ff', '#b3e6ff'], 16: ['#ffd23d', '#fff0b3'] }
export const JUDGE_COLOR: Readonly<Record<Judgment, string>> = { perfect: '#7dffb0', great: '#4fd1ff', good: '#ffb84f', miss: '#ff4f6d' }
export const HOLD_GOLD = '#ffd23d'
export const FONT = '"Space Grotesk", system-ui'

const MAX_LANE_W = 120
const SIDE_ROOM = 3.3
const ARROW_OF_LANE = 0.36
const FIELD_PAD = 8
const FADE_ARROWS = 2.2

export const laneCenter = (layout: Layout, lane: number) => layout.x0 + lane * layout.laneW + layout.laneW / 2
export const noteY = (f: Frame, t: number) => f.layout.receptorY + (t - f.t) * f.pxPerSec

export function layoutFor(w: number, h: number): Layout {
  const laneW = Math.min(MAX_LANE_W, (w - 40) / SIDE_ROOM)
  const x0 = w / 2 - (laneW * LANES.length) / 2
  const r = laneW * ARROW_OF_LANE
  const receptorY = Math.min(150, Math.max(h * 0.17, r * 2.6))
  return { x0, laneW, receptorY, r, fieldX: x0 - FIELD_PAD, fieldW: laneW * LANES.length + FIELD_PAD * 2, fadeTop: receptorY - r * FADE_ARROWS, w, h }
}

function arrowPath(g: CanvasRenderingContext2D, r: number) {
  g.beginPath()
  g.moveTo(0, -r)
  g.lineTo(r, 0)
  g.lineTo(r * 0.4, 0)
  g.lineTo(r * 0.4, r * 0.95)
  g.lineTo(-r * 0.4, r * 0.95)
  g.lineTo(-r * 0.4, 0)
  g.lineTo(-r, 0)
  g.closePath()
  g.lineJoin = 'round'
}

export type ArrowAt = { readonly x: number; readonly y: number; readonly r: number; readonly lane: Lane }

function placed(g: CanvasRenderingContext2D, at: ArrowAt) {
  g.translate(at.x, at.y)
  g.rotate(LANE_ROTATION[at.lane])
  arrowPath(g, at.r)
}

export function receptor(g: CanvasRenderingContext2D, at: ArrowAt, look: { readonly stroke: string; readonly fill: string | null; readonly width: number }) {
  g.save()
  placed(g, at)
  if (look.fill !== null) {
    g.shadowColor = look.fill
    g.shadowBlur = 18
    g.fillStyle = look.fill
    g.fill()
    g.shadowBlur = 0
  }
  g.strokeStyle = look.stroke
  g.lineWidth = look.width
  g.stroke()
  g.restore()
}

export function arrow(g: CanvasRenderingContext2D, at: ArrowAt, colors: readonly [string, string]) {
  g.save()
  placed(g, at)
  const grad = g.createLinearGradient(0, -at.r, 0, at.r)
  grad.addColorStop(0, colors[1])
  grad.addColorStop(1, colors[0])
  g.shadowColor = colors[0]
  g.shadowBlur = 16
  g.fillStyle = grad
  g.fill()
  g.shadowBlur = 0
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.lineWidth = 2
  g.stroke()
  g.restore()
}

export function ghostArrow(g: CanvasRenderingContext2D, at: ArrowAt, alpha: number) {
  if (alpha <= 0) return
  g.save()
  g.globalAlpha = alpha
  placed(g, at)
  g.fillStyle = 'rgba(110,110,130,0.9)'
  g.fill()
  g.strokeStyle = 'rgba(255,79,109,0.8)'
  g.lineWidth = 2
  g.stroke()
  g.restore()
}
