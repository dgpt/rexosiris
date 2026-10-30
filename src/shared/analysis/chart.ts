import { ACROSS, laneBins, MIRROR, PARTNER, quantOf } from './lanes'
import { type Analysis, beatLength, type Difficulty, type Hit, type Lane, type Note, round3, type Section, sum, VOICES } from './model'
import { BEATS_PER_PHRASE, type Phrase, phrasesOf, sections, within } from './phrases'
import { allVoiceHits } from './voices'

type Profile = {
  readonly slotsPerBeat: 1 | 2 | 4
  readonly notesPerBeat: number
  readonly secondVoice: boolean
  readonly jumps: boolean
  readonly holds: boolean
  readonly maxGapBeats: number
  readonly minRepeatBeats: number
}

const PROFILES: Readonly<Record<Difficulty, Profile>> = {
  easy: { slotsPerBeat: 1, notesPerBeat: 0.55, secondVoice: false, jumps: false, holds: false, maxGapBeats: 4, minRepeatBeats: 1.01 },
  normal: { slotsPerBeat: 2, notesPerBeat: 1.05, secondVoice: false, jumps: false, holds: true, maxGapBeats: 2, minRepeatBeats: 0.6 },
  hard: { slotsPerBeat: 4, notesPerBeat: 1.9, secondVoice: true, jumps: true, holds: true, maxGapBeats: 2, minRepeatBeats: 0.3 },
}

const QUIET_PHRASE = 0.18
const JUMP_STRENGTH = 0.35
const HOLD_MIN_BEATS = 1.2
const HOLD_MAX_BEATS = 4
const GAP_FILL_PASSES = 8

export type Chart = { readonly notes: Note[]; readonly sections: Section[] }

const strength = (hits: readonly Hit[]) => sum(hits.map((h) => h.strength))
const byTime = (x: Hit, y: Hit) => x.t - y.t
const byStrength = (x: Hit, y: Hit) => y.strength - x.strength

function candidatesFor(hits: readonly Hit[][], phrase: Phrase, leader: number, profile: Profile) {
  const onGrid = (h: Hit) => within(phrase)(h) && h.slot % (4 / profile.slotsPerBeat) === 0
  const primary = (hits[leader] ?? []).filter((h) => onGrid(h))
  if (!profile.secondVoice) return primary
  const runnerUp = hits
    .filter((_, v) => v !== leader)
    .map((hs) => hs.filter((h) => within(phrase)(h) && h.slot % 2 === 0))
    .toSorted((x, y) => strength(y) - strength(x))[0] ?? []
  return [...primary, ...runnerUp.filter((h) => !primary.some((p) => p.slot === h.slot))]
}

function budgeted(pool: readonly Hit[], profile: Profile, energy: number) {
  const budget = Math.round(profile.notesPerBeat * BEATS_PER_PHRASE * (0.45 + 0.75 * energy))
  return pool.toSorted(byStrength).slice(0, budget).toSorted(byTime)
}

function fillGaps(kept: readonly Hit[], filler: readonly Hit[], phrase: Phrase & { readonly maxGap: number }, beat: number) {
  const out = [...kept]
  for (let pass = 0; pass < GAP_FILL_PASSES; pass++) {
    const edges = [phrase.t0 - beat, ...out.map((h) => h.t), phrase.t1]
    const added = edges.slice(1).flatMap((end, i) => {
      const start = edges[i] ?? end
      if (end - start <= phrase.maxGap) return []
      const fill = filler.find((h) => h.t > start + beat * 0.49 && h.t < end - beat * 0.49 && !out.includes(h))
      return fill === undefined ? [] : [fill]
    })
    if (added.length === 0) break
    out.push(...added)
    out.sort(byTime)
  }
  return out
}

function holdLength(h: Hit, beat: number, profile: Profile) {
  const sustains = VOICES[h.voice]?.sustains ?? false
  if (!profile.holds || !sustains || h.sustain < beat * HOLD_MIN_BEATS) return 0
  return round3(Math.min(HOLD_MAX_BEATS, Math.floor((h.sustain / beat) * 2) / 2) * beat)
}

class LanePicker {
  private lane: Lane = 1
  private at = -1

  constructor(private readonly minGap: number) {}

  pick(wanted: Lane, t: number): Lane {
    const lane = wanted === this.lane && t - this.at < this.minGap ? PARTNER[wanted] : wanted
    this.lane = lane
    this.at = t
    return lane
  }
}

function notesFor(kept: readonly Hit[], leader: number, beat: number, ctx: { profile: Profile; picker: LanePicker }) {
  const bins = new Map(VOICES.map((_, v) => [v, laneBins(kept.filter((h) => h.voice === v).map((h) => h.timbre))]))
  const notes: Note[] = []
  let last = -1
  for (const h of kept) {
    if (h.t - last < 1e-3) continue
    last = h.t
    const own = bins.get(h.voice)?.(h.timbre) ?? 1
    const lane = ctx.picker.pick(h.voice === leader ? own : MIRROR[own], h.t)
    const len = holdLength(h, beat, ctx.profile)
    notes.push({ t: round3(h.t), lane, q: quantOf(h.slot), ...(len > 0 ? { len } : {}) })
    if (ctx.profile.jumps && h.slot % 16 === 0 && h.strength > JUMP_STRENGTH) notes.push({ t: round3(h.t), lane: ACROSS[lane], q: 4 })
  }
  return notes
}

export function trimHolds(notes: readonly Note[], beat: number): Note[] {
  return notes.map((n, i) => {
    if (n.len === undefined) return n
    const next = notes.slice(i + 1).find((m) => m.lane === n.lane)
    const room = next === undefined ? n.len : next.t - n.t - beat * 0.5
    const len = Math.min(n.len, (Math.floor((room / beat) * 2) / 2) * beat)
    return len >= beat ? { ...n, len: round3(len) } : { t: n.t, lane: n.lane, q: n.q }
  })
}

export function chartWithSections(a: Analysis, difficulty: Difficulty): Chart {
  const profile = PROFILES[difficulty]
  const beat = beatLength(a.bpm)
  const hits = allVoiceHits(a)
  const secs = sections(a, hits)
  const picker = new LanePicker(beat * profile.minRepeatBeats)
  const notes = phrasesOf(a).flatMap((p, i) => {
    const sec = secs[i]
    if (sec === undefined) return []
    const leader = VOICES.findIndex((v) => v.name === sec.voice)
    const phrase = { ...p, maxGap: sec.energy < QUIET_PHRASE ? Infinity : beat * profile.maxGapBeats }
    const filler = hits.flat().filter((h) => within(p)(h) && h.slot % (4 / profile.slotsPerBeat) === 0).toSorted(byStrength)
    const kept = fillGaps(budgeted(candidatesFor(hits, p, leader, profile), profile, sec.energy), filler, phrase, beat)
    return notesFor(kept, leader, beat, { profile, picker })
  })
  return { notes: trimHolds(notes, beat), sections: secs }
}

export const chart = (a: Analysis, difficulty: Difficulty) => chartWithSections(a, difficulty).notes
