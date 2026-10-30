import { DIFFICULTIES, type Difficulty } from '../shared/analyze'
import { JUDGMENTS, scoreOf, type ChartIndexEntry, type SongChart } from '../shared/types'
import { api, type Me } from './api'
import { play, type GameResult } from './game'
import { calibrate } from './calibrate'
import { chartFromFile } from './custom'

const app = document.getElementById('app')!
let me: Me | null = null
let songs: ChartIndexEntry[] = []
let ctx: AudioContext | null = null
const audio = new Map<string, Promise<AudioBuffer>>()
const ALBUM_BLURB: Record<string, string> = {
  'what is real': 'ten tracks',
  e: 'ten tracks',
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const audioCtx = () => (ctx ??= new AudioContext())
export const hueOf = (slug: string) => [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
function loadAudio(slug: string) {
  if (!audio.has(slug)) audio.set(slug, fetch(`/audio/${slug}.mp3`).then((r) => r.arrayBuffer()).then((b) => audioCtx().decodeAudioData(b)))
  return audio.get(slug)!
}

let preview: HTMLAudioElement | null = null
function playPreview(slug: string, duration: number) {
  stopPreview()
  const a = new Audio(`/audio/${slug}.mp3`)
  a.volume = 0
  a.currentTime = Math.max(0, duration * 0.38)
  preview = a
  a.play().catch(() => {})
  const fade = setInterval(() => { if (preview !== a) return clearInterval(fade); a.volume = Math.min(0.6, a.volume + 0.06); if (a.volume >= 0.6) clearInterval(fade) }, 60)
}
function stopPreview() { if (preview) { preview.pause(); preview = null } }

async function boot() {
  songs = await (await fetch('/charts/index.json')).json()
  me = (await fetch('/api/session').then((r) => r.json()).catch(() => null))?.signedIn ? await api.me() : null
  me ? select() : auth()
}

function auth(error = '') {
  stopPreview()
  document.body.dataset.screen = 'auth'
  app.innerHTML = `
    <section class="hero">
      <div class="logo" aria-hidden="true"><span>←</span><span>↓</span><span>↑</span><span>→</span></div>
      <h1 class="title">what is real<span class="dot">.</span></h1>
      <p class="lede">A rhythm game where every track is mine. Two albums, twenty songs, and charts that listen to the music and follow the kick, the snare, the lead, whatever is driving each phrase.</p>
      <form id="f" class="card glass">
        <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20"></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
        <p class="error" role="alert">${esc(error)}</p>
        <div class="row"><button name="mode" value="login">Sign in</button><button name="mode" value="signup" class="ghost">Create account</button></div>
      </form>
    </section>`
  const form = document.getElementById('f') as HTMLFormElement
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const mode = ((e as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? 'login'
    const data = new FormData(form)
    try {
      const u = String(data.get('username')), p = String(data.get('password'))
      await (mode === 'signup' ? api.signup(u, p) : api.login(u, p))
      me = await api.me()
      select()
    } catch (err) { auth((err as Error).message) }
  })
}

let chosen: { slug: string; difficulty: Difficulty } = { slug: '', difficulty: 'normal' }

function select(withPreview = false) {
  if (!me) return auth()
  document.body.dataset.screen = 'select'
  if (!chosen.slug) chosen.slug = songs.find((s) => s.album === 'what is real')?.slug ?? songs[0]!.slug
  const albums = ['what is real', 'e'].filter((al) => songs.some((s) => s.album === al))
  const cur = songs.find((s) => s.slug === chosen.slug)!
  document.documentElement.style.setProperty('--hue', String(hueOf(cur.slug)))
  app.innerHTML = `
    <header class="top">
      <h1 class="brand">what is real<span class="dot">.</span></h1>
      <nav><span class="who">${esc(me.name)}</span><button id="cal" class="ghost">Calibrate · ${me.settings.offsetMs} ms</button>
      <label class="speed">Speed <input id="speed" type="range" min="0.5" max="3" step="0.1" value="${me.settings.speed}"><output>${me.settings.speed}×</output></label>
      <label class="ghost upload">Chart your own track<input id="upload" type="file" accept="audio/*" hidden></label>
      <button id="out" class="ghost">Sign out</button></nav>
    </header>
    <main class="select">
      <div class="songs">${albums.map((al) => `
        <section class="album"><h2>${esc(al)}<small>${ALBUM_BLURB[al] ?? ''}</small></h2>
        <ul>${songs.filter((s) => s.album === al).map((s) => {
          const best = me!.bests[`${s.slug}/${chosen.difficulty}`]
          return `<li><button class="song ${s.slug === chosen.slug ? 'on' : ''}" data-slug="${s.slug}" style="--h:${hueOf(s.slug)}">
            <span class="swatch" aria-hidden="true"></span>
            <span class="t">${esc(s.title)}</span><span class="m">${Math.round(s.bpm)} bpm · ${fmtTime(s.duration)}</span>
            <span class="g ${best ? `g-${best.grade}` : ''}">${best ? best.grade : ''}</span></button></li>`
        }).join('')}</ul></section>`).join('')}
      </div>
      <aside class="detail glass" id="detail"></aside>
    </main>
    <section class="recent"><h2>Recent plays</h2>${me.history.length ? `<ol>${me.history.slice(0, 8).map((r) => `<li><span>${esc(songs.find((x) => x.slug === r.slug)?.title ?? r.slug)}</span><span>${r.difficulty}</span><span class="g-${r.grade}">${r.grade}</span><span>${(r.accuracy * 100).toFixed(1)}%</span><time>${new Date(r.at).toLocaleString()}</time></li>`).join('')}</ol>` : '<p class="muted">Nothing yet. Pick a song.</p>'}</section>`
  document.getElementById('out')!.onclick = async () => { await api.logout(); me = null; auth() }
  document.getElementById('cal')!.onclick = () => runCalibration()
  ;(document.getElementById('upload') as HTMLInputElement).onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) custom(f) }
  const speed = document.getElementById('speed') as HTMLInputElement
  speed.oninput = () => (speed.nextElementSibling!.textContent = `${speed.value}×`)
  speed.onchange = async () => { me!.settings = await api.settings({ speed: Number(speed.value) }) }
  app.querySelectorAll<HTMLButtonElement>('.song').forEach((b) => (b.onclick = () => { chosen.slug = b.dataset.slug!; select(true) }))
  detail()
  if (withPreview) playPreview(cur.slug, cur.duration)
}

