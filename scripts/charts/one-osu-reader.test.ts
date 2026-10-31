import { expect, test } from 'bun:test'
import { Glob } from 'bun'

const READER = 'scripts/charts/osu.ts'
const FORMAT_MARKERS = ['[HitObjects]', '[TimingPoints]']

test(`only ${READER} reads or writes the .osu format`, async () => {
  const files = await Array.fromAsync(new Glob('{src,scripts,netlify}/**/*.{ts,mts}').scan('.'))
  const readers = await Promise.all(
    files
      .filter((file) => file !== READER && !file.endsWith('.test.ts'))
      .map(async (file) => ({ file, text: await Bun.file(file).text() })),
  )
  expect(readers.filter(({ text }) => FORMAT_MARKERS.some((marker) => text.includes(marker))).map(({ file }) => file)).toEqual([])
})
