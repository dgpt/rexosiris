export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export async function calibrate(ctx: AudioContext, dot: HTMLElement, msg: HTMLElement, signal: AbortSignal): Promise<number | null> {
  await ctx.resume()
  const BPM = 100, TAPS = 16, period = 60 / BPM
  return new Promise((resolve) => {
    let t0 = 0, started = false
    const deltas: number[] = []
    const click = (at: number, accent: boolean) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = accent ? 1320 : 880
      g.gain.setValueAtTime(0.5, at)
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
      o.connect(g).connect(ctx.destination)
      o.start(at); o.stop(at + 0.07)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (!started) {
        started = true
        t0 = ctx.currentTime + 0.5
        for (let i = 0; i < TAPS + 8; i++) click(t0 + i * period, i % 4 === 0)
        msg.textContent = 'Tap along…'
        const tick = () => {
          if (signal.aborted) return
          const ph = ((ctx.currentTime - t0) / period) % 1
          dot.style.transform = `scale(${1 + 0.4 * Math.max(0, 1 - ph * 4)})`
          requestAnimationFrame(tick)
        }
        tick()
        return
      }
      const t = ctx.currentTime - t0
      const nearest = Math.round(t / period)
      if (nearest < 2) return
      deltas.push((t - nearest * period) * 1000)
      msg.textContent = `${deltas.length} / ${TAPS}`
      if (deltas.length >= TAPS) { removeEventListener('keydown', onKey); resolve(Math.round(median(deltas))) }
    }
    signal.addEventListener('abort', () => { removeEventListener('keydown', onKey); resolve(null) })
    addEventListener('keydown', onKey)
  })
}
