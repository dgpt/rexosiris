import type { FlpProject } from './project'

export type ProjectNote = {
  readonly t: number
  readonly length: number
  readonly channel: string
  readonly key: number
  readonly velocity: number
}

export function notesOf(project: FlpProject): ProjectNote[] {
  const secondsPerTick = 60 / project.tempo / project.ppq
  const notes: ProjectNote[] = []
  for (const clip of project.clips) {
    const pattern = project.patterns.get(clip.pattern)
    if (clip.muted || project.mutedTracks.has(clip.track) || pattern === undefined) continue
    for (const note of pattern.notes) {
      const channel = project.channels.get(note.channel)
      const inside = note.position >= clip.offset && note.position < clip.offset + clip.length
      if (channel === undefined || !channel.enabled || !inside) continue
      notes.push({
        t: (clip.position + note.position - clip.offset) * secondsPerTick,
        length: Math.min(note.length, clip.offset + clip.length - note.position) * secondsPerTick,
        channel: channel.name,
        key: note.key,
        velocity: note.velocity,
      })
    }
  }
  return notes.toSorted((a, b) => a.t - b.t)
}

export type ProjectGrid = { readonly beat: number; readonly origin: number }

const FEEL_BPM = { min: 75, max: 150 }

export function placed(project: FlpProject, link: { readonly scale: number; readonly offset: number }) {
  let beat = (60 / project.tempo) * link.scale
  while (60 / beat > FEEL_BPM.max) beat *= 2
  while (60 / beat < FEEL_BPM.min) beat /= 2
  const notes = notesOf(project).map((n): ProjectNote => ({ t: n.t * link.scale + link.offset, length: n.length * link.scale, channel: n.channel, key: n.key, velocity: n.velocity }))
  const grid: ProjectGrid = { beat, origin: link.offset }
  return { notes, grid }
}
