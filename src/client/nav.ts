import type { SongChart } from '../shared/types'

export type Screens = {
  readonly auth: (error?: string) => void
  readonly select: (options?: { preview?: boolean }) => void
  readonly play: (song: SongChart, buffer: AudioBuffer, ranked: boolean) => Promise<void>
  readonly start: () => Promise<void>
  readonly custom: (file: File) => Promise<void>
  readonly calibrate: () => Promise<void>
}

let screens: Screens | null = null

export const registerScreens = (all: Screens) => { screens = all }

export function nav(): Screens {
  if (screens === null) throw new Error('Screens are not registered yet')
  return screens
}
