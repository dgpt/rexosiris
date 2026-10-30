import { beforeNul, readFlp, utf16, type FlpEvent } from './events'

export const EVENT = {
  channelEnabled: 0,
  channelNew: 64,
  patternNew: 65,
  fineTempo: 156,
  patternName: 193,
  version: 199,
  defaultPluginName: 201,
  pluginName: 203,
  patternNotes: 224,
  playlistItems: 233,
  mixerInsertFlags: 236,
  trackData: 238,
} as const

const NOTE_BYTES = 24
const PLAYLIST_ITEM_BYTES = 80
const PATTERN_BASE = 20_480
const PLAYLIST_TRACKS = 500
const MUTED_ITEM = 0x10_00
const TRACK_ENABLED_AT = 12

export type FlpNote = { readonly position: number; readonly length: number; readonly key: number; readonly channel: number; readonly velocity: number }
export type FlpChannel = { readonly id: number; readonly name: string; readonly enabled: boolean }
export type FlpPattern = { readonly id: number; readonly name: string; readonly notes: readonly FlpNote[] }
export type FlpClip = { readonly position: number; readonly length: number; readonly pattern: number; readonly track: number; readonly offset: number; readonly muted: boolean }

export type FlpProject = {
  readonly version: string
  readonly ppq: number
  readonly tempo: number
  readonly channels: ReadonlyMap<number, FlpChannel>
  readonly patterns: ReadonlyMap<number, FlpPattern>
  readonly clips: readonly FlpClip[]
  readonly mutedTracks: ReadonlySet<number>
}

const viewOf = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength)

function notesOf(data: Uint8Array): FlpNote[] {
  const view = viewOf(data)
  const notes: FlpNote[] = []
  for (let at = 0; at + NOTE_BYTES <= data.length; at += NOTE_BYTES) {
    notes.push({
      position: view.getUint32(at, true),
      channel: view.getUint16(at + 6, true),
      length: view.getUint32(at + 8, true),
      key: view.getUint16(at + 12, true),
      velocity: view.getUint8(at + 21),
    })
  }
  return notes
}

function clipsOf(data: Uint8Array): FlpClip[] {
  const view = viewOf(data)
  const clips: FlpClip[] = []
  for (let at = 0; at + PLAYLIST_ITEM_BYTES <= data.length; at += PLAYLIST_ITEM_BYTES) {
    const index = view.getUint16(at + 6, true)
    if (index <= PATTERN_BASE) continue
    const offset = view.getInt32(at + 24, true)
    clips.push({
      position: view.getUint32(at, true),
      length: view.getUint32(at + 8, true),
      pattern: index - PATTERN_BASE,
      track: PLAYLIST_TRACKS - 1 - view.getUint16(at + 12, true),
      offset: Math.max(0, offset),
      muted: (view.getUint16(at + 18, true) & MUTED_ITEM) !== 0,
    })
  }
  return clips
}

type Draft = { channel: { id: number; name: string; enabled: boolean } | null; pattern: number | null }

class Builder {
  readonly channels = new Map<number, FlpChannel>()
  readonly patternNames = new Map<number, string>()
  readonly patternNotes = new Map<number, FlpNote[]>()
  readonly mutedTracks = new Set<number>()
  clips: FlpClip[] = []
  tempo = 0
  version = ''
  private track = 0
  private readonly draft: Draft = { channel: null, pattern: null }

  take(event: FlpEvent) {
    const handler = this.handlers[event.id]
    if (handler !== undefined) handler(event)
  }

  finish() {
    this.closeChannel()
  }

  private closeChannel() {
    if (this.draft.channel !== null) this.channels.set(this.draft.channel.id, { ...this.draft.channel })
    this.draft.channel = null
  }

  private readonly handlers: Readonly<Record<number, (event: FlpEvent) => void>> = {
    [EVENT.version]: (e) => { this.version = beforeNul(new TextDecoder().decode(e.data)) },
    [EVENT.fineTempo]: (e) => { this.tempo = e.value / 1000 },
    [EVENT.channelNew]: (e) => {
      this.closeChannel()
      this.draft.channel = { id: e.value, name: '', enabled: true }
    },
    [EVENT.channelEnabled]: (e) => { if (this.draft.channel !== null) this.draft.channel.enabled = e.value !== 0 },
    [EVENT.defaultPluginName]: (e) => { if (this.draft.channel?.name === '') this.draft.channel.name = utf16(e.data) },
    [EVENT.pluginName]: (e) => { if (this.draft.channel !== null) this.draft.channel.name = utf16(e.data) },
    [EVENT.mixerInsertFlags]: () => { this.closeChannel() },
    [EVENT.patternNew]: (e) => { this.draft.pattern = e.value },
    [EVENT.patternName]: (e) => { if (this.draft.pattern !== null) this.patternNames.set(this.draft.pattern, utf16(e.data)) },
    [EVENT.patternNotes]: (e) => { if (this.draft.pattern !== null) this.patternNotes.set(this.draft.pattern, notesOf(e.data)) },
    [EVENT.playlistItems]: (e) => { if (this.clips.length === 0) this.clips = clipsOf(e.data) },
    [EVENT.trackData]: (e) => {
      if (e.data.length > TRACK_ENABLED_AT && e.data[TRACK_ENABLED_AT] === 0) this.mutedTracks.add(this.track)
      this.track += 1
    },
  }
}

export function readProject(bytes: Uint8Array): FlpProject {
  const file = readFlp(bytes)
  const builder = new Builder()
  for (const event of file.events) builder.take(event)
  builder.finish()
  const ids = new Set([...builder.patternNames.keys(), ...builder.patternNotes.keys()])
  const patterns = new Map([...ids].map((id) => [id, { id, name: builder.patternNames.get(id) ?? `pattern ${id}`, notes: builder.patternNotes.get(id) ?? [] }]))
  return { version: builder.version, ppq: file.ppq, tempo: builder.tempo, channels: builder.channels, patterns, clips: builder.clips, mutedTracks: builder.mutedTracks }
}
