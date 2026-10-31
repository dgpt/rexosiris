import { describe, expect, test } from 'bun:test'
import index from '../../../public/charts/index.json'
import { type Family, pointOf, sceneFor, turnsOf } from './scenes'

const titles = index.map((song) => song.title)
const FAMILIES: readonly Family[] = ['rose', 'lissajous', 'spiro', 'superformula']

describe('each song gets its own picture', () => {
  test('the same title always draws the same scene', () => {
    expect(sceneFor('drive')).toEqual(sceneFor('drive'))
  })

  test('the albums do not all look alike', () => {
    const scenes = titles.map((title) => sceneFor(title))
    const looks = new Set(scenes.map((s) => `${s.family} ${s.ratio.join(':')} ${s.symmetry}`))
    expect(looks.size).toBeGreaterThanOrEqual(titles.length - 2)
    expect(new Set(scenes.map((s) => s.family)).size).toBe(FAMILIES.length)
  })

  test('every figure stays on screen however hard the bass hits', () => {
    const far = titles.flatMap((title) => {
      const scene = sceneFor(title)
      const steps = 400 * turnsOf(scene)
      return Array.from({ length: steps + 1 }, (_, i) => pointOf(scene, (i / steps) * Math.PI * 2 * turnsOf(scene), { t: 12.3, breath: 1 }))
        .filter(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 1.5)
        .map(() => title)
    })
    expect([...new Set(far)]).toEqual([])
  })
})
