import type { Lane, Note } from '../analysis/model'
import type { VoiceKind, VoiceNote } from './voices'

const DRUM_LANE: Readonly<Partial<Record<VoiceKind, Lane>>> = { kick: 1, snare: 2, hats: 0, perc: 0 }
function homePitch(notes: readonly VoiceNote[]) {
  const counts = Map.groupBy(notes, (n) => n.pitch)
  const sorted = notes.map((n) => n.pitch).toSorted((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const ranked = [...counts].toSorted((a, b) => b[1].length - a[1].length || Math.abs(a[0] - median) - Math.abs(b[0] - median))
  return ranked[0]?.[0] ?? median
}

export function pitchLanes(notes: readonly VoiceNote[], kind: VoiceKind): (note: VoiceNote) => Lane {
  const drum = DRUM_LANE[kind]
  if (drum !== undefined) return () => drum
  const home = homePitch(notes)
  return (note) => {
    if (note.pitch < home) return 0
    return note.pitch > home ? 2 : 1
  }
}

const AWAY: Readonly<Record<Lane, readonly Lane[]>> = { 0: [1, 2], 1: [2, 0], 2: [1, 0] }

export function unjack(notes: readonly Note[], jackGapSeconds: number): Note[] {
  const out: Note[] = []
  const busyUntil = [-Infinity, -Infinity, -Infinity]
  const lastAt = [-Infinity, -Infinity, -Infinity]
  for (const note of notes) {
    const free = (lane: Lane) => (busyUntil[lane] ?? 0) < note.t && note.t - (lastAt[lane] ?? 0) >= jackGapSeconds
    const lane = free(note.lane) ? note.lane : AWAY[note.lane].find((l) => free(l))
    if (lane === undefined) continue
    lastAt[lane] = note.t
    busyUntil[lane] = note.t + (note.len ?? 0)
    out.push(lane === note.lane ? note : { ...note, lane })
  }
  return out
}
