const BPM = 100
export const PERIOD = 60 / BPM
const LEAD_IN = 0.5
const LOOKAHEAD = 0.25
const TICK_MS = 50

export type Metronome = { readonly startedAt: number; readonly stop: () => void }

function click(ctx: AudioContext, out: AudioNode, at: number, accent: boolean) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = accent ? 1320 : 880
  gain.gain.setValueAtTime(0.5, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.07)
}

export function metronome(ctx: AudioContext, dot: HTMLElement, signal: AbortSignal): Metronome {
  const out = ctx.createGain()
  out.connect(ctx.destination)
  const startedAt = ctx.currentTime + LEAD_IN
  let next = 0
  let running = true
  const schedule = () => {
    while (startedAt + next * PERIOD < ctx.currentTime + LOOKAHEAD) {
      click(ctx, out, startedAt + next * PERIOD, next % 4 === 0)
      next += 1
    }
  }
  const timer = setInterval(() => {
    if (document.body.dataset['screen'] === 'calibrate') schedule()
    else stop()
  }, TICK_MS)
  const pulse = () => {
    if (!running) return
    const phase = (((ctx.currentTime - startedAt) / PERIOD) % 1 + 1) % 1
    dot.style.transform = `scale(${1 + 0.4 * Math.max(0, 1 - phase * 4)})`
    requestAnimationFrame(pulse)
  }
  function stop() {
    if (!running) return
    running = false
    clearInterval(timer)
    out.disconnect()
    dot.style.transform = ''
  }
  signal.addEventListener('abort', stop)
  schedule()
  pulse()
  return { startedAt, stop }
}
