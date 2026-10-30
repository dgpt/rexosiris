import { readFileSync, writeFileSync } from 'node:fs'
import { isArrayOf, isNumber, isRecord, isString } from '../../src/shared/guards'

export type ProjectLink = { readonly flp: string; readonly scale: number; readonly offset: number }

const MAX_DRIFT_SECONDS = 0.05
const MIN_CONTRAST = 1.5
const MIN_HIT_RATE = 0.75
export const LINKS_FILE = 'scripts/projects.local.json'

type Match = { readonly path: string; readonly scale: number; readonly offset: number; readonly contrast: number; readonly hitRate: number; readonly drift: number }

const isMatch = (v: unknown): v is Match =>
  isRecord(v) && isString(v['path']) && isNumber(v['scale']) && isNumber(v['offset']) && isNumber(v['contrast']) && isNumber(v['hitRate']) && isNumber(v['drift'])

export const isLink = (v: unknown): v is ProjectLink => isRecord(v) && isString(v['flp']) && isNumber(v['scale']) && isNumber(v['offset'])

const trusted = (m: Match) => Math.abs(m.drift) <= MAX_DRIFT_SECONDS && m.contrast >= MIN_CONTRAST && m.hitRate >= MIN_HIT_RATE

export function readLinks(): Record<string, ProjectLink> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(LINKS_FILE, 'utf8'))
    return isRecord(parsed) ? Object.fromEntries(Object.entries(parsed).filter((e): e is [string, ProjectLink] => isLink(e[1]))) : {}
  } catch {
    return {}
  }
}

function linksIn(file: string): Record<string, ProjectLink> {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isRecord(parsed)) return {}
  const links: Record<string, ProjectLink> = {}
  for (const [slug, matches] of Object.entries(parsed)) {
    const best = isArrayOf(isMatch)(matches) ? matches.find((m) => trusted(m)) : undefined
    if (best !== undefined) links[slug] = { flp: best.path, scale: best.scale, offset: best.offset }
  }
  return links
}

if (import.meta.main) {
  const files = process.argv.slice(2)
  if (files.length === 0) throw new Error('usage: bun scripts/flp/link.ts <matches.json>... (later files win)')
  const links: Record<string, ProjectLink> = readLinks()
  for (const file of files) Object.assign(links, linksIn(file))
  writeFileSync(LINKS_FILE, `${JSON.stringify(links, null, 2)}\n`)
  console.log(`${Object.keys(links).length} songs linked to a project: ${Object.keys(links).toSorted().join(', ')}`)
}
