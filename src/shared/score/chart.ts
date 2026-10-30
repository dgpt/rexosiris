import type { Analysis, Difficulty, Note, Section } from '../analysis/model'
import { framesPerSecond, round3 } from '../analysis/model'
import { pitchLanes, unjack } from './lanes'
import { BEATS_PER_PHRASE, phraseOf, phraseStart, quantOf, type ScoreGrid } from './metric'
import { attackAt, type Hearing, snapTime } from './hearing'
import { gapInBeats, type Profile, thin } from './select'
import { isMelodic, partsOf, type Voice, type VoiceKind, type VoiceNote } from './voices'

export const PROFILES: Readonly<Record<Difficulty, Profile>> = {
  easy: { minGap: 1, minGapSeconds: 0.5, jackGap: 1, holdMin: 2, fillAfter: null },
  normal: { minGap: 0.5, minGapSeconds: 0.22, jackGap: 0.5, holdMin: 1, fillAfter: null },
  hard: { minGap: 0.25, minGapSeconds: 0.11, jackGap: 0.25, holdMin: 1, fillAfter: 1 },
}

const MIN_PHRASE_NOTES = 3
const MIN_SOLO_NOTES = 3
const KEEP_LEADER = 1.2
const FULL_PRESENCE_NOTES = 8
const SAME_ONSET_SECONDS = 0.02
const ROLE: Readonly<Record<VoiceKind, number>> = { lead: 1.15, bass: 1, chords: 0.75, kick: 1, snare: 1, hats: 0.5, perc: 0.6 }
const DRUM_LEADS: ReadonlySet<VoiceKind> = new Set(['kick', 'snare'])
const HOLD_RELEASE_BEATS = 0.25
const HOLD_STEP_BEATS = 0.25
const HOLDS_FROM: ReadonlySet<VoiceKind> = new Set(['lead', 'bass', 'chords'])

export type ScoreChart = { readonly notes: Note[]; readonly sections: Section[] }
type Pick = { readonly voice: Voice; readonly notes: VoiceNote[] }
type Context = {
  readonly grid: ScoreGrid
  readonly audio: Analysis
  readonly hearing: Hearing
  readonly profile: Profile
  readonly parts: readonly Voice[]
  readonly loudness: ReadonlyMap<Voice, number>
}

const inPhrase = (ctx: Context, phrase: number) => (n: VoiceNote) => phraseOf(ctx.grid, n.t) === phrase

function window(ctx: Context, phrase: number) {
  const from = phraseStart(ctx.grid, phrase)
  return { from, to: from + BEATS_PER_PHRASE * ctx.grid.beat }
}

