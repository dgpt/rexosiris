import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beatmapIn } from './songs'

const HOLD_NOTE_RATIO = 0.1
const TIMING_BEAMS = 4
const KEYS = 4

function home(): string {
  const root = process.env['MAPPERATORINATOR'] ?? ''
  if (root === '' || !existsSync(join(root, 'inference.py'))) {
    throw new Error('set MAPPERATORINATOR to a Mapperatorinator checkout with its .venv installed (see README, "How the charts are made")')
  }
  return root
}

async function run(out: string, args: readonly string[]): Promise<string> {
  mkdirSync(out, { recursive: true })
  const root = home()
  const log = join(out, 'run.log')
  const child = Bun.spawn([join(root, '.venv/bin/python'), 'inference.py', '-cn', 'v32', `output_path=${out}`, 'gamemode=3', `keycount=${KEYS}`, `hold_note_ratio=${HOLD_NOTE_RATIO}`, ...args], {
    cwd: root,
    env: { ...process.env, WANDB_MODE: 'disabled', PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True' },
    stdout: Bun.file(log),
    stderr: 'pipe',
  })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  const osu = beatmapIn(out)
  if (code !== 0 || osu === undefined) {
    const tail = `${readFileSync(log, 'utf8')}${stderr}`.trim().split('\n').slice(-3).join('\n')
    throw new Error(`Mapperatorinator exited ${code} in ${out}:\n${tail}`)
  }
  return osu
}

export const timingPass = (audio: string, out: string, seed: number) =>
  run(out, [`audio_path=${audio}`, `seed=${seed}`, 'difficulty=1', 'super_timing=true', `timer_num_beams=${TIMING_BEAMS}`, 'output_type=[TIMING]'])

export type ChartRequest = { readonly audio: string; readonly reference: string; readonly out: string; readonly stars: number; readonly seed: number }

export const chartPass = (request: ChartRequest) =>
  run(request.out, [`audio_path=${request.audio}`, `seed=${request.seed}`, `difficulty=${request.stars}`, `beatmap_path=${request.reference}`, 'in_context=[TIMING]', 'output_type=[MAP,SV]', 'hitsounded=true'])
