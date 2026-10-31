export type Point = readonly [number, number]
export type Family = 'rose' | 'lissajous' | 'spiro' | 'superformula'

export type Scene = {
  readonly family: Family
  readonly ratio: readonly [number, number]
  readonly shape: readonly [number, number, number]
  readonly symmetry: number
  readonly beatSides: number
  readonly zoom: number
  readonly spin: number
  readonly decay: number
  readonly hueShift: number
  readonly hueSpeed: number
  readonly turnSpeed: number
}

const FAMILIES: readonly Family[] = ['rose', 'lissajous', 'spiro', 'superformula']
const RATIOS: Readonly<Record<Family, readonly (readonly [number, number])[]>> = {
  rose: [[2, 1], [3, 1], [5, 2], [7, 3], [4, 3], [5, 3], [7, 4], [6, 5], [8, 3]],
  lissajous: [[1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [1, 3], [5, 7]],
  spiro: [[2, 5], [3, 7], [2, 7], [3, 8], [4, 9], [5, 12], [3, 10]],
  superformula: [[3, 1], [5, 1], [6, 1], [7, 1], [8, 1], [11, 1], [4, 1]],
}

const U32 = 4294967296
const u32 = (x: number) => ((x % U32) + U32) % U32

export function seededRandom(text: string): () => number {
  let state = 2166136261
  for (const ch of text) state = u32(Math.imul(state ^ (ch.codePointAt(0) ?? 0), 16777619))
  return () => {
    state = u32(state + 0x6d2b79f5)
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return u32(x ^ (x >>> 14)) / U32
  }
}

function picker(rand: () => number) {
  return <T>(xs: readonly T[]): T => {
    const chosen = xs[Math.floor(rand() * xs.length)]
    if (chosen === undefined) throw new Error('nothing to pick from')
    return chosen
  }
}

export function sceneFor(title: string): Scene {
  const rand = seededRandom(title)
  const pick = picker(rand)
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const family = pick(FAMILIES)
  return {
    family,
    ratio: pick(RATIOS[family]),
    shape: [between(0.4, 1.6), between(0.5, 3), between(0.5, 3)],
    symmetry: pick([1, 2, 3, 4, 5, 6]),
    beatSides: pick([3, 4, 5, 6, 8]),
    zoom: between(1.008, 1.03),
    spin: between(0.002, 0.012) * (rand() < 0.5 ? -1 : 1),
    decay: between(0.86, 0.93),
    hueShift: between(0, 360),
    hueSpeed: between(4, 18),
    turnSpeed: between(0.05, 0.25) * (rand() < 0.5 ? -1 : 1),
  }
}

export const turnsOf = (scene: Scene): number => (scene.family === 'rose' || scene.family === 'spiro' ? scene.ratio[scene.family === 'rose' ? 1 : 0] : 1)

function superformula(scene: Scene, theta: number, breath: number): number {
  const m = scene.ratio[0]
  const [n1, n2, n3] = scene.shape
  const a = Math.abs(Math.cos((m * theta) / 4)) ** n2
  const b = Math.abs(Math.sin((m * theta) / 4)) ** n3
  return Math.min(2, (a + b) ** (-1 / (n1 * (1 + breath))))
}

export function pointOf(scene: Scene, theta: number, motion: { readonly t: number; readonly breath: number }): Point {
  const [p, q] = scene.ratio
  if (scene.family === 'rose') {
    const r = Math.cos((p / q) * theta) * (0.8 + motion.breath * 0.2)
    return [r * Math.cos(theta), r * Math.sin(theta)]
  }
  if (scene.family === 'lissajous') return [Math.sin(p * theta + motion.t * 0.4), Math.sin(q * theta)]
  if (scene.family === 'spiro') {
    const r = p / q
    const d = 0.6 + scene.shape[0] * 0.3 + motion.breath * 0.2
    const k = (1 - r) / r
    return [((1 - r) * Math.cos(theta) + d * r * Math.cos(k * theta)) / (1 - r + d * r), ((1 - r) * Math.sin(theta) - d * r * Math.sin(k * theta)) / (1 - r + d * r)]
  }
  const r = superformula(scene, theta, motion.breath) / 2
  return [r * Math.cos(theta), r * Math.sin(theta)]
}
