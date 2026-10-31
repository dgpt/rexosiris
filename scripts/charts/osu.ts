import type { Grid } from './grid'

export type TimingPoint = { readonly t: number; readonly beat: number }
export type HitObject = { readonly t: number; readonly column: number; readonly end: number | null }
export type Beatmap = { readonly keys: number; readonly timing: readonly TimingPoint[]; readonly objects: readonly HitObject[] }

const PLAYFIELD_WIDTH = 512
const HOLD_TYPE = 128
const UNINHERITED = '1'

function section(text: string, name: string): string[] {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `[${name}]`)
  if (start === -1) return []
  const end = lines.findIndex((l, i) => i > start && l.startsWith('['))
  return lines.slice(start + 1, end === -1 ? undefined : end).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('//'))
}

function keysOf(text: string): number {
  const line = section(text, 'Difficulty').find((l) => l.startsWith('CircleSize:'))
  const keys = Number(line?.slice('CircleSize:'.length))
  if (!Number.isInteger(keys) || keys < 1) throw new Error(`no key count in this beatmap (CircleSize: ${line ?? 'missing'})`)
  return keys
}

function timingOf(text: string): TimingPoint[] {
  return section(text, 'TimingPoints')
    .map((l) => l.split(','))
    .filter((p) => p[6] === UNINHERITED && Number(p[1]) > 0)
    .map((p) => ({ t: Number(p[0]) / 1000, beat: Number(p[1]) / 1000 }))
}

function objectsOf(text: string, keys: number): HitObject[] {
  return section(text, 'HitObjects')
    .map((line): HitObject => {
      const [x = '0', , time = '0', type = '0', , extra = ''] = line.split(',')
      const t = Number(time) / 1000
      const end = (Number(type) & HOLD_TYPE) === 0 ? null : Number(extra.split(':')[0]) / 1000
      return { t, column: Math.min(keys - 1, Math.floor((Number(x) * keys) / PLAYFIELD_WIDTH)), end: end !== null && end > t ? end : null }
    })
    .toSorted((a, b) => a.t - b.t || a.column - b.column)
}

export function readOsu(text: string): Beatmap {
  const keys = keysOf(text)
  return { keys, timing: timingOf(text), objects: objectsOf(text, keys) }
}

const ms = (seconds: number) => (seconds * 1000).toFixed(6)

export function timingReference(grid: Grid, audioFile: string): string {
  return [
    'osu file format v14',
    '',
    '[General]',
    `AudioFilename: ${audioFile}`,
    'Mode: 3',
    '',
    '[Metadata]',
    'Title:timing',
    'Version:timing',
    '',
    '[Difficulty]',
    'HPDrainRate:5',
    'CircleSize:4',
    'OverallDifficulty:8',
    'ApproachRate:9',
    'SliderMultiplier:1.4',
    'SliderTickRate:1',
    '',
    '[TimingPoints]',
    `${ms(grid.firstBeat)},${ms(grid.beat)},4,2,0,100,1,0`,
    '',
    '[HitObjects]',
    '',
  ].join('\n')
}
