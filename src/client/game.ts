import type { Lane, Note } from '../shared/analyze'
import { JUDGMENTS, WINDOWS_MS, type Counts, type Judgment } from '../shared/types'

export const KEYS: Record<string, Lane> = {
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3,
}
const LANE_COLORS = ['#ff4fd8', '#4fd1ff', '#7dff6a', '#ffb84f']
const ARROW_ROT = [Math.PI / 2, 0, Math.PI, -Math.PI / 2]
const MISS_MS = WINDOWS_MS.good

export type GameResult = { counts: Counts; maxCombo: number; cleared: boolean; quit: boolean }
type Live = Note & { hit: boolean; judged?: Judgment }

export function judge(deltaMs: number): Judgment | null {
  const d = Math.abs(deltaMs)
  if (d <= WINDOWS_MS.perfect) return 'perfect'
  if (d <= WINDOWS_MS.great) return 'great'
  if (d <= WINDOWS_MS.good) return 'good'
  return null
}

export function play(opts: {
  canvas: HTMLCanvasElement
  buffer: AudioBuffer
  ctx: AudioContext
  notes: Note[]
  bpm: number
  firstBeat: number
  offsetMs: number
  speed: number
  title: string
}): Promise<GameResult> {
  const { canvas, buffer, ctx, bpm, firstBeat } = opts
  const g = canvas.getContext('2d')!
  const notes: Live[] = opts.notes.map((n) => ({ ...n, hit: false }))
  const counts: Counts = { perfect: 0, great: 0, good: 0, miss: 0 }
  let combo = 0, maxCombo = 0, health = 0.5, cleared = true
  let flash: { text: Judgment; at: number } | null = null
  const laneFlash = [0, 0, 0, 0]
  const held = [false, false, false, false]
  const lead = 2.0
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  const startAt = ctx.currentTime + lead
  src.start(startAt)
  const songTime = () => ctx.currentTime - startAt - opts.offsetMs / 1000
  let next = 0

  const record = (j: Judgment, at: number) => {
    counts[j]++
    flash = { text: j, at }
    if (j === 'miss') { combo = 0; health -= 0.08 } else { combo++; maxCombo = Math.max(maxCombo, combo); health += j === 'perfect' ? 0.02 : j === 'great' ? 0.01 : 0 }
    health = Math.min(1, health)
    if (health <= 0) { health = 0; cleared = false }
  }

  return new Promise((resolve) => {
    let done = false
    const finish = (quit: boolean) => {
      if (done) return
      done = true
      removeEventListener('keydown', onDown)
      removeEventListener('keyup', onUp)
      try { src.stop() } catch {}
      resolve({ counts, maxCombo, cleared, quit })
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return finish(true)
      const lane = KEYS[e.code]
      if (lane === undefined || e.repeat) return
      e.preventDefault()
      held[lane] = true
      laneFlash[lane] = performance.now()
      const t = songTime()
      let best: Live | null = null
      for (let i = next; i < notes.length; i++) {
        const n = notes[i]!
        if (n.t - t > MISS_MS / 1000) break
        if (n.hit || n.lane !== lane) continue
        if (!best || Math.abs(n.t - t) < Math.abs(best.t - t)) best = n
      }
      if (!best) return
      const j = judge((t - best.t) * 1000)
      if (!j) return
      best.hit = true
      best.judged = j
      record(j, performance.now())
    }
    const onUp = (e: KeyboardEvent) => { const lane = KEYS[e.code]; if (lane !== undefined) held[lane] = false }
    addEventListener('keydown', onDown)
    addEventListener('keyup', onUp)

    const frame = () => {
      if (done) return
      const t = songTime()
      while (next < notes.length && (notes[next]!.hit || t - notes[next]!.t > MISS_MS / 1000)) {
        const n = notes[next]!
        if (!n.hit) { n.hit = true; n.judged = 'miss'; record('miss', performance.now()) }
        next++
      }
      draw(t)
      if (t > buffer.duration + 0.5) {
        for (; next < notes.length; next++) if (!notes[next]!.hit) { notes[next]!.hit = true; record('miss', performance.now()) }
        return finish(false)
      }
      requestAnimationFrame(frame)
    }

    const draw = (t: number) => {
      const W = (canvas.width = canvas.clientWidth * devicePixelRatio)
      const H = (canvas.height = canvas.clientHeight * devicePixelRatio)
      g.save()
      g.scale(devicePixelRatio, devicePixelRatio)
      const w = W / devicePixelRatio, h = H / devicePixelRatio
      const beat = (t - firstBeat) / (60 / bpm)
      const phase = beat - Math.floor(beat)
      const pulse = t >= 0 ? Math.pow(1 - phase, 3) : 0
      const bar = Math.floor(beat) % 4 === 0
      g.fillStyle = `rgb(${12 + pulse * (bar ? 40 : 22)}, ${8 + pulse * 10}, ${24 + pulse * (bar ? 60 : 34)})`
      g.fillRect(0, 0, w, h)
      const laneW = Math.min(90, w / 6)
      const x0 = w / 2 - laneW * 2
      const receptorY = 110
      const pxPerSec = 520 * opts.speed
      for (let l = 0; l < 4; l++) {
        const age = (performance.now() - laneFlash[l]!) / 180
        g.fillStyle = `rgba(255,255,255,${held[l] ? 0.08 : 0.03 + Math.max(0, 0.12 - age * 0.12)})`
        g.fillRect(x0 + l * laneW + 2, 0, laneW - 4, h)
        arrow(g, x0 + l * laneW + laneW / 2, receptorY, laneW * 0.36 * (1 + pulse * 0.12), l, 'rgba(255,255,255,0.55)', true)
      }
      for (let i = next; i < notes.length; i++) {
        const n = notes[i]!
        const y = receptorY + (n.t - t) * pxPerSec
        if (y > h + 60) break
        if (n.hit) continue
        arrow(g, x0 + n.lane * laneW + laneW / 2, y, laneW * 0.36, n.lane, LANE_COLORS[n.lane]!, false)
      }
      g.fillStyle = '#222'
      g.fillRect(x0, h - 28, laneW * 4, 10)
      g.fillStyle = health > 0.3 ? '#7dff6a' : '#ff4f4f'
      g.fillRect(x0, h - 28, laneW * 4 * health, 10)
      g.fillStyle = '#fff'
      g.font = '600 15px system-ui'
      g.textAlign = 'left'
      g.fillText(opts.title, 16, 26)
      g.textAlign = 'right'
      g.fillText(`${JUDGMENTS.map((j) => counts[j]).join(' / ')}`, w - 16, 26)
      g.textAlign = 'center'
      if (t < 0) { g.font = '700 48px system-ui'; g.fillText(String(Math.ceil(-t)), w / 2, h / 2) }
      if (combo >= 4) { g.font = `800 ${34 + pulse * 6}px system-ui`; g.fillText(`${combo}`, w / 2, h / 2 + 40) }
      if (flash && performance.now() - flash.at < 450) {
        g.font = '800 26px system-ui'
        g.fillStyle = { perfect: '#7dff6a', great: '#4fd1ff', good: '#ffb84f', miss: '#ff4f4f' }[flash.text]
        g.fillText(flash.text.toUpperCase(), w / 2, h / 2)
      }
      g.restore()
    }
    requestAnimationFrame(frame)
  })
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, r: number, lane: number, color: string, outline: boolean) {
  g.save()
  g.translate(x, y)
  g.rotate(ARROW_ROT[lane]!)
  g.beginPath()
  g.moveTo(0, -r)
  g.lineTo(r, 0)
  g.lineTo(r * 0.42, 0)
  g.lineTo(r * 0.42, r)
  g.lineTo(-r * 0.42, r)
  g.lineTo(-r * 0.42, 0)
  g.lineTo(-r, 0)
  g.closePath()
  if (outline) { g.strokeStyle = color; g.lineWidth = 3; g.stroke() } else { g.fillStyle = color; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.stroke() }
  g.restore()
}
