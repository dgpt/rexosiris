export type ScoreNote = { readonly t: number; readonly length: number; readonly channel: string; readonly key: number; readonly velocity: number }
export type VoiceKind = 'kick' | 'snare' | 'hats' | 'perc' | 'bass' | 'lead' | 'chords'
export type VoiceNote = { readonly t: number; readonly length: number; readonly pitch: number; readonly velocity: number }
export type Voice = { readonly name: string; readonly kind: VoiceKind; readonly notes: readonly VoiceNote[] }

const SAME_ONSET_SECONDS = 0.012
const CHORD_POLYPHONY = 2.2
const BASS_MEAN_KEY = 50
const DRUM_CHANNEL = /drum|kit|perc|fpc|beat/i
const BASS_CHANNEL = /bass|bazz|808|sub/i
const LEAD_CHANNEL = /lead|melod|vox|vocal|synth/i

const DRUM_KEYS: readonly { readonly kind: VoiceKind; readonly keys: ReadonlySet<number> }[] = [
  { kind: 'kick', keys: new Set([35, 36]) },
  { kind: 'snare', keys: new Set([37, 38, 39, 40]) },
  { kind: 'hats', keys: new Set([42, 44, 46]) },
]

const drumKind = (key: number): VoiceKind => DRUM_KEYS.find((d) => d.keys.has(key))?.kind ?? 'perc'

function onsetGroups(notes: readonly ScoreNote[]): ScoreNote[][] {
  const groups: ScoreNote[][] = []
  for (const note of notes.toSorted((a, b) => a.t - b.t)) {
    const last = groups.at(-1)
    const head = last?.[0]
    if (last !== undefined && head !== undefined && note.t - head.t < SAME_ONSET_SECONDS) last.push(note)
    else groups.push([note])
  }
  return groups
}

function melodicKind(name: string, groups: readonly (readonly ScoreNote[])[]): VoiceKind {
  const polyphony = groups.reduce((n, g) => n + g.length, 0) / Math.max(1, groups.length)
  const meanKey = groups.reduce((n, g) => n + g.reduce((k, x) => k + x.key, 0) / g.length, 0) / Math.max(1, groups.length)
  if (BASS_CHANNEL.test(name)) return 'bass'
  if (LEAD_CHANNEL.test(name)) return 'lead'
  if (polyphony >= CHORD_POLYPHONY) return 'chords'
  return meanKey < BASS_MEAN_KEY ? 'bass' : 'lead'
}

function line(group: readonly ScoreNote[], kind: VoiceKind): VoiceNote {
  const pick = group.reduce((best, n) => (kind === 'bass' ? n.key < best.key : n.key > best.key) ? n : best)
  return { t: pick.t, length: Math.max(...group.map((n) => n.length)), pitch: pick.key, velocity: Math.max(...group.map((n) => n.velocity)) }
}

function drumVoices(name: string, notes: readonly ScoreNote[]): Voice[] {
  const byKind = Map.groupBy(notes, (n) => drumKind(n.key))
  return [...byKind].map(([kind, hits]) => ({ name: `${name} ${kind}`, kind, notes: onsetGroups(hits).map((g) => line(g, kind)) }))
}

export function voicesOf(notes: readonly ScoreNote[]): Voice[] {
  const byChannel = Map.groupBy(notes, (n) => n.channel)
  return [...byChannel].flatMap(([name, channelNotes]) => {
    if (DRUM_CHANNEL.test(name)) return drumVoices(name, channelNotes)
    const groups = onsetGroups(channelNotes)
    const kind = melodicKind(name, groups)
    return [{ name, kind, notes: groups.map((g) => line(g, kind)) }]
  })
}