const median = (xs: readonly number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

function soloNotes(parts: readonly Voice[], part: Voice, notes: readonly VoiceNote[]) {
  const others = parts.filter((p) => p !== part).flatMap((p) => p.notes.map((n) => n.t))
  return notes.filter((n) => !others.some((t) => Math.abs(t - n.t) < SAME_ONSET_SECONDS))
}

function loudnessOf(hearing: Hearing, parts: readonly Voice[], part: Voice, notes: readonly VoiceNote[]) {
  const solo = soloNotes(parts, part, notes)
  const heard = (solo.length >= MIN_SOLO_NOTES ? solo : notes).map((n) => attackAt(hearing, n.t))
  return median(heard)
}

function candidates(ctx: Context, phrase: number, melodic: boolean): (Pick & { readonly score: number })[] {
  return ctx.parts.flatMap((voice) => {
    if (isMelodic(voice.kind) !== melodic || (!melodic && !DRUM_LEADS.has(voice.kind))) return []
    const notes = voice.notes.filter(inPhrase(ctx, phrase))
    if (notes.length < MIN_PHRASE_NOTES) return []
    const solo = soloNotes(ctx.parts, voice, notes)
    const loud = solo.length >= MIN_SOLO_NOTES ? loudnessOf(ctx.hearing, ctx.parts, voice, notes) : (ctx.loudness.get(voice) ?? 0)
    const presence = Math.sqrt(Math.min(1, notes.length / FULL_PRESENCE_NOTES))
    return [{ voice, notes: thin(notes, ctx.grid, ctx.profile.minGap), score: loud * ROLE[voice.kind] * presence }]
  })
}

function leader(ctx: Context, phrase: number, previous: Voice | null): Pick | null {
  const melodic = candidates(ctx, phrase, true)
  const ranked = (melodic.length > 0 ? melodic : candidates(ctx, phrase, false)).toSorted((a, b) => b.score - a.score)
  const best = ranked[0]
  const kept = ranked.find((c) => c.voice === previous)
  if (best === undefined) return null
  return kept !== undefined && kept.score * KEEP_LEADER >= best.score ? kept : best
}

function fill(ctx: Context, phrase: number, lead: Pick): Pick[] {
  const after = ctx.profile.fillAfter
  if (after === null) return []
  const { from, to } = window(ctx, phrase)
  const edges = [from - after * ctx.grid.beat, ...lead.notes.map((n) => n.t), to]
  const gaps = edges.slice(1).map((t, i) => ({ from: edges[i] ?? t, to: t })).filter((g) => g.to - g.from > after * ctx.grid.beat)
  if (gaps.length === 0) return []
  const inGap = (n: VoiceNote) => gaps.some((g) => n.t > g.from && n.t < g.to)
  const sameFamily = (v: Voice) => v !== lead.voice && (isMelodic(lead.voice.kind) ? isMelodic(v.kind) : DRUM_LEADS.has(v.kind))
  return ctx.parts
    .filter((v) => sameFamily(v))
    .map((voice) => ({ voice, notes: thin(voice.notes.filter((n) => inPhrase(ctx, phrase)(n) && inGap(n)), ctx.grid, ctx.profile.minGap, lead.notes) }))
}

function holdOf(ctx: Context, note: VoiceNote, next: number | undefined, kind: VoiceKind): number | null {
  if (!HOLDS_FROM.has(kind)) return null
  const beat = ctx.grid.beat
  const room = (next ?? Infinity) - note.t - HOLD_RELEASE_BEATS * beat
  const steps = Math.floor(Math.min(note.length, room) / (HOLD_STEP_BEATS * beat))
  const len = steps * HOLD_STEP_BEATS * beat
  return note.length >= ctx.profile.holdMin * beat && len >= ctx.profile.holdMin * beat * 0.75 ? round3(len) : null
}

function notesOf(ctx: Context, picks: readonly Pick[], phraseNotes: readonly VoiceNote[]): Note[] {
  const all = picks.flatMap((p) => p.notes.map((n) => ({ n, voice: p.voice }))).toSorted((a, b) => a.n.t - b.n.t)
  const lead = picks[0]?.voice
  const lanesFor = new Map(picks.map((p) => [p.voice, pitchLanes(p.voice === lead ? phraseNotes : p.voice.notes, p.voice.kind)]))
  return all.map(({ n, voice }, i): Note => {
    const lane = lanesFor.get(voice)?.(n) ?? 1
    const len = holdOf(ctx, n, all[i + 1]?.n.t, voice.kind)
    const t = round3(snapTime(ctx.hearing, n.t))
    const q = quantOf(ctx.grid, n.t)
    return len === null ? { t, lane, q } : { t, lane, q, len }
  })
}

function energyAt(audio: Analysis, from: number, to: number) {
  const fps = framesPerSecond(audio.sampleRate)
  const frames = audio.rms.subarray(Math.max(0, Math.floor(from * fps)), Math.ceil(to * fps))
  return frames.length === 0 ? 0 : frames.reduce((a, b) => a + b, 0) / frames.length
}

const displayName = (voice: Voice) => (voice.kind === 'kick' || voice.kind === 'snare' || voice.kind === 'hats' ? voice.kind : voice.name)

export function chartFromScore(voices: readonly Voice[], heard: { readonly audio: Analysis; readonly hearing: Hearing }, grid: ScoreGrid, difficulty: Difficulty): ScoreChart {
  const base = PROFILES[difficulty]
  const gap = gapInBeats(base, grid.beat)
  const parts = partsOf(voices)
  const loudness = new Map(parts.map((p) => [p, loudnessOf(heard.hearing, parts, p, p.notes)]))
  const ctx: Context = { grid, audio: heard.audio, hearing: heard.hearing, profile: { ...base, minGap: gap, jackGap: Math.max(base.jackGap, gap) }, parts, loudness }
  const audio = heard.audio
  const times = parts.flatMap((v) => v.notes.map((n) => n.t))
  const first = phraseOf(grid, Math.min(...times))
  const last = phraseOf(grid, Math.min(audio.duration, Math.max(...times)))
  const notes: Note[] = []
  const sections: Section[] = []
  let previous: Voice | null = null
  for (let phrase = first; phrase <= last; phrase++) {
    const lead = leader(ctx, phrase, previous)
    if (lead === null) continue
    previous = lead.voice
    const { from, to } = window(ctx, phrase)
    sections.push({ t: round3(Math.max(0, from)), voice: displayName(lead.voice), energy: round3(energyAt(audio, from, to)) })
    const phraseNotes = lead.voice.notes.filter(inPhrase(ctx, phrase))
    notes.push(...notesOf(ctx, [lead, ...fill(ctx, phrase, lead)], phraseNotes))
  }
  const sorted = notes.filter((n) => n.t >= 0 && n.t < audio.duration).toSorted((a, b) => a.t - b.t)
  return { notes: unjack(sorted, ctx.profile.jackGap * grid.beat * 0.98), sections }
}
