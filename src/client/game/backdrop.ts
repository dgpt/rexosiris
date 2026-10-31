import type { Frame } from './render'
import { pointOf, type Scene, sceneFor, turnsOf } from './scenes'

const RESOLUTION = 0.5
const POINTS_PER_TURN = 220
const RING_BINS = 48
const ENV_FOLLOW = 0.08
const BEAT_JUMP = 0.5
const STILL = { zoom: 1, spin: 0, decay: 0.8 }

type Buffer = { readonly canvas: HTMLCanvasElement; readonly g: CanvasRenderingContext2D }

function buffer(w: number, h: number): Buffer {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (g === null) throw new Error('Canvas 2D is not available')
  return { canvas, g }
}

export class Backdrop {
  private readonly scene: Scene
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches
  private buffers: [Buffer, Buffer] | null = null
  private env = 0
  private lastPulse = 0

  constructor(title: string) {
    this.scene = sceneFor(title)
  }

  draw(f: Frame, spectrum: Uint8Array) {
    const [from, to] = this.sized(f.layout.w, f.layout.h)
    this.env += (f.bass - this.env) * ENV_FOLLOW
    const beat = f.pulse > this.lastPulse + BEAT_JUMP
    this.lastPulse = f.pulse
    this.warp(from, to, f.t)
    to.g.globalCompositeOperation = 'lighter'
    this.figure(to, f)
    this.ring(to, f, spectrum)
    if (beat && !this.still) this.polygon(to, f)
    to.g.globalCompositeOperation = 'source-over'
    this.buffers = [to, from]
    f.g.imageSmoothingEnabled = true
    f.g.drawImage(to.canvas, 0, 0, f.layout.w, f.layout.h)
    f.g.fillStyle = 'rgba(4,2,12,0.3)'
    f.g.fillRect(0, 0, f.layout.w, f.layout.h)
  }

  private sized(w: number, h: number): [Buffer, Buffer] {
    const bw = Math.max(1, Math.round(w * RESOLUTION))
    const bh = Math.max(1, Math.round(h * RESOLUTION))
    if (this.buffers?.[0].canvas.width !== bw || this.buffers[0].canvas.height !== bh) this.buffers = [buffer(bw, bh), buffer(bw, bh)]
    return this.buffers
  }

  private warp(from: Buffer, to: Buffer, t: number) {
    const { width: w, height: h } = to.canvas
    const motion = this.still ? STILL : this.scene
    to.g.globalCompositeOperation = 'source-over'
    to.g.globalAlpha = 1
    to.g.fillStyle = '#05020c'
    to.g.fillRect(0, 0, w, h)
    to.g.save()
    to.g.globalAlpha = motion.decay
    to.g.translate(w / 2 + Math.sin(t * 0.21) * w * 0.01, h / 2 + Math.cos(t * 0.17) * h * 0.01)
    to.g.rotate(motion.spin)
    to.g.scale(motion.zoom, motion.zoom)
    to.g.drawImage(from.canvas, -w / 2, -h / 2)
    to.g.restore()
    to.g.globalAlpha = 1
  }

  private hue(f: Frame, offset: number) {
    return (f.hue + this.scene.hueShift + f.t * this.scene.hueSpeed + offset) % 360
  }

  private figure(b: Buffer, f: Frame) {
    const { width: w, height: h } = b.canvas
    const size = Math.min(w, h) * (0.3 + this.env * 0.12)
    const turns = turnsOf(this.scene)
    const steps = POINTS_PER_TURN * turns
    const motion = { t: f.t, breath: this.env }
    b.g.lineWidth = 1.4
    b.g.strokeStyle = `hsla(${this.hue(f, 0)}, 90%, 62%, 0.55)`
    for (let k = 0; k < this.scene.symmetry; k++) {
      b.g.save()
      b.g.translate(w / 2, h / 2)
      b.g.rotate(f.t * this.scene.turnSpeed + (k * Math.PI * 2) / this.scene.symmetry)
      b.g.beginPath()
      for (let i = 0; i <= steps; i++) {
        const [x, y] = pointOf(this.scene, (i / steps) * Math.PI * 2 * turns, motion)
        if (i === 0) b.g.moveTo(x * size, y * size)
        else b.g.lineTo(x * size, y * size)
      }
      b.g.stroke()
      b.g.restore()
    }
  }

  private ring(b: Buffer, f: Frame, spectrum: Uint8Array) {
    const { width: w, height: h } = b.canvas
    const inner = Math.min(w, h) * 0.12
    const folds = Math.max(2, this.scene.symmetry)
    b.g.save()
    b.g.translate(w / 2, h / 2)
    b.g.rotate(-f.t * this.scene.turnSpeed * 0.5)
    b.g.lineWidth = 1.2
    for (let i = 0; i < RING_BINS * folds; i++) {
      const bin = i % RING_BINS
      const v = (spectrum[Math.floor((bin / RING_BINS) * spectrum.length * 0.7)] ?? 0) / 255
      const angle = (i / (RING_BINS * folds)) * Math.PI * 2
      b.g.strokeStyle = `hsla(${this.hue(f, 120 + bin * 2)}, 95%, 60%, ${0.15 + v * 0.45})`
      b.g.beginPath()
      b.g.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      b.g.lineTo(Math.cos(angle) * (inner + v * inner * 1.6), Math.sin(angle) * (inner + v * inner * 1.6))
      b.g.stroke()
    }
    b.g.restore()
  }

  private polygon(b: Buffer, f: Frame) {
    const { width: w, height: h } = b.canvas
    const r = Math.min(w, h) * 0.08
    const sides = this.scene.beatSides
    b.g.strokeStyle = `hsla(${this.hue(f, 200)}, 100%, 70%, 0.8)`
    b.g.lineWidth = 2
    b.g.beginPath()
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + f.t * 0.3
      if (i === 0) b.g.moveTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r)
      else b.g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r)
    }
    b.g.stroke()
  }
}
