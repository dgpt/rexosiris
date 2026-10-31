import { LaneFlashes } from './flashes'

type Particle = { x: number; y: number; vx: number; vy: number; life: number; readonly color: string; readonly size: number }
type Ring = { readonly x: number; readonly y: number; readonly born: number; readonly color: string }


const RING_MS = 320
const GRAVITY = 0.12
const DECAY = 0.025

export class Effects {
  private readonly particles: Particle[] = []
  private readonly rings: Ring[] = []
  readonly lanes = new LaneFlashes()

  burst(x: number, y: number, color: string, count: number) {
    this.rings.push({ x, y, born: performance.now(), color })
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 4.5
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, life: 1, color, size: 2 + Math.random() * 3 })
    }
  }

  draw(g: CanvasRenderingContext2D, arrowRadius: number) {
    const now = performance.now()
    g.globalCompositeOperation = 'lighter'
    this.drawRings(g, now, arrowRadius)
    this.drawParticles(g)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
  }

  private drawRings(g: CanvasRenderingContext2D, now: number, radius: number) {
    for (const ring of this.rings.filter((r) => now - r.born < RING_MS)) {
      const k = (now - ring.born) / RING_MS
      g.strokeStyle = ring.color
      g.globalAlpha = 1 - k
      g.lineWidth = 4 * (1 - k) + 1
      g.beginPath()
      g.arc(ring.x, ring.y, radius * (1 + k * 0.6), 0, Math.PI * 2)
      g.stroke()
    }
    this.rings.splice(0, this.rings.length, ...this.rings.filter((r) => now - r.born < RING_MS))
  }

  private drawParticles(g: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += GRAVITY
      p.life -= DECAY
      g.globalAlpha = Math.max(0, p.life)
      g.fillStyle = p.color
      g.fillRect(p.x, p.y, p.size, p.size)
    }
    this.particles.splice(0, this.particles.length, ...this.particles.filter((p) => p.life > 0))
  }
}
