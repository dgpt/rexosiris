export type FlpEvent = { readonly id: number; readonly value: number; readonly data: Uint8Array }

export type FlpFile = { readonly ppq: number; readonly events: readonly FlpEvent[] }

const BYTE_MAX = 64
const WORD_MAX = 128
const DWORD_MAX = 192
const THREE_BYTE_IDS = new Set([172])
const EMPTY = new Uint8Array(0)

function chunkAt(view: DataView, at: number, tag: string) {
  const found = String.fromCodePoint(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))
  if (found !== tag) throw new Error(`not an FL Studio project: expected ${tag} at byte ${at}, found ${JSON.stringify(found)}`)
  return view.getUint32(at + 4, true)
}

function varint(bytes: Uint8Array, at: number) {
  let value = 0
  let shift = 0
  let next = at
  for (;;) {
    const byte = bytes[next] ?? 0
    next += 1
    value += (byte & 0x7f) * 2 ** shift
    shift += 7
    if (byte < 0x80) return { value, next }
  }
}

function fixed(view: DataView, id: number, at: number): FlpEvent & { readonly next: number } {
  if (THREE_BYTE_IDS.has(id)) return { id, value: view.getUint16(at, true) + view.getUint8(at + 2) * 0x1_00_00, data: EMPTY, next: at + 3 }
  if (id < BYTE_MAX) return { id, value: view.getUint8(at), data: EMPTY, next: at + 1 }
  if (id < WORD_MAX) return { id, value: view.getUint16(at, true), data: EMPTY, next: at + 2 }
  return { id, value: view.getUint32(at, true), data: EMPTY, next: at + 4 }
}

function* walk(bytes: Uint8Array, view: DataView, from: number, to: number): Generator<FlpEvent & { readonly end: number }> {
  let at = from
  while (at < to) {
    const id = view.getUint8(at)
    if (id < DWORD_MAX) {
      const event = fixed(view, id, at + 1)
      at = event.next
      yield { id, value: event.value, data: EMPTY, end: at }
    } else {
      const size = varint(bytes, at + 1)
      at = size.next + size.value
      yield { id, value: size.value, data: bytes.subarray(size.next, at), end: at }
    }
  }
}

function layout(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = chunkAt(view, 0, 'FLhd')
  const dataAt = 8 + headerLength
  return { view, ppq: view.getUint16(12, true), from: dataAt + 8, to: dataAt + 8 + chunkAt(view, dataAt, 'FLdt') }
}

export function readFlp(bytes: Uint8Array): FlpFile {
  const { view, ppq, from, to } = layout(bytes)
  const events: FlpEvent[] = []
  let end = from
  for (const event of walk(bytes, view, from, to)) {
    events.push({ id: event.id, value: event.value, data: event.data })
    end = event.end
  }
  if (end !== to) throw new Error(`event stream ended at byte ${end}, but the data chunk ends at ${to}`)
  return { ppq, events }
}

export function peekEvent(bytes: Uint8Array, id: number): FlpEvent | null {
  const { view, from } = layout(bytes)
  try {
    for (const event of walk(bytes, view, from, bytes.length)) if (event.id === id) return event
  } catch {
    return null
  }
  return null
}

export function beforeNul(text: string) {
  const end = text.indexOf('\0')
  return end === -1 ? text : text.slice(0, end)
}

export const utf16 = (data: Uint8Array) => beforeNul(new TextDecoder('utf-16le').decode(data))
