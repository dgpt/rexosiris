import type { ChartIndexEntry } from '../shared/types'
import { stopPreview } from './audio'
import { esc, fmtTime } from './dom'
import { playOrder } from './state'

let player: HTMLAudioElement | null = null
let playing: ChartIndexEntry | null = null

function bar(): HTMLElement {
  const existing = document.querySelector('#player')
  if (existing instanceof HTMLElement) return existing
  const el = document.createElement('section')
  el.id = 'player'
  el.className = 'player glass'
  el.setAttribute('aria-label', 'Now playing')
  document.body.append(el)
  return el
}

function markup(song: ChartIndexEntry) {
  return `<button class="pp" aria-label="Pause">❚❚</button>
    <div class="np"><b>${esc(song.title)}</b><span>${esc(song.artist)} · ${esc(song.album)}</span></div>
    <input class="seek" type="range" min="0" max="${Math.round(song.duration)}" value="0" step="1" aria-label="Position">
    <span class="clock">0:00 / ${fmtTime(song.duration)}</span>
    <button class="close ghost" aria-label="Stop listening">×</button>`
}

function wire(el: HTMLElement, audio: HTMLAudioElement, song: ChartIndexEntry) {
  const pp = el.querySelector('.pp')
  const seek = el.querySelector('.seek')
  const clock = el.querySelector('.clock')
  if (!(pp instanceof HTMLButtonElement) || !(seek instanceof HTMLInputElement) || !(clock instanceof HTMLElement)) return
  pp.addEventListener('click', () => {
    if (audio.paused) void audio.play()
    else audio.pause()
  })
  seek.addEventListener('input', () => { audio.currentTime = Number(seek.value) })
  audio.addEventListener('play', () => { pp.textContent = '❚❚'; pp.setAttribute('aria-label', 'Pause') })
  audio.addEventListener('pause', () => { pp.textContent = '▶'; pp.setAttribute('aria-label', 'Play') })
  audio.addEventListener('timeupdate', () => {
    seek.value = String(Math.floor(audio.currentTime))
    clock.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(song.duration)}`
  })
  audio.addEventListener('ended', () => { listenNext(song) })
  el.querySelector('.close')?.addEventListener('click', () => { stopListening() })
}

function listenNext(after: ChartIndexEntry) {
  const order = playOrder()
  const next = order[order.findIndex((s) => s.slug === after.slug) + 1]
  if (next === undefined) stopListening()
  else listen(next)
}

export function listen(song: ChartIndexEntry) {
  stopPreview()
  player?.pause()
  const audio = new Audio(`/audio/${song.slug}.mp3`)
  player = audio
  playing = song
  const el = bar()
  el.innerHTML = markup(song)
  el.hidden = false
  document.body.classList.add('listening')
  wire(el, audio, song)
  audio.play().catch(() => { stopListening() })
}

export function stopListening() {
  player?.pause()
  player = null
  playing = null
  bar().hidden = true
  document.body.classList.remove('listening')
}

export const nowListening = () => (player !== null && !player.paused ? playing : null)
