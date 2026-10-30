import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { peekEvent } from './events'
import { EVENT } from './project'

const PEEK_BYTES = 8192
const TEMPO_TOLERANCE = 0.015
const RATIOS = [0.5, 1, 2, 4]
const [root = '', bpmList = '', out = ''] = process.argv.slice(2)
if (out === '') throw new Error('usage: bun scripts/flp/scan.ts <projects-root> <bpms.txt: one bpm per line> <out-list.txt>')

const targets = readFileSync(bpmList, 'utf8').split('\n').filter((l) => l !== '').map(Number)

function* flps(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* flps(path)
    else if (name.toLowerCase().endsWith('.flp')) yield path
  }
}

function tempoOf(path: string) {
  const head = new Uint8Array(PEEK_BYTES)
  const bytes = readFileSync(path).subarray(0, PEEK_BYTES)
  head.set(bytes)
  const event = peekEvent(head.subarray(0, bytes.length), EVENT.fineTempo)
  return event === null ? null : event.value / 1000
}

const compatible = (tempo: number) => targets.some((bpm) => RATIOS.some((r) => Math.abs(tempo / (bpm * r) - 1) < TEMPO_TOLERANCE))

const kept: string[] = []
let seen = 0
for (const path of flps(root)) {
  seen += 1
  const tempo = tempoOf(path)
  if (tempo !== null && compatible(tempo)) kept.push(path)
}
writeFileSync(out, `${kept.join('\n')}\n`)
console.log(`${kept.length} of ${seen} projects have a compatible tempo`)
