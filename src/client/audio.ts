const PREVIEW_START = 0.38
const PREVIEW_VOLUME = 0.6
const FADE_STEP = 0.06
const FADE_MS = 60

let context: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer>>()
let preview: HTMLAudioElement | null = null

export const audioContext = () => {
  context ??= new AudioContext()
  return context
}

export function heardTime(ctx: AudioContext, at: number = performance.now()) {
  const stamp = ctx.getOutputTimestamp()
  const contextTime = stamp.contextTime ?? ctx.currentTime - ctx.baseLatency
  const performanceTime = stamp.performanceTime ?? performance.now()
  return contextTime + (at - performanceTime) / 1000
}

export function loadSong(slug: string): Promise<AudioBuffer> {
  const cached = buffers.get(slug)
  if (cached !== undefined) return cached
  const loading = fetch(`/audio/${slug}.mp3`)
    .then((res) => res.arrayBuffer())
    .then((bytes) => audioContext().decodeAudioData(bytes))
  buffers.set(slug, loading)
  return loading
}

export function stopPreview() {
  preview?.pause()
  preview = null
}

export function playPreview(slug: string, duration: number) {
  stopPreview()
  const el = new Audio(`/audio/${slug}.mp3`)
  el.volume = 0
  el.currentTime = Math.max(0, duration * PREVIEW_START)
  preview = el
  el.play().catch(() => { stopPreview() })
  const fade = setInterval(() => {
    el.volume = Math.min(PREVIEW_VOLUME, el.volume + FADE_STEP)
    if (preview !== el || el.volume >= PREVIEW_VOLUME) clearInterval(fade)
  }, FADE_MS)
}
