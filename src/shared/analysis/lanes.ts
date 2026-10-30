import type { Lane, Quant } from './model'

const LANE_SPREAD: readonly (readonly Lane[])[] = [[1], [0, 2], [0, 1, 2]]
const TERTILES = [1 / 3, 2 / 3]
const MIN_CLUSTER_GAP = 0.035
const RELATIVE_CLUSTER_GAP = 0.12
const MAX_CUTS = 2

export const PARTNER: Readonly<Record<Lane, Lane>> = { 0: 1, 1: 2, 2: 1 }
export const MIRROR: Readonly<Record<Lane, Lane>> = { 0: 2, 1: 0, 2: 0 }
export const ACROSS: Readonly<Record<Lane, Lane>> = { 0: 2, 1: 2, 2: 0 }

export function quantOf(slot: number): Quant {
  if (slot % 4 === 0) return 4
  if (slot % 2 === 0) return 8
  return 16
}

const laneAt = (lanes: readonly Lane[], index: number): Lane => lanes[Math.min(index, lanes.length - 1)] ?? 1

function tertileLanes(sorted: readonly number[]) {
  const cuts = TERTILES.map((q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0)
  return (v: number) => laneAt([0, 1, 2], cuts.filter((c) => v > c).length)
}

export function laneBins(values: readonly number[]): (v: number) => Lane {
  if (values.length === 0) return () => 1
  const sorted = values.toSorted((x, y) => x - y)
  const span = Math.max(1e-6, (sorted.at(-1) ?? 0) - (sorted[0] ?? 0))
  const minGap = Math.max(MIN_CLUSTER_GAP, span * RELATIVE_CLUSTER_GAP)
  const cuts = sorted
    .slice(1)
    .map((v, i) => ({ at: (v + (sorted[i] ?? v)) / 2, size: v - (sorted[i] ?? v) }))
    .filter((g) => g.size >= minGap)
    .toSorted((x, y) => y.size - x.size)
    .slice(0, MAX_CUTS)
    .map((g) => g.at)
  if (cuts.length === 0) return tertileLanes(sorted)
  const lanes = LANE_SPREAD[cuts.length] ?? [0, 1, 2]
  return (v) => laneAt(lanes, cuts.filter((c) => v > c).length)
}
