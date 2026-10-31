import type { ChartIndexEntry, ScoreRow } from '../../shared/types'
import { api } from '../api'
import { isDifficulty } from '../decode'
import { loadSong, playPreview } from '../audio'
import { count, esc, find, findAll, fmtTime, hueOf, onClick, render, report, setHue } from '../dom'
import { listen, nowListening } from '../listen'
import { nav } from '../nav'
import { currentSettings, saveSettings } from '../settings'
import { albums, albumTracks, ARTIST, pickedSong, state } from '../state'
import { detailMarkup, leaderboardMarkup } from './detail'

const RECENT_PLAYS = 8

function songCard(s: ChartIndexEntry, best: ScoreRow | undefined) {
  const number = s.track === null ? '' : `<span class="no">${s.track}</span>`
  const grade = best === undefined ? '' : best.grade
  return `<li><button class="song ${s.slug === state.picked.slug ? 'on' : ''}" data-slug="${esc(s.slug)}" style="--h:${hueOf(s.slug)}">
    <span class="swatch" aria-hidden="true"></span>
    <span class="t">${number}${esc(s.title)}</span><span class="m">${Math.round(s.bpm)} bpm · ${fmtTime(s.duration)}</span>
    <span class="g g-${grade}">${grade}</span></button></li>`
}

const bestOf = (slug: string) => state.me?.bests[`${slug}/${state.picked.difficulty}`]

function albumMarkup(album: string) {
  const tracks = albumTracks(album)
  return `<section class="album"><h2>${esc(album)}<small>${esc(tracks[0]?.artist ?? '')} · ${count(tracks.length, 'track')}</small></h2>
    <ul>${tracks.map((s) => songCard(s, bestOf(s.slug))).join('')}</ul></section>`
}

const INTRO = `<section class="intro">
  <h1 class="title">${ARTIST}<span class="dot">.</span></h1>
  <p class="lede">A life in pieces.<br>Origins.<br>September 24, 2182.</p>
</section>`

function recentMarkup() {
  if (state.me === null) return ''
  const plays = state.me.history.slice(0, RECENT_PLAYS)
  if (plays.length === 0) return '<section class="recent"><h2>Recent plays</h2><p class="muted">Nothing yet. Pick a song.</p></section>'
  const titleOf = (slug: string) => state.songs.find((s) => s.slug === slug)?.title ?? slug
  const rows = plays.map((r) => `<li><span>${esc(titleOf(r.slug))}</span><span>${r.difficulty}</span><span class="g-${r.grade}">${r.grade}</span><span>${(r.accuracy * 100).toFixed(1)}%</span><time>${new Date(r.at).toLocaleString()}</time></li>`)
  return `<section class="recent"><h2>Recent plays</h2><ol>${rows.join('')}</ol></section>`
}

function accountMarkup() {
  if (state.me === null) return '<button id="in" class="ghost">Sign in</button>'
  return `<span class="who">${esc(state.me.name)}</span><button id="out" class="ghost">Sign out</button>`
}

function headerMarkup() {
  return `<header class="top">
    <span class="brand">${ARTIST}<span class="dot">.</span></span>
    <nav><button id="cal" class="ghost">Calibrate · ${currentSettings().offsetMs} ms</button>
    <label class="speed">Speed <input id="speed" type="range" min="0.25" max="3" step="0.05" value="${currentSettings().speed}"><output>${currentSettings().speed}×</output></label>
    <label class="ghost upload">Chart your own track<input id="upload" type="file" accept="audio/*" hidden></label>
    ${accountMarkup()}</nav>
  </header>`
}

function wireAccount() {
  if (state.me === null) {
    onClick('#in', () => { nav().auth() })
    return
  }
  onClick('#out', async () => {
    await api.logout()
    state.me = null
    select()
  })
}

function wireHeader() {
  wireAccount()
  onClick('#cal', () => nav().calibrate())
  const upload = find('#upload', HTMLInputElement)
  upload.addEventListener('change', () => {
    const file = upload.files?.[0]
    if (file !== undefined) void nav().custom(file).catch(report)
  })
  const speed = find('#speed', HTMLInputElement)
  speed.addEventListener('input', () => { find('.speed output', HTMLOutputElement).value = `${speed.value}×` })
  speed.addEventListener('change', () => {
    void saveSpeed(Number(speed.value)).catch(report)
  })
}

async function fillLeaderboard(song: ChartIndexEntry) {
  const rows = await api.leaderboard(song.slug, state.picked.difficulty).catch(() => [])
  const board = document.querySelector('#board')
  if (board !== null) board.innerHTML = leaderboardMarkup(rows, state.me?.name ?? '')
}

export function select(options: { preview?: boolean } = {}) {
  const song = pickedSong()
  state.picked.slug = song.slug
  setHue(hueOf(song.slug))
  render('select', `${headerMarkup()}${INTRO}
    <main class="select"><div class="songs">${albums().map((a) => albumMarkup(a)).join('')}</div>
    <aside class="detail glass" id="detail" style="--h:${hueOf(song.slug)}">${detailMarkup(song)}</aside></main>
    ${recentMarkup()}`)
  wireHeader()
  for (const card of findAll('.song', HTMLButtonElement)) {
    card.addEventListener('click', () => {
      state.picked.slug = card.dataset['slug'] ?? state.picked.slug
      select({ preview: true })
    })
  }
  for (const radio of findAll('[data-difficulty]', HTMLButtonElement)) {
    radio.addEventListener('click', () => {
      const difficulty = radio.dataset['difficulty']
      if (isDifficulty(difficulty)) state.picked.difficulty = difficulty
      select()
    })
  }
  onClick('#go', () => nav().start())
  onClick('#listen', () => { listen(song) })
  void loadSong(song.slug).catch(report)
  void fillLeaderboard(song)
  if (options.preview === true && nowListening() === null) playPreview(song.slug, song.duration)
}

async function saveSpeed(speed: number) {
  await saveSettings({ speed })
}
