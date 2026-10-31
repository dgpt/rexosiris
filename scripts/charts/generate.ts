import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { DIFFICULTIES, type Difficulty } from '../../src/shared/analyze'
import { readProject } from '../flp/project'
import { placed } from '../flp/timeline'
import { anchored, atOctaveOf, fitToOnsets, type Grid, heard } from './grid'
import { chartPass, timingPass } from './model'
import { onsetCurve } from './onsets'
import { readOsu, timingReference } from './osu'
import { audioOf, beatmapIn, pcmOf, SAMPLE_RATE, type Song, songs, STARS, workPaths } from './songs'

const MIN_BPM = 60
const MAX_BPM = 250
const MAX_FAILURES = 3

const flag = (name: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? undefined : process.argv[at + 1]
}
const workArg = process.argv[2] ?? ''
if (workArg === '' || workArg.startsWith('--')) throw new Error('usage: bun scripts/charts/generate.ts <work-dir> [--seeds 7,11,23] [--lanes 2] [--only slug,slug]')
const work = resolve(workArg)
const seeds = (flag('seeds') ?? '7,11,23').split(',').map(Number)
const lanes = Number(flag('lanes') ?? '2')
const only = (flag('only') ?? '').split(',').filter((s) => s !== '')

let failures = 0
function failed(what: string, error: unknown) {
  failures += 1
  console.log(`  FAILED ${what}: ${error instanceof Error ? error.message : String(error)}`)
  if (failures >= MAX_FAILURES) throw new Error(`${failures} failures, stopping`)
}

async function inLanes<T>(items: readonly T[], each: (item: T) => Promise<void>) {
  let next = 0
  const worker = async (): Promise<void> => {
    const item = items[next]
    next += 1
    if (item === undefined) return
    await each(item)
    await worker()
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()))
}

const bpm = (grid: Grid) => (60 / grid.beat).toFixed(3)

async function heardGrid(song: Song, audio: string, duration: number, tries: readonly number[]): Promise<Grid> {
  const [seed, ...rest] = tries
  if (seed === undefined) throw new Error(`${song.track.slug}: no timing pass heard a tempo between ${MIN_BPM} and ${MAX_BPM} bpm`)
  const out = workPaths(work, song.track.slug).timing(seed)
  const pass = beatmapIn(out) ?? (await timingPass(audio, out, seed))
  const grid = heard(readOsu(readFileSync(pass, 'utf8')).timing, duration)
  if (60 / grid.beat >= MIN_BPM && 60 / grid.beat <= MAX_BPM) return grid
  console.log(`  ${song.track.slug} timing pass seed ${seed} heard ${bpm(grid)} bpm`)
  return heardGrid(song, audio, duration, rest)
}

function projectGrid(song: Song): Grid | undefined {
  if (song.link === undefined) return undefined
  const { grid } = placed(readProject(new Uint8Array(readFileSync(song.link.flp))), song.link)
  return anchored(grid.beat, grid.origin)
}

async function settleGrid(song: Song) {
  const file = workPaths(work, song.track.slug).grid
  if (existsSync(file)) return
  const audio = audioOf(work, song.track)
  const curve = onsetCurve(pcmOf(work, song.track), SAMPLE_RATE)
  const model = await heardGrid(song, audio, curve.duration, seeds)
  const project = projectGrid(song)
  const start = project === undefined ? model : atOctaveOf(project, model)
  const fit = fitToOnsets(start, curve)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, timingReference(fit.grid, basename(audio)))
  const thirds = fit.thirds.map((s) => (s * 1000).toFixed(1)).join('/')
  console.log(`${song.track.slug.padEnd(42)} ${project === undefined ? 'heard  ' : 'project'} ${bpm(start)} -> ${bpm(fit.grid)} bpm (${(fit.tempoChange * 100).toFixed(3)}%), moved ${(fit.shift * 1000).toFixed(1)} ms, thirds ${thirds} ms`)
}

type Job = { readonly song: Song; readonly difficulty: Difficulty; readonly seed: number }

async function chart(job: Job) {
  const paths = workPaths(work, job.song.track.slug)
  const started = performance.now()
  await chartPass({ audio: audioOf(work, job.song.track), reference: paths.grid, out: paths.chart(job.difficulty, job.seed), stars: STARS[job.difficulty], seed: job.seed })
  console.log(`${job.song.track.slug} ${job.difficulty} seed ${job.seed}: ${Math.round((performance.now() - started) / 1000)} s`)
}

const attempt = <T>(what: (item: T) => string, each: (item: T) => Promise<void>) => async (item: T) => {
  try {
    await each(item)
  } catch (error) {
    failed(what(item), error)
  }
}

const list = songs(only)
await inLanes(list, attempt((song) => `${song.track.slug} grid`, settleGrid))
const settled = list.filter((song) => existsSync(workPaths(work, song.track.slug).grid))
const jobs = seeds.flatMap((seed) =>
  settled.flatMap((song) => DIFFICULTIES.filter((difficulty) => beatmapIn(workPaths(work, song.track.slug).chart(difficulty, seed)) === undefined).map((difficulty) => ({ song, difficulty, seed }))),
)
console.log(`${jobs.length} charts to generate in ${lanes} lanes`)
await inLanes(jobs, attempt((job) => `${job.song.track.slug} ${job.difficulty} seed ${job.seed}`, chart))
console.log(`done, ${failures} failed`)
