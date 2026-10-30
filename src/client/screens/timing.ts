import type { GameResult } from '../game/session'

const RANGE_MS = 140
const BANDS = [
  { ms: 45, color: 'rgba(125,255,176,0.12)' },
  { ms: 90, color: 'rgba(79,209,255,0.08)' },
]

export function meanOffset(result: GameResult) {
  const timed = result.offsets.flatMap((o) => (o.ms === null ? [] : [o.ms]))
  return timed.length === 0 ? 0 : timed.reduce((a, b) => a + b, 0) / timed.length
}

const dotColor = (ms: number) => {
  if (Math.abs(ms) <= 45) return '#7dffb0'
  if (Math.abs(ms) <= 90) return '#4fd1ff'
  return '#ffb84f'
}

export function drawTiming(canvas: HTMLCanvasElement, result: GameResult, duration: number) {
  const g = canvas.getContext('2d')
  if (g === null) return
  const mid = canvas.height / 2
  g.fillStyle = 'rgba(255,255,255,0.04)'
  g.fillRect(0, 0, canvas.width, canvas.height)
  for (const band of BANDS) {
    g.fillStyle = band.color
    g.fillRect(0, mid - (band.ms / RANGE_MS) * mid, canvas.width, ((2 * band.ms) / RANGE_MS) * mid)
  }
  g.fillStyle = 'rgba(255,255,255,0.3)'
  g.fillRect(0, mid, canvas.width, 1)
  for (const o of result.offsets) {
    const x = (o.t / duration) * canvas.width
    if (o.ms === null) {
      g.fillStyle = 'rgba(255,79,109,0.5)'
      g.fillRect(x, 0, 1, canvas.height)
    } else {
      g.fillStyle = dotColor(o.ms)
      g.fillRect(x - 1, mid + (o.ms / RANGE_MS) * mid - 1, 3, 3)
    }
  }
}
