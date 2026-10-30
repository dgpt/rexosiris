import type { Difficulty } from '../shared/analyze'
import type { ChartIndexEntry, ScoreSubmission, SongChart } from '../shared/types'
import type { Me } from './decode'

export const ARTIST = 'REXOSIRIS'

export type Picked = { slug: string; difficulty: Difficulty }
export type CustomTrack = { readonly song: SongChart; readonly buffer: AudioBuffer }

export const state: {
  me: Me | null
  songs: readonly ChartIndexEntry[]
  picked: Picked
  custom: CustomTrack | null
  pending: ScoreSubmission | null
} = { me: null, songs: [], picked: { slug: '', difficulty: 'normal' }, custom: null, pending: null }

export function signedIn(): Me {
  if (state.me === null) throw new Error('Sign in first')
  return state.me
}

export const albums = () => [...new Set(state.songs.map((s) => s.album))]

export const albumTracks = (album: string) =>
  state.songs.filter((s) => s.album === album).toSorted((a, b) => (a.track ?? Infinity) - (b.track ?? Infinity))

export const playOrder = () => albums().flatMap((album) => albumTracks(album))

export function pickedSong(): ChartIndexEntry {
  const song = state.songs.find((s) => s.slug === state.picked.slug) ?? playOrder()[0]
  if (song === undefined) throw new Error('No songs are loaded')
  return song
}
