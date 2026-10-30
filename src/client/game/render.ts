import type { Lane, Note } from '../../shared/analyze'
import type { Judgment } from '../../shared/types'
import type { Scorecard } from './judge'

export type LiveNote = Note & { hit: boolean; hold: 'pending' | 'active' | 'ok' | 'ng' | 'dead' }

export type Layout = { readonly x0: number; readonly laneW: number; readonly receptorY: number; readonly w: number; readonly h: number }

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

export const LANES: readonly Lane[] = [0, 1, 2, 3]
export const LANE_ROTATION: Readonly<Record<Lane, number>> = { 0: -Math.PI / 2, 1: Math.PI, 2: 0, 3: Math.PI / 2 }
export const QUANT_COLOR: Readonly<Record<number, readonly [string, string]>> = { 4: ['#ff3d7f', '#ffb3cc'], 8: ['#3db8ff', '#b3e6ff'], 16: ['#ffd23d', '#fff0b3'] }
export const JUDGE_COLOR: Readonly<Record<Judgment, string>> = { perfect: '#7dffb0', great: '#4fd1ff', good: '#ffb84f', miss: '#ff4f6d' }
export const FONT = '"Space Grotesk", system-ui'
const HOLD_GOLD = '#ffd23d'

export const laneCenter = (layout: Layout, lane: number) => layout.x0 + lane * layout.laneW + layout.laneW / 2
export const noteY = (f: Frame, t: number) => f.layout.receptorY + (t - f.t) * f.pxPerSec

export function layoutFor(w: number, h: number): Layout {
  const laneW = Math.min(96, (w - 40) / 4.4)
  return { x0: w / 2 - laneW * 2, laneW, receptorY: Math.min(140, h * 0.16), w, h }
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

export function receptor(g: CanvasRenderingContext2D, at: { x: number; y: number; r: number; lane: Lane }, color: string) {
  g.save()
  g.translate(at.x, at.y)
  g.rotate(LANE_ROTATION[at.lane])
  arrowPath(g, at.r)
  g.strokeStyle = color
  g.lineWidth = 3
  g.stroke()
  g.restore()
}

export function arrow(g: CanvasRenderingContext2D, at: { x: number; y: number; r: number; lane: Lane }, colors: readonly [string, string]) {
  g.save()
  g.translate(at.x, at.y)
  g.rotate(LANE_ROTATION[at.lane])
  arrowPath(g, at.r)
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

function holdBody(f: Frame, n: LiveNote, from: number, to: number) {
  const alive = n.hold !== 'dead'
  const cx = laneCenter(f.layout, n.lane)
  const width = f.layout.laneW * 0.42
  const grad = f.g.createLinearGradient(0, from, 0, to)
  grad.addColorStop(0, alive ? HOLD_GOLD : 'rgba(120,120,140,0.5)')
  grad.addColorStop(1, alive ? (QUANT_COLOR[n.q]?.[0] ?? HOLD_GOLD) : 'rgba(80,80,100,0.3)')
  f.g.fillStyle = grad
  f.g.globalAlpha = alive ? 0.85 : 0.5
  f.g.beginPath()
  f.g.roundRect(cx - width / 2, Math.min(from, to), width, Math.abs(to - from), width / 2)
  f.g.fill()
  f.g.globalAlpha = 1
}

export function drawNotes(f: Frame, notes: readonly LiveNote[], from: number) {
  const radius = f.layout.laneW * 0.36 * (1 + f.pulse * 0.08)
  for (const n of notes.slice(Math.max(0, from - 40))) {
    const y = noteY(f, n.t)
    if (y > f.layout.h + 60) break
    const len = n.len ?? 0
    if (n.hold === 'active') holdBody(f, n, f.layout.receptorY, noteY(f, n.t + len))
    else if (len > 0 && n.hold !== 'ok' && n.hold !== 'ng') holdBody(f, n, Math.max(y, f.layout.receptorY - 40), y + len * f.pxPerSec)
    if (!n.hit) arrow(f.g, { x: laneCenter(f.layout, n.lane), y, r: radius, lane: n.lane }, QUANT_COLOR[n.q] ?? ['#fff', '#fff'])
  }
}

export function drawHealth(f: Frame, card: Scorecard) {
  const x = f.layout.x0 + f.layout.laneW * 4 + 22
  const height = f.layout.h * 0.5
  const top = f.layout.h * 0.25
  f.g.fillStyle = 'rgba(255,255,255,0.08)'
  f.g.beginPath()
  f.g.roundRect(x, top, 8, height, 4)
  f.g.fill()
  const color = card.health > 0.35 ? '#7dffb0' : '#ff4f6d'
  f.g.fillStyle = card.fever ? `hsl(${f.hue},100%,65%)` : color
  f.g.shadowColor = f.g.fillStyle
  f.g.shadowBlur = 12
  f.g.beginPath()
  f.g.roundRect(x, top + height * (1 - card.health), 8, height * card.health, 4)
  f.g.fill()
  f.g.shadowBlur = 0
}
