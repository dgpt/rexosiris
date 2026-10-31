import type { Note } from './analysis/model'

export const COUNTDOWN_SECONDS = 3

export const afterCountdown = (notes: readonly Note[]): Note[] => notes.filter((n) => n.t >= COUNTDOWN_SECONDS)
