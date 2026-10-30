import type { Lane } from '../../shared/analyze'
import { type Counts, type Judgment, WINDOWS_MS } from '../../shared/types'

export const KEY_LANES: Readonly<Record<string, Lane>> = {
  ArrowLeft: 0,
  ArrowDown: 1,
  ArrowUp: 2,
  ArrowRight: 3,
  KeyD: 0,
  KeyF: 1,
  KeyJ: 2,
  KeyK: 3,
}

export const MISS_AFTER_SECONDS = WINDOWS_MS.good / 1000
export const FEVER_COMBO = 30
const HEALTH_DELTA: Readonly<Record<Judgment, number>> = { perfect: 0.02, great: 0.012, good: 0.004, miss: -0.07 }
const HOLD_OK_HEALTH = 0.015
const HOLD_NG_HEALTH = -0.05

export function judge(deltaMs: number): Judgment | null {
  const distance = Math.abs(deltaMs)
  if (distance <= WINDOWS_MS.perfect) return 'perfect'
  if (distance <= WINDOWS_MS.great) return 'great'
  if (distance <= WINDOWS_MS.good) return 'good'
  return null
}

export type Offset = { readonly t: number; readonly ms: number | null }

export class Scorecard {
  readonly counts: Counts = { perfect: 0, great: 0, good: 0, miss: 0 }
  readonly offsets: Offset[] = []
  readonly holds = { ok: 0, ng: 0 }
  combo = 0
  maxCombo = 0
  health = 0.6
  cleared = true

  record(judgment: Judgment, noteTime: number, ms: number | null) {
    this.counts[judgment]++
    this.offsets.push({ t: noteTime, ms })
    this.combo = judgment === 'miss' ? 0 : this.combo + 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.heal(HEALTH_DELTA[judgment])
  }

  hold(ok: boolean) {
    if (ok) this.holds.ok++
    else {
      this.holds.ng++
      this.combo = 0
    }
    this.heal(ok ? HOLD_OK_HEALTH : HOLD_NG_HEALTH)
  }

  get fever() {
    return this.combo >= FEVER_COMBO
  }

  get accuracy() {
    const judged = this.counts.perfect + this.counts.great + this.counts.good + this.counts.miss
    if (judged === 0) return 1
    return (this.counts.perfect + this.counts.great * 0.7 + this.counts.good * 0.4) / judged
  }

  private heal(delta: number) {
    this.health = Math.min(1, Math.max(0, this.health + delta))
    if (this.health === 0) this.cleared = false
  }
}
