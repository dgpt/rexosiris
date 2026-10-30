import type { Lane, Note, Section } from '../shared/analyze'
import { WINDOWS_MS, type Counts, type Judgment } from '../shared/types'

export const KEYS: Record<string, Lane> = {
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3,
}
const ARROW_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]
const QUANT_COLOR: Record<number, [string, string]> = { 4: ['#ff3d7f', '#ffb3cc'], 8: ['#3db8ff', '#b3e6ff'], 16: ['#ffd23d', '#fff0b3'] }
const JUDGE_COLOR: Record<Judgment, string> = { perfect: '#7dffb0', great: '#4fd1ff', good: '#ffb84f', miss: '#ff4f6d' }
const VOICE_LABEL: Record<string, string> = { kick: 'KICK', bass: 'BASS', snare: 'SNARE', lead: 'LEAD', hats: 'HATS', air: 'CYMBALS' }
const MISS_MS = WINDOWS_MS.good
const FEVER_AT = 30

export type GameResult = { counts: Counts; maxCombo: number; cleared: boolean; quit: boolean; offsets: { t: number; ms: number | null }[] }
type Live = Note & { hit: boolean; judged?: Judgment }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
type Ring = { x: number; y: number; born: number; color: string }

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
  sections?: Section[]
  bpm: number
  firstBeat: number
  offsetMs: number
  speed: number
  title: string
  hue: number
}): Promise<GameResult> {
  const { canvas, buffer, ctx, bpm, firstBeat } = opts
  const g = canvas.getContext('2d')!
  const notes: Live[] = opts.notes.map((n) => ({ ...n, hit: false }))
  const sections = opts.sections ?? []
  const counts: Counts = { perfect: 0, great: 0, good: 0, miss: 0 }
  const offsets: GameResult['offsets'] = []
  let combo = 0, maxCombo = 0, health = 0.6, cleared = true
  let flash: { text: Judgment; at: number; ms: number | null } | null = null
  let milestone: { text: string; at: number } | null = null
  const laneFlash = [-1e9, -1e9, -1e9, -1e9]
  const held = [false, false, false, false]
  const particles: Particle[] = []
  const rings: Ring[] = []
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }))
  const lead = 2.2
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.75
  const spectrum = new Uint8Array(analyser.frequencyBinCount)
  src.connect(analyser).connect(ctx.destination)
  const startAt = ctx.currentTime + lead
  src.start(startAt)
  const songTime = () => ctx.currentTime - startAt - opts.offsetMs / 1000
  let next = 0
  let geom = { x0: 0, laneW: 80, receptorY: 120, w: 0, h: 0 }

  const burst = (lane: number, color: string, n: number) => {
    const x = geom.x0 + lane * geom.laneW + geom.laneW / 2, y = geom.receptorY
    rings.push({ x, y, born: performance.now(), color })
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4.5
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, color, size: 2 + Math.random() * 3 })
    }
  }

  const record = (j: Judgment, at: number, ms: number | null, lane: number, noteT: number) => {
    counts[j]++
    offsets.push({ t: noteT, ms })
    flash = { text: j, at, ms }
    if (j === 'miss') {
      if (combo >= FEVER_AT) milestone = { text: 'FEVER LOST', at }
      combo = 0
      health -= 0.07
    } else {
      combo++
      maxCombo = Math.max(maxCombo, combo)
      health += j === 'perfect' ? 0.02 : j === 'great' ? 0.012 : 0.004
      burst(lane, JUDGE_COLOR[j], j === 'perfect' ? 14 : 8)
      if (combo === FEVER_AT) milestone = { text: 'FEVER!', at }
      else if (combo > 0 && combo % 50 === 0) milestone = { text: `${combo} COMBO`, at }
    }
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
      resolve({ counts, maxCombo, cleared, quit, offsets })
    }
    const press = (lane: number) => {
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
      const ms = (t - best.t) * 1000
      const j = judge(ms)
      if (!j) return
      best.hit = true
      best.judged = j
      record(j, performance.now(), ms, lane, best.t)
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return finish(true)
      const lane = KEYS[e.code]
      if (lane === undefined || e.repeat) return
      e.preventDefault()
      press(lane)
    }
    const onUp = (e: KeyboardEvent) => { const lane = KEYS[e.code]; if (lane !== undefined) held[lane] = false }
    const laneAt = (clientX: number) => {
      const r = canvas.getBoundingClientRect()
      const l = Math.floor((clientX - r.left - geom.x0) / geom.laneW)
      return l >= 0 && l < 4 ? l : Math.max(0, Math.min(3, Math.floor(((clientX - r.left) / r.width) * 4)))
    }
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of Array.from(e.changedTouches)) press(laneAt(t.clientX)) }, { passive: false })
    canvas.addEventListener('touchend', (e) => { for (const t of Array.from(e.changedTouches)) held[laneAt(t.clientX)] = false })
    addEventListener('keydown', onDown)
    addEventListener('keyup', onUp)

    const frame = () => {
      if (done) return
      const t = songTime()
      while (next < notes.length && (notes[next]!.hit || t - notes[next]!.t > MISS_MS / 1000)) {
        const n = notes[next]!
        if (!n.hit) { n.hit = true; n.judged = 'miss'; record('miss', performance.now(), null, n.lane, n.t) }
        next++
      }
      draw(t)
      if (t > buffer.duration + 0.5) {
        for (; next < notes.length; next++) if (!notes[next]!.hit) { notes[next]!.hit = true; record('miss', performance.now(), null, notes[next]!.lane, notes[next]!.t) }
        return finish(false)
      }
      requestAnimationFrame(frame)
    }

    const sectionAt = (t: number) => { let s: Section | undefined; for (const x of sections) { if (x.t <= t) s = x; else break } return s }
    let shownVoice = '', voiceSince = -1e9

    const draw = (t: number) => {
      const dpr = devicePixelRatio || 1
      const W = canvas.clientWidth, H = canvas.clientHeight
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr) }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      const now = performance.now()
      const beatLen = 60 / bpm
      const beat = (t - firstBeat) / beatLen
      const phase = beat - Math.floor(beat)
      const pulse = t >= 0 ? Math.pow(1 - phase, 4) : 0
      const downbeat = ((Math.floor(beat) % 4) + 4) % 4 === 0
      const fever = combo >= FEVER_AT
      analyser.getByteFrequencyData(spectrum)
      let bass = 0
      for (let i = 0; i < 6; i++) bass += spectrum[i]!
      bass /= 6 * 255
      const hue = (opts.hue + (fever ? (now / 40) % 360 : 0)) % 360

      const bg = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, Math.max(W, H) * 0.8)
      bg.addColorStop(0, `hsl(${hue}, 70%, ${10 + bass * 14 + pulse * (downbeat ? 8 : 4)}%)`)
      bg.addColorStop(1, `hsl(${(hue + 40) % 360}, 60%, 3%)`)
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)

      for (const s of stars) {
        s.y += 0.0008 * s.z * (1 + bass * 6) * opts.speed
        if (s.y > 1) { s.y = 0; s.x = Math.random() }
        g.fillStyle = `rgba(255,255,255,${0.15 + s.z * 0.5})`
        g.fillRect(s.x * W, s.y * H, s.z * 2, s.z * 2 * (1 + bass * 4))
      }

      for (let r = 0; r < 3; r++) {
        const k = (phase + r / 3) % 1
        g.strokeStyle = `hsla(${(hue + 180) % 360}, 90%, 65%, ${(1 - k) * 0.18 * (t >= 0 ? 1 : 0)})`
        g.lineWidth = 2
        g.beginPath()
        g.arc(W / 2, H * 0.55, 60 + k * Math.max(W, H) * 0.6, 0, Math.PI * 2)
        g.stroke()
      }

      const bars = 48, bw = W / bars
      for (let i = 0; i < bars; i++) {
        const v = spectrum[Math.floor((i / bars) * spectrum.length * 0.8)]! / 255
        g.fillStyle = `hsla(${(hue + i * 4) % 360}, 90%, 60%, ${0.12 + v * 0.35})`
        g.fillRect(i * bw + 1, H - v * H * 0.28, bw - 2, v * H * 0.28)
      }

      const laneW = Math.min(96, (W - 40) / 4.4)
      const x0 = W / 2 - laneW * 2
      const receptorY = Math.min(140, H * 0.16)
      geom = { x0, laneW, receptorY, w: W, h: H }
      const pxPerSec = Math.max(380, H * 0.75) * opts.speed

      const field = g.createLinearGradient(0, 0, 0, H)
      field.addColorStop(0, 'rgba(8,4,20,0.82)')
      field.addColorStop(1, 'rgba(8,4,20,0.55)')
      g.fillStyle = field
      g.fillRect(x0 - 8, 0, laneW * 4 + 16, H)
      g.strokeStyle = fever ? `hsla(${hue}, 100%, 70%, ${0.5 + pulse * 0.5})` : `rgba(255,255,255,${0.08 + pulse * 0.12})`
      g.lineWidth = fever ? 3 : 1.5
      g.strokeRect(x0 - 8, -2, laneW * 4 + 16, H + 4)

      for (let l = 0; l < 4; l++) {
        const age = (now - laneFlash[l]!) / 220
        if (held[l] || age < 1) {
          const glow = g.createLinearGradient(0, receptorY, 0, H)
          glow.addColorStop(0, `rgba(255,255,255,${held[l] ? 0.16 : Math.max(0, 0.16 * (1 - age))})`)
          glow.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = glow
          g.fillRect(x0 + l * laneW + 2, receptorY, laneW - 4, H - receptorY)
        }
      }

      const firstBar = Math.ceil((t - 0.3 - firstBeat) / beatLen)
      for (let b = firstBar; ; b++) {
        const bt = firstBeat + b * beatLen
        const y = receptorY + (bt - t) * pxPerSec
        if (y > H) break
        const measure = ((b % 4) + 4) % 4 === 0
        g.fillStyle = `rgba(255,255,255,${measure ? 0.18 : 0.06})`
        g.fillRect(x0, y, laneW * 4, measure ? 2 : 1)
      }

      const bounce = 1 + pulse * 0.14
      for (let l = 0; l < 4; l++) {
        const age = (now - laneFlash[l]!) / 140
        const s = laneW * 0.36 * bounce * (age < 1 ? 1.12 - 0.12 * age : 1)
        arrow(g, x0 + l * laneW + laneW / 2, receptorY, s, l, held[l] ? 'rgba(255,255,255,0.95)' : `rgba(255,255,255,${0.35 + pulse * 0.3})`, null, true)
      }

      for (let i = next; i < notes.length; i++) {
        const n = notes[i]!
        const y = receptorY + (n.t - t) * pxPerSec
        if (y > H + 60) break
        if (n.hit) continue
        const [c, light] = QUANT_COLOR[n.q ?? 4]!
        arrow(g, x0 + n.lane * laneW + laneW / 2, y, laneW * 0.36 * (1 + pulse * 0.08), n.lane, c, light, false)
      }

      g.globalCompositeOperation = 'lighter'
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]!, k = (now - r.born) / 320
        if (k >= 1) { rings.splice(i, 1); continue }
        g.strokeStyle = r.color
        g.globalAlpha = 1 - k
        g.lineWidth = 4 * (1 - k) + 1
        g.beginPath()
        g.arc(r.x, r.y, laneW * (0.35 + k * 0.5), 0, Math.PI * 2)
        g.stroke()
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025
        if (p.life <= 0) { particles.splice(i, 1); continue }
        g.globalAlpha = p.life
        g.fillStyle = p.color
        g.fillRect(p.x, p.y, p.size, p.size)
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'

      const hpX = x0 + laneW * 4 + 22, hpH = H * 0.5, hpY = H * 0.25
      g.fillStyle = 'rgba(255,255,255,0.08)'
      roundRect(g, hpX, hpY, 8, hpH, 4)
      g.fill()
      const hpCol = health > 0.35 ? (fever ? `hsl(${hue},100%,65%)` : '#7dffb0') : '#ff4f6d'
      g.fillStyle = hpCol
      g.shadowColor = hpCol
      g.shadowBlur = 12
      roundRect(g, hpX, hpY + hpH * (1 - health), 8, hpH * health, 4)
      g.fill()
      g.shadowBlur = 0

      const progress = Math.max(0, Math.min(1, t / buffer.duration))
      g.fillStyle = 'rgba(255,255,255,0.1)'
      g.fillRect(0, 0, W, 3)
      g.fillStyle = `hsl(${hue}, 90%, 65%)`
      g.fillRect(0, 0, W * progress, 3)

      g.textAlign = 'left'
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.font = '700 16px "Space Grotesk", system-ui'
      g.fillText(opts.title, 20, 34)
      g.font = '500 12px "Space Grotesk", system-ui'
      g.fillStyle = 'rgba(255,255,255,0.5)'
      g.fillText(`${Math.round(bpm)} BPM`, 20, 52)

      const sec = sectionAt(t)
      if (sec && sec.voice !== shownVoice) { shownVoice = sec.voice; voiceSince = now }
      if (shownVoice) {
        const k = Math.min(1, (now - voiceSince) / 400)
        g.textAlign = 'left'
        g.font = '600 11px "Space Grotesk", system-ui'
        g.fillStyle = 'rgba(255,255,255,0.45)'
        g.fillText('FOLLOWING', 20, H - 52)
        g.font = `800 ${22 + (1 - k) * 10}px "Space Grotesk", system-ui`
        g.fillStyle = `hsla(${(hue + 160) % 360}, 95%, 70%, ${0.5 + k * 0.5})`
        g.fillText(VOICE_LABEL[shownVoice] ?? shownVoice.toUpperCase(), 20, H - 28)
      }

      g.textAlign = 'center'
      const midY = receptorY + (H - receptorY) * 0.42
      if (t < 0) {
        const left = -t
        const label = left > 1.6 ? 'READY' : left > 0.15 ? String(Math.ceil(left / 0.5) > 3 ? 3 : Math.ceil(left / 0.5)) : 'GO'
        g.font = '900 64px "Space Grotesk", system-ui'
        g.fillStyle = 'rgba(255,255,255,0.92)'
        g.fillText(label, W / 2, midY)
      }
      if (combo >= 4) {
        g.font = `900 ${46 + pulse * 8}px "Space Grotesk", system-ui`
        g.fillStyle = fever ? `hsl(${hue}, 100%, 72%)` : 'rgba(255,255,255,0.9)'
        g.shadowColor = g.fillStyle
        g.shadowBlur = fever ? 24 : 0
        g.fillText(String(combo), W / 2, midY + 60)
        g.shadowBlur = 0
        g.font = '700 12px "Space Grotesk", system-ui'
        g.fillStyle = 'rgba(255,255,255,0.6)'
        g.fillText('COMBO', W / 2, midY + 80)
      }
      if (flash && now - flash.at < 500) {
        const k = (now - flash.at) / 500
        const scale = k < 0.15 ? 1.35 - k * 2.3 : 1
        g.save()
        g.translate(W / 2, midY)
        g.scale(scale, scale)
        g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4
        g.font = '900 30px "Space Grotesk", system-ui'
        g.fillStyle = JUDGE_COLOR[flash.text]
        g.shadowColor = JUDGE_COLOR[flash.text]
        g.shadowBlur = 18
        g.fillText(flash.text.toUpperCase(), 0, 0)
        g.shadowBlur = 0
        if (flash.ms !== null && flash.text !== 'perfect') {
          g.font = '700 12px "Space Grotesk", system-ui'
          g.fillStyle = 'rgba(255,255,255,0.7)'
          g.fillText(flash.ms < 0 ? 'EARLY' : 'LATE', 0, 20)
        }
        g.restore()
      }
      if (milestone && now - milestone.at < 1200) {
        const k = (now - milestone.at) / 1200
        g.globalAlpha = 1 - k
        g.font = `900 ${40 + k * 30}px "Space Grotesk", system-ui`
        g.fillStyle = `hsl(${(hue + 60) % 360}, 100%, 70%)`
        g.fillText(milestone.text, W / 2, receptorY + 90)
        g.globalAlpha = 1
      }
      g.textAlign = 'right'
      g.font = '600 12px "Space Grotesk", system-ui'
      g.fillStyle = 'rgba(255,255,255,0.4)'
      g.fillText('ESC to quit', W - 20, 34)
    }
    requestAnimationFrame(frame)
  })
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, Math.max(0, h), r)
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, r: number, lane: number, color: string, light: string | null, outline: boolean) {
  g.save()
  g.translate(x, y)
  g.rotate(ARROW_ROT[lane]!)
  g.beginPath()
  g.moveTo(0, -r)
  g.lineTo(r, 0)
  g.lineTo(r * 0.4, 0)
  g.lineTo(r * 0.4, r * 0.95)
  g.lineTo(-r * 0.4, r * 0.95)
  g.lineTo(-r * 0.4, 0)
  g.lineTo(-r, 0)
  g.closePath()
  if (outline) {
    g.strokeStyle = color
    g.lineWidth = 3
    g.lineJoin = 'round'
    g.stroke()
  } else {
    const grad = g.createLinearGradient(0, -r, 0, r)
    grad.addColorStop(0, light ?? color)
    grad.addColorStop(1, color)
    g.shadowColor = color
    g.shadowBlur = 16
    g.fillStyle = grad
    g.fill()
    g.shadowBlur = 0
    g.strokeStyle = 'rgba(255,255,255,0.85)'
    g.lineWidth = 2
    g.lineJoin = 'round'
    g.stroke()
  }
  g.restore()
}
