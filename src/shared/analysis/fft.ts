import { sample } from './model'

function bitReverse(re: Float64Array, im: Float64Array) {
  let j = 0
  for (let i = 1; i < re.length; i++) {
    let bit = re.length >> 1
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = sample(re, i)
      const m = sample(im, i)
      re[i] = sample(re, j)
      im[i] = sample(im, j)
      re[j] = r
      im[j] = m
    }
  }
}

function butterflies(re: Float64Array, im: Float64Array, len: number) {
  const angle = (-2 * Math.PI) / len
  const half = len / 2
  for (let start = 0; start < re.length; start += len) {
    for (let k = 0; k < half; k++) {
      const cr = Math.cos(angle * k)
      const ci = Math.sin(angle * k)
      const a = start + k
      const b = a + half
      const tr = sample(re, b) * cr - sample(im, b) * ci
      const ti = sample(re, b) * ci + sample(im, b) * cr
      re[b] = sample(re, a) - tr
      im[b] = sample(im, a) - ti
      re[a] = sample(re, a) + tr
      im[a] = sample(im, a) + ti
    }
  }
}

export function fft(re: Float64Array, im: Float64Array) {
  bitReverse(re, im)
  for (let len = 2; len <= re.length; len <<= 1) butterflies(re, im, len)
}

export const hann = (size: number) => Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
