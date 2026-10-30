type Particle = { x: number; y: number; vx: number; vy: number; life: number; readonly color: string; readonly size: number }
type Ring = { readonly x: number; readonly y: number; readonly born: number; readonly color: string }
type Banner = { readonly text: string; readonly color: string; readonly born: number; readonly x: number; readonly y: number }

const RING_MS = 320
const BANNER_MS = 600
const GRAVITY = 0.12
const DECAY = 0.025

export class Effects {
  private readonly particles: Particle[] = []
  private readonly rings: Ring[] = []
  private readonly banners: Banner[] = []

  burst(x: number, y: number, color: string, count: number) {
    this.rings.push({ x, y, born: performance.now(), color })
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 4.5
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, life: 1, color, size: 2 + Math.random() * 3 })
    }
  }

  banner(text: string, color: string, at: { x: number; y: number }) {
    this.banners.push({ text, color, born: performance.now(), ...at })
  }

  draw(g: CanvasRenderingContext2D, ringRadius: number) {
    const now = performance.now()
    g.globalCompositeOperation = 'lighter'
    this.drawRings(g, now, ringRadius)
    this.drawParticles(g)
    g.globalCompositeOperation = 'source-over'
    this.drawBanners(g, now)
    g.globalAlpha = 1
  }

  private drawRings(g: CanvasRenderingContext2D, now: number, radius: number) {
    for (const ring of this.rings.filter((r) => now - r.born < RING_MS)) {
      const k = (now - ring.born) / RING_MS
      g.strokeStyle = ring.color
      g.globalAlpha = 1 - k
      g.lineWidth = 4 * (1 - k) + 1
      g.beginPath()
      g.arc(ring.x, ring.y, radius * (0.35 + k * 0.5), 0, Math.PI * 2)
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

  private drawBanners(g: CanvasRenderingContext2D, now: number) {
    g.textAlign = 'center'
    g.font = '800 16px "Space Grotesk", system-ui'
    for (const b of this.banners.filter((x) => now - x.born < BANNER_MS)) {
      const k = (now - b.born) / BANNER_MS
      g.globalAlpha = 1 - k
      g.fillStyle = b.color
      g.fillText(b.text, b.x, b.y + k * 10)
    }
    this.banners.splice(0, this.banners.length, ...this.banners.filter((x) => now - x.born < BANNER_MS))
  }
}
