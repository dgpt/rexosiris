import type { Analysis, Difficulty, Note, Section } from '../analysis/model'
import { framesPerSecond, round3 } from '../analysis/model'
import { pitchLanes, unjack } from './lanes'
import { BEATS_PER_PHRASE, phraseOf, phraseStart, quantOf, type ScoreGrid } from './metric'
import { audibility, gapInBeats, KIND_WEIGHT, type Profile, thin } from './select'
import type { Voice, VoiceKind, VoiceNote } from './voices'

export const PROFILES: Readonly<Record<Difficulty, Profile>> = {
  easy: { minGap: 1, minGapSeconds: 0.5, jackGap: 1, holdMin: 2, fillAfter: null },
  normal: { minGap: 0.5, minGapSeconds: 0.22, jackGap: 0.5, holdMin: 1, fillAfter: 2 },
  hard: { minGap: 0.25, minGapSeconds: 0.11, jackGap: 0.25, holdMin: 1, fillAfter: 1 },
}

const MIN_PHRASE_NOTES = 3
const KEEP_LEADER = 1.25
const HOLD_RELEASE_BEATS = 0.25
const HOLD_STEP_BEATS = 0.25
const FILL_KINDS: ReadonlySet<VoiceKind> = new Set(['kick', 'snare'])

export type ScoreChart = { readonly notes: Note[]; readonly sections: Section[] }
type Pick = { readonly voice: Voice; readonly notes: VoiceNote[] }
type Context = { readonly grid: ScoreGrid; readonly audio: Analysis; readonly profile: Profile; readonly voices: readonly Voice[] }

const inPhrase = (ctx: Context, phrase: number) => (n: VoiceNote) => phraseOf(ctx.grid, n.t) === phrase

function window(ctx: Context, phrase: number) {
  const from = phraseStart(ctx.grid, phrase)
  return { from, to: from + BEATS_PER_PHRASE * ctx.grid.beat }
}

function candidates(ctx: Context, phrase: number): (Pick & { readonly score: number })[] {
  return ctx.voices.flatMap((voice) => {
    const notes = voice.notes.filter(inPhrase(ctx, phrase))
    if (notes.length < MIN_PHRASE_NOTES) return []
    const playable = thin(notes, ctx.grid, ctx.profile.minGap)
    const score = audibility(ctx.audio, notes, window(ctx, phrase)) * KIND_WEIGHT[voice.kind] * Math.sqrt(playable.length)
    return [{ voice, notes: playable, score }]
  })
}

function leader(ctx: Context, phrase: number, previous: Voice | null): Pick | null {
  const ranked = candidates(ctx, phrase).toSorted((a, b) => b.score - a.score)
  const best = ranked[0]
  const kept = ranked.find((c) => c.voice === previous)
  if (best === undefined) return null
  return kept !== undefined && kept.score * KEEP_LEADER >= best.score ? kept : best
}

function fill(ctx: Context, phrase: number, chosen: readonly VoiceNote[]): Pick[] {
  const after = ctx.profile.fillAfter
  if (after === null) return []
  const { from, to } = window(ctx, phrase)
  const edges = [from - after * ctx.grid.beat, ...chosen.map((n) => n.t), to]
  const gaps = edges.slice(1).map((t, i) => ({ from: edges[i] ?? t, to: t })).filter((g) => g.to - g.from > after * ctx.grid.beat)
  if (gaps.length === 0) return []
  const inGap = (n: VoiceNote) => gaps.some((g) => n.t > g.from && n.t < g.to)
  return ctx.voices
    .filter((v) => FILL_KINDS.has(v.kind))
    .map((voice) => ({ voice, notes: thin(voice.notes.filter((n) => inPhrase(ctx, phrase)(n) && inGap(n)), ctx.grid, ctx.profile.minGap, chosen) }))
}

const HOLDS_FROM: ReadonlySet<VoiceKind> = new Set(['lead', 'bass', 'chords'])

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
    const t = round3(n.t)
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

export function chartFromScore(voices: readonly Voice[], audio: Analysis, grid: ScoreGrid, difficulty: Difficulty): ScoreChart {
  const base = PROFILES[difficulty]
  const gap = gapInBeats(base, grid.beat)
  const ctx: Context = { grid, audio, profile: { ...base, minGap: gap, jackGap: Math.max(base.jackGap, gap) }, voices }
  const times = voices.flatMap((v) => v.notes.map((n) => n.t))
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
    notes.push(...notesOf(ctx, [lead, ...fill(ctx, phrase, lead.notes)], phraseNotes))
  }
  const sorted = notes.filter((n) => n.t >= 0 && n.t < audio.duration).toSorted((a, b) => a.t - b.t)
  return { notes: unjack(sorted, ctx.profile.jackGap * grid.beat * 0.98), sections }
}
