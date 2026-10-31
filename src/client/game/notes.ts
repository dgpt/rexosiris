import type { Note } from '../../shared/analyze'
import { arrow, type Frame, ghostArrow, HOLD_GOLD, laneCenter, noteY, QUANT_COLOR } from './render'

export type NoteState = 'waiting' | 'hit' | 'missed' | 'holding' | 'held' | 'dropped'
export type LiveNote = Note & { state: NoteState; droppedAt: number | null }

export const judged = (n: LiveNote) => n.state !== 'waiting'
export const isHold = (n: Note) => (n.len ?? 0) > 0

const BODY_OF_LANE = 0.42
const GHOST_ALPHA = 0.45
const WHITE: readonly [string, string] = ['#fff', '#fff']

type Span = { readonly from: number; readonly to: number }

function body(f: Frame, n: LiveNote, span: Span, fill: CanvasGradient | string) {
  const width = f.layout.laneW * BODY_OF_LANE
  const top = Math.min(span.from, span.to)
  const height = Math.abs(span.to - span.from)
  if (height <= 0) return
  f.g.fillStyle = fill
  f.g.beginPath()
  f.g.roundRect(laneCenter(f.layout, n.lane) - width / 2, top, width, height, width / 2)
  f.g.fill()
}

function liveFill(f: Frame, n: LiveNote, span: Span, holding: boolean) {
  const grad = f.g.createLinearGradient(0, span.from, 0, span.to)
  const glow = holding ? 0.95 : 0.8
  grad.addColorStop(0, holding ? `rgba(255,236,150,${glow})` : HOLD_GOLD)
  grad.addColorStop(1, QUANT_COLOR[n.q]?.[0] ?? HOLD_GOLD)
  return grad
}

function ghostFill(f: Frame) {
  const grad = f.g.createLinearGradient(0, f.layout.fadeTop, 0, f.layout.receptorY)
  grad.addColorStop(0, 'rgba(110,110,130,0)')
  grad.addColorStop(1, `rgba(110,110,130,${GHOST_ALPHA})`)
  return grad
}

function drawHold(f: Frame, n: LiveNote, head: number, tail: number) {
  const at = { x: laneCenter(f.layout, n.lane), y: head, r: f.layout.r, lane: n.lane }
  const receptorY = f.layout.receptorY
  if (n.state === 'holding') {
    body(f, n, { from: receptorY, to: tail }, liveFill(f, n, { from: receptorY, to: tail }, true))
    arrow(f.g, { ...at, y: receptorY }, QUANT_COLOR[n.q] ?? WHITE)
  } else if (n.state === 'waiting') {
    body(f, n, { from: head, to: tail }, liveFill(f, n, { from: head, to: tail }, false))
    arrow(f.g, at, QUANT_COLOR[n.q] ?? WHITE)
  } else if (n.state === 'missed') {
    body(f, n, { from: head, to: tail }, ghostFill(f))
    ghostArrow(f.g, at, GHOST_ALPHA * fadeAt(f, head))
  } else if (n.state === 'dropped') {
    body(f, n, { from: noteY(f, n.droppedAt ?? n.t), to: tail }, ghostFill(f))
  }
}

const fadeAt = (f: Frame, y: number) => Math.min(1, Math.max(0, (y - f.layout.fadeTop) / (f.layout.receptorY - f.layout.fadeTop)))

function drawTap(f: Frame, n: LiveNote, head: number) {
  const at = { x: laneCenter(f.layout, n.lane), y: head, r: f.layout.r * (1 + f.pulse * 0.06), lane: n.lane }
  if (n.state === 'waiting') arrow(f.g, at, QUANT_COLOR[n.q] ?? WHITE)
  else if (n.state === 'missed') ghostArrow(f.g, at, GHOST_ALPHA * fadeAt(f, head))
}

export function drawNotes(f: Frame, notes: readonly LiveNote[]) {
  const reach = f.layout.r * 1.2
  for (const n of notes) {
    const head = noteY(f, n.t)
    if (head > f.layout.h + reach) break
    const tail = noteY(f, n.t + (n.len ?? 0))
    if (tail < f.layout.fadeTop - reach) continue
    if (isHold(n)) drawHold(f, n, head, tail)
    else drawTap(f, n, head)
  }
}
