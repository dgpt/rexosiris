export type Clicks = { readonly first: number; readonly beat: number; readonly seconds: number; readonly shape: 'kick' | 'tick' }

const NOISE = 0.04
const KICK_SECONDS = 0.15
const HAT_SECONDS = 0.03
const TICK_SAMPLES = 400

function noise(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648 - 0.5
  }
}

const kick = (u: number, random: () => number) =>
  Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-u * 30)) * u) * Math.exp(-u * 12) + (u < HAT_SECONDS ? random() * 0.6 * Math.exp(-u * 150) : 0)

export function clicks(spec: Clicks, sampleRate: number): Float32Array {
  const random = noise(7)
  const pcm = Float32Array.from({ length: Math.round(spec.seconds * sampleRate) }, () => random() * NOISE)
  const length = spec.shape === 'kick' ? Math.round(KICK_SECONDS * sampleRate) : TICK_SAMPLES
  for (let t = spec.first; t < spec.seconds - 0.3; t += spec.beat) {
    const start = Math.round(t * sampleRate)
    for (let k = 0; k < length; k++) {
      const v = spec.shape === 'kick' ? kick(k / sampleRate, random) : Math.sin(k * 0.9) * Math.exp(-k / 60)
      pcm[start + k] = (pcm[start + k] ?? 0) + v
    }
  }
  return pcm
}