async function detail() {
  const s = songs.find((x) => x.slug === chosen.slug)!
  const el = document.getElementById('detail')!
  const best = me!.bests[`${s.slug}/${chosen.difficulty}`]
  el.style.setProperty('--h', String(hueOf(s.slug)))
  el.innerHTML = `
    <div class="cover" aria-hidden="true"><div class="disc"></div></div>
    <h2>${esc(s.title)}</h2>
    <p class="meta">${esc(s.album)} · ${Math.round(s.bpm)} bpm · ${fmtTime(s.duration)}</p>
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `
      <button role="radio" aria-checked="${d === chosen.difficulty}" data-d="${d}" class="${d === chosen.difficulty ? 'on' : ''}">${d}<small>${s.notes[d]} notes · ${(s.notes[d] / s.duration).toFixed(1)}/s</small></button>`).join('')}
    </div>
    <p class="best">${best ? `Your best <b class="g-${best.grade}">${best.grade}</b> ${best.score.toLocaleString()} · combo ${best.maxCombo}` : 'Not played on this difficulty yet.'}</p>
    <button id="go" class="play">Play</button>
    <p class="keys">Song select: <kbd>↑</kbd><kbd>↓</kbd> songs · <kbd>←</kbd><kbd>→</kbd> difficulty · <kbd>Enter</kbd> play<br>In game: <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd> or <kbd>D</kbd><kbd>F</kbd><kbd>J</kbd><kbd>K</kbd> · tap lanes on a phone · <kbd>Esc</kbd> quits</p>
    <h3>Leaderboard</h3><ol class="board" id="board"><li class="muted">Loading…</li></ol>`
  el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => (b.onclick = () => { chosen.difficulty = b.dataset.d as Difficulty; select() }))
  document.getElementById('go')!.onclick = () => start()
  loadAudio(s.slug)
  const rows = await api.leaderboard(s.slug, chosen.difficulty).catch(() => [])
  const board = document.getElementById('board')
  if (board) board.innerHTML = rows.length ? rows.slice(0, 10).map((r) => `<li class="${r.user === me!.name ? 'me' : ''}"><span>${esc(r.user)}</span><span class="g-${r.grade}">${r.grade}</span><span>${r.score.toLocaleString()}</span></li>`).join('') : '<li class="muted">No scores yet. Be first.</li>'
}

async function start() {
  stopPreview()
  const s = songs.find((x) => x.slug === chosen.slug)!
  document.body.dataset.screen = 'loading'
  app.innerHTML = `<div class="loading"><div class="spinner"></div>Loading ${esc(s.title)}…</div>`
  const [chartData, buffer] = await Promise.all([fetch(`/charts/${s.slug}.json`).then((r) => r.json() as Promise<SongChart>), loadAudio(s.slug)])
  return run(chartData, buffer, true)
}

