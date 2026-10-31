import type { Lane } from '../../shared/analyze'

export type Struck = 'hit' | 'miss' | 'released'
export type LaneFlash = { readonly color: string; readonly kind: Struck; readonly age: number }

export const FLASH_MS: Readonly<Record<Struck, number>> = { hit: 180, miss: 320, released: 260 }

export class LaneFlashes {
  private readonly last: ({ readonly color: string; readonly kind: Struck; readonly at: number } | null)[] = [null, null, null]

  strike(lane: Lane, kind: Struck, color: string) {
    this.last[lane] = { color, kind, at: performance.now() }
  }

  of(lane: Lane): LaneFlash | null {
    const flash = this.last[lane]
    if (flash === null || flash === undefined) return null
    const age = performance.now() - flash.at
    return age < FLASH_MS[flash.kind] ? { color: flash.color, kind: flash.kind, age } : null
  }
}
