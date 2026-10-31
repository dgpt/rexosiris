import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import index from '../../public/charts/index.json'
import { isSongChart } from '../../src/client/decode'
import { DIFFICULTIES } from '../../src/shared/analyze'
import { COUNTDOWN_SECONDS } from '../../src/shared/countdown'
import type { SongChart } from '../../src/shared/types'

function stored(slug: string): SongChart {
  const parsed: unknown = JSON.parse(readFileSync(`public/charts/${slug}.json`, 'utf8'))
  if (!isSongChart(parsed)) throw new Error(`public/charts/${slug}.json is not a chart`)
  return parsed
}

const shipped = index.flatMap((song) => DIFFICULTIES.map((d) => ({ slug: song.slug, d, listed: song.notes[d], notes: stored(song.slug).charts[d] })))

describe('the charts that ship', () => {
  test('no chart asks for a note during the countdown', () => {
    const early = shipped.filter(({ notes }) => notes.some((n) => n.t < COUNTDOWN_SECONDS)).map(({ slug, d }) => `${slug} ${d}`)
    expect(early).toEqual([])
  })

  test('the index counts the notes each chart really has, which is what the server checks a run against', () => {
    expect(shipped.filter(({ listed, notes }) => listed !== notes.length).map(({ slug, d }) => `${slug} ${d}`)).toEqual([])
  })

  test('an album chart does not claim to follow an instrument the model never followed', () => {
    expect(index.filter((song) => stored(song.slug).sections !== undefined).map((song) => song.slug)).toEqual([])
  })
})