let lastCustom: { song: SongChart; buffer: AudioBuffer } | null = null
async function custom(file: File) {
  stopPreview()
  document.body.dataset.screen = 'loading'
  app.innerHTML = `<div class="loading"><div class="spinner"></div><span id="stagemsg">Reading ${esc(file.name)}…</span></div>`
  try {
    lastCustom = await chartFromFile(audioCtx(), file, (m) => (document.getElementById('stagemsg')!.textContent = m))
  } catch (err) {
    app.innerHTML = `<section class="card glass"><h2>Couldn't chart that file</h2><p class="muted">${esc((err as Error).message || 'The browser could not decode it.')}</p><div class="row"><button id="back">Back</button></div></section>`
    document.getElementById('back')!.onclick = () => select()
    return
  }
  const { song } = lastCustom
  const voices = [...new Set((song.sections ?? []).map((x) => x.voice))]
  document.body.dataset.screen = 'select'
  app.innerHTML = `<section class="card glass"><h2>${esc(song.title)}</h2>
    <p class="meta">${song.bpm.toFixed(1)} bpm · ${fmtTime(song.duration)} · charted in your browser by the same analyzer that charted my albums</p>
    ${voices.length ? `<p class="meta">It follows: ${voices.map((v) => `<span class="tag">${v}</span>`).join(' ')}</p>` : ''}
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `<button role="radio" aria-checked="${d === chosen.difficulty}" data-d="${d}" class="${d === chosen.difficulty ? 'on' : ''}">${d}<small>${song.charts[d].length} notes</small></button>`).join('')}</div>
    <p class="muted">Your own tracks aren't ranked. The leaderboards are for the albums.</p>
    <div class="row"><button id="go" class="play">Play</button><button id="back" class="ghost">Back</button></div></section>`
  app.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => (b.onclick = () => { chosen.difficulty = b.dataset.d as Difficulty; app.querySelectorAll('[data-d]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)) }) }))
  document.getElementById('go')!.onclick = () => run(song, lastCustom!.buffer, false)
  document.getElementById('back')!.onclick = () => select()
}

async function run(chartData: SongChart, buffer: AudioBuffer, ranked: boolean) {
  await audioCtx().resume()
  document.body.dataset.screen = 'play'
  app.innerHTML = `<canvas id="stage" class="stage" aria-label="Playfield"></canvas>`
  const hue = hueOf(chartData.slug === 'custom' ? chartData.title : chartData.slug)
  const result = await play({
    canvas: document.getElementById('stage') as HTMLCanvasElement,
    buffer, ctx: audioCtx(), notes: chartData.charts[chosen.difficulty], sections: chartData.sections,
    bpm: chartData.bpm, firstBeat: chartData.firstBeat, offsetMs: me!.settings.offsetMs, speed: me!.settings.speed, title: chartData.title, hue,
  })
  if (result.quit) return ranked ? select() : custom2()
  results(chartData, buffer, ranked, result, hue)
}

const custom2 = () => (lastCustom ? select() : select())

async function results(chartData: SongChart, buffer: AudioBuffer, ranked: boolean, result: GameResult, hue: number) {
  const total = chartData.charts[chosen.difficulty].length
  const local = scoreOf(result.counts, total)
  document.body.dataset.screen = 'results'
  document.documentElement.style.setProperty('--hue', String(hue))
  const timed = result.offsets.filter((o) => o.ms !== null).map((o) => o.ms!)
  const mean = timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : 0
  app.innerHTML = `<section class="results glass">
    <p class="kicker">${esc(chartData.title)} · ${chosen.difficulty}</p>
    <div class="grade g-${local.grade}" id="grade">${local.grade}</div>
    ${result.counts.miss === 0 ? `<p class="fc">${result.counts.great + result.counts.good === 0 ? 'ALL PERFECT' : 'FULL COMBO'}</p>` : ''}
    <p class="score"><span id="score">0</span><small>${(local.accuracy * 100).toFixed(2)}%${result.cleared ? '' : ' · <span class="failed">health ran out</span>'}</small></p>
    <ul class="counts">${JUDGMENTS.map((j) => `<li class="${j}"><span>${j}</span><b>${result.counts[j]}</b></li>`).join('')}<li class="combo"><span>max combo</span><b>${result.maxCombo}</b></li></ul>
    <figure class="timing"><canvas id="timing" width="560" height="140" aria-label="Timing of every hit"></canvas>
      <figcaption>Every hit, early above the line and late below. Average ${mean >= 0 ? '+' : ''}${mean.toFixed(0)} ms${Math.abs(mean) > 18 ? ` · try Calibrate${mean > 0 ? ' (you hit late)' : ' (you hit early)'}` : ''}</figcaption></figure>
    <p id="saved" class="muted">${ranked ? 'Saving…' : 'Your own track: not ranked.'}</p>
    <div class="row"><button id="again">Retry</button><button id="back" class="ghost">Song select</button></div></section>`
  drawTiming(document.getElementById('timing') as HTMLCanvasElement, result, chartData.duration)
  countUp(document.getElementById('score')!, local.score)
  document.getElementById('again')!.onclick = () => (ranked ? start() : run(chartData, buffer, false))
  document.getElementById('back')!.onclick = () => select()
  if (!ranked) return
  try {
    const r = await api.submit({ slug: chartData.slug, difficulty: chosen.difficulty, counts: result.counts, maxCombo: result.maxCombo, cleared: result.cleared })
    me = await api.me()
    document.getElementById('saved')!.innerHTML = r.personalBest
      ? `<b class="pb">New personal best</b>${r.rank ? ` · #${r.rank} on the leaderboard` : ''}`
      : `Saved. Your best is still ${r.previousBest!.score.toLocaleString()} (${r.previousBest!.grade}).`
  } catch (err) { document.getElementById('saved')!.textContent = `Not saved: ${(err as Error).message}` }
}

function countUp(el: HTMLElement, to: number) {
  const t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1100)
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString()
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function drawTiming(c: HTMLCanvasElement, r: GameResult, duration: number) {
  const g = c.getContext('2d')!
  const W = c.width, H = c.height, mid = H / 2, range = 140
  g.fillStyle = 'rgba(255,255,255,0.04)'
  g.fillRect(0, 0, W, H)
  for (const [ms, col] of [[45, 'rgba(125,255,176,0.12)'], [90, 'rgba(79,209,255,0.08)']] as const) {
    g.fillStyle = col
    g.fillRect(0, mid - (ms / range) * mid, W, (2 * ms / range) * mid)
  }
  g.fillStyle = 'rgba(255,255,255,0.3)'
  g.fillRect(0, mid, W, 1)
  for (const o of r.offsets) {
    const x = (o.t / duration) * W
    if (o.ms === null) { g.fillStyle = 'rgba(255,79,109,0.5)'; g.fillRect(x, 0, 1, H); continue }
    const y = mid + (o.ms / range) * mid
    g.fillStyle = Math.abs(o.ms) <= 45 ? '#7dffb0' : Math.abs(o.ms) <= 90 ? '#4fd1ff' : '#ffb84f'
    g.fillRect(x - 1, y - 1, 3, 3)
  }
}

async function runCalibration() {
  stopPreview()
  document.body.dataset.screen = 'select'
  app.innerHTML = `<section class="card glass cal"><h2>Calibrate</h2>
    <p>Tap <kbd>Space</kbd> on each click. After 16 taps your median offset is saved, so charts line up with your speakers and keyboard.</p>
    <div class="beatdot" id="dot"></div><p id="calmsg" class="muted">Press Space to start.</p>
    <div class="row"><button id="calback" class="ghost">Back</button></div></section>`
  const abort = new AbortController()
  document.getElementById('calback')!.onclick = () => { abort.abort(); select() }
  const offset = await calibrate(audioCtx(), document.getElementById('dot')!, document.getElementById('calmsg')!, abort.signal)
  if (offset === null) return
  me!.settings = await api.settings({ offsetMs: offset })
  document.getElementById('calmsg')!.textContent = `Saved: ${offset} ms. Your charts now line up with what you hear.`
}

addEventListener('keydown', (e: KeyboardEvent) => {
  if (document.body.dataset.screen !== 'select' || !me || !document.getElementById('detail')) return
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return
  const order = ['what is real', 'e'].flatMap((al) => songs.filter((s) => s.album === al))
  const i = order.findIndex((s) => s.slug === chosen.slug)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    chosen.slug = order[(i + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length]!.slug
    select(true)
    document.querySelector('.song.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const d = DIFFICULTIES.indexOf(chosen.difficulty) + (e.key === 'ArrowRight' ? 1 : -1)
    chosen.difficulty = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, d))]!
    select()
  } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
    e.preventDefault()
    start()
  }
})

boot()
