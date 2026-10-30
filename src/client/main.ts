import { DIFFICULTIES, type Difficulty } from '../shared/analyze'
import { JUDGMENTS, scoreOf, type ChartIndexEntry, type SongChart } from '../shared/types'
import { api, type Me } from './api'
import { play } from './game'
import { calibrate } from './calibrate'
import { chartFromFile } from './custom'

const app = document.getElementById('app')!
let me: Me | null = null
let songs: ChartIndexEntry[] = []
let ctx: AudioContext | null = null
const audio = new Map<string, Promise<AudioBuffer>>()
const ALBUMS: Record<string, string> = {
  e: 'e',
  'what is real': 'what is real',
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const audioCtx = () => (ctx ??= new AudioContext())
function loadAudio(slug: string) {
  if (!audio.has(slug)) audio.set(slug, fetch(`/audio/${slug}.mp3`).then((r) => r.arrayBuffer()).then((b) => audioCtx().decodeAudioData(b)))
  return audio.get(slug)!
}

async function boot() {
  songs = await (await fetch('/charts/index.json')).json()
  me = (await fetch('/api/session').then((r) => r.json()).catch(() => null))?.signedIn ? await api.me() : null
  me ? select() : auth()
}

function auth(error = '') {
  app.innerHTML = `
    <section class="card auth">
      <h1>what is real<span class="dot">.</span></h1>
      <p class="lede">A rhythm game where every track is mine. Two albums, twenty songs, charts generated from the audio itself.</p>
      <form id="f">
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

function select() {
  if (!me) return auth()
  if (!chosen.slug) chosen.slug = songs[0]!.slug
  const albums = [...new Set(songs.map((s) => s.album))]
  app.innerHTML = `
    <header class="top">
      <h1>what is real<span class="dot">.</span></h1>
      <nav><span>${esc(me.name)}</span><button id="cal" class="ghost">Calibrate (${me.settings.offsetMs} ms)</button>
      <label class="speed">Speed <input id="speed" type="range" min="0.5" max="3" step="0.1" value="${me.settings.speed}"><output>${me.settings.speed}×</output></label>
      <label class="ghost upload">Chart your own track<input id="upload" type="file" accept="audio/*" hidden></label>
      <button id="out" class="ghost">Sign out</button></nav>
    </header>
    <main class="select">
      <div class="songs">${albums.map((al) => `
        <h2>${esc(ALBUMS[al] ?? al)}</h2>
        <ul>${songs.filter((s) => s.album === al).map((s) => {
          const best = me!.bests[`${s.slug}/${chosen.difficulty}`]
          return `<li><button class="song ${s.slug === chosen.slug ? 'on' : ''}" data-slug="${s.slug}">
            <span class="t">${esc(s.title)}</span><span class="m">${Math.round(s.bpm)} bpm · ${fmtTime(s.duration)}</span>
            <span class="g">${best ? `${best.grade} ${(best.accuracy * 100).toFixed(1)}%` : ''}</span></button></li>`
        }).join('')}</ul>`).join('')}
      </div>
      <aside class="detail" id="detail"></aside>
    </main>
    <section class="recent"><h2>Your recent plays</h2>${me.history.length ? `<ol>${me.history.slice(0, 8).map((r) => `<li><span>${esc(songs.find((x) => x.slug === r.slug)?.title ?? r.slug)}</span><span>${r.difficulty}</span><span class="g-${r.grade}">${r.grade}</span><span>${(r.accuracy * 100).toFixed(1)}%</span><time>${new Date(r.at).toLocaleString()}</time></li>`).join('')}</ol>` : '<p class="muted">Nothing yet. Pick a song.</p>'}</section>`
  document.getElementById('out')!.onclick = async () => { await api.logout(); me = null; auth() }
  document.getElementById('cal')!.onclick = () => runCalibration()
  ;(document.getElementById('upload') as HTMLInputElement).onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) custom(f) }
  const speed = document.getElementById('speed') as HTMLInputElement
  speed.oninput = () => (speed.nextElementSibling!.textContent = `${speed.value}×`)
  speed.onchange = async () => { me!.settings = await api.settings({ speed: Number(speed.value) }) }
  app.querySelectorAll<HTMLButtonElement>('.song').forEach((b) => (b.onclick = () => { chosen.slug = b.dataset.slug!; select() }))
  detail()
}

async function detail() {
  const s = songs.find((x) => x.slug === chosen.slug)!
  const el = document.getElementById('detail')!
  const best = me!.bests[`${s.slug}/${chosen.difficulty}`]
  el.innerHTML = `
    <h2>${esc(s.title)}</h2>
    <p class="meta">${esc(s.album)} · ${Math.round(s.bpm)} bpm · ${fmtTime(s.duration)}</p>
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `
      <button role="radio" aria-checked="${d === chosen.difficulty}" data-d="${d}" class="${d === chosen.difficulty ? 'on' : ''}">${d}<small>${s.notes[d]} notes</small></button>`).join('')}
    </div>
    <p class="best">${best ? `Your best: <b>${best.grade}</b> ${best.score.toLocaleString()} · max combo ${best.maxCombo}` : 'Not played on this difficulty yet.'}</p>
    <button id="go" class="play">Play ▶</button>
    <p class="keys">← ↓ ↑ → or D F J K · Esc to quit</p>
    <h3>Leaderboard</h3><ol class="board" id="board"><li class="muted">Loading…</li></ol>`
  el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => (b.onclick = () => { chosen.difficulty = b.dataset.d as Difficulty; select() }))
  document.getElementById('go')!.onclick = () => start()
  loadAudio(s.slug)
  const rows = await api.leaderboard(s.slug, chosen.difficulty).catch(() => [])
  const board = document.getElementById('board')
  if (board) board.innerHTML = rows.length ? rows.slice(0, 10).map((r) => `<li class="${r.user === me!.name ? 'me' : ''}"><span>${esc(r.user)}</span><span>${r.grade}</span><span>${r.score.toLocaleString()}</span></li>`).join('') : '<li class="muted">No scores yet. Be first.</li>'
}

async function start() {
  const s = songs.find((x) => x.slug === chosen.slug)!
  app.innerHTML = `<div class="loading">Loading ${esc(s.title)}…</div>`
  const [chartData, buffer] = await Promise.all([fetch(`/charts/${s.slug}.json`).then((r) => r.json() as Promise<SongChart>), loadAudio(s.slug)])
  return run(chartData, buffer, true)
}

let lastCustom: { song: SongChart; buffer: AudioBuffer } | null = null
async function custom(file: File) {
  app.innerHTML = `<div class="loading" id="stagemsg">Reading ${esc(file.name)}…</div>`
  try {
    lastCustom = await chartFromFile(audioCtx(), file, (m) => (document.getElementById('stagemsg')!.textContent = m))
  } catch (err) {
    app.innerHTML = `<section class="card"><h2>Couldn't chart that file</h2><p class="muted">${esc((err as Error).message || 'The browser could not decode it.')}</p><div class="row"><button id="back">Back</button></div></section>`
    document.getElementById('back')!.onclick = () => select()
    return
  }
  const { song } = lastCustom
  app.innerHTML = `<section class="card"><h2>${esc(song.title)}</h2>
    <p class="meta">${song.bpm.toFixed(1)} bpm · ${fmtTime(song.duration)} · charted in your browser by the same analyzer that charted my albums</p>
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => `<button role="radio" aria-checked="${d === chosen.difficulty}" data-d="${d}" class="${d === chosen.difficulty ? 'on' : ''}">${d}<small>${song.charts[d].length} notes</small></button>`).join('')}</div>
    <p class="muted">Your own tracks aren't ranked. The leaderboards are for the albums.</p>
    <div class="row"><button id="go" class="play">Play ▶</button><button id="back" class="ghost">Back</button></div></section>`
  app.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => (b.onclick = () => { chosen.difficulty = b.dataset.d as Difficulty; app.querySelectorAll('[data-d]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)) }) }))
  document.getElementById('go')!.onclick = () => run(song, lastCustom!.buffer, false)
  document.getElementById('back')!.onclick = () => select()
}

async function run(chartData: SongChart, buffer: AudioBuffer, ranked: boolean) {
  const s = { title: chartData.title, slug: chartData.slug }
  await audioCtx().resume()
  app.innerHTML = `<canvas id="stage" class="stage"></canvas>`
  const result = await play({
    canvas: document.getElementById('stage') as HTMLCanvasElement,
    buffer, ctx: audioCtx(), notes: chartData.charts[chosen.difficulty],
    bpm: chartData.bpm, firstBeat: chartData.firstBeat, offsetMs: me!.settings.offsetMs, speed: me!.settings.speed, title: s.title,
  })
  if (result.quit) return select()
  const total = chartData.charts[chosen.difficulty].length
  const local = scoreOf(result.counts, total)
  app.innerHTML = `<section class="card results"><h2>${esc(s.title)} · ${chosen.difficulty}</h2>
    <div class="grade g-${local.grade}">${local.grade}</div>
    <p class="score">${local.score.toLocaleString()} · ${(local.accuracy * 100).toFixed(2)}%${result.cleared ? '' : ' · <span class="failed">failed (health ran out)</span>'}</p>
    <ul class="counts">${JUDGMENTS.map((j) => `<li class="${j}"><span>${j}</span><b>${result.counts[j]}</b></li>`).join('')}<li><span>max combo</span><b>${result.maxCombo}</b></li></ul>
    <p id="saved" class="muted">Saving…</p>
    <div class="row"><button id="again">Retry</button><button id="back" class="ghost">Song select</button></div></section>`
  document.getElementById('again')!.onclick = () => (ranked ? start() : run(chartData, buffer, false))
  document.getElementById('back')!.onclick = () => select()
  if (!ranked) { document.getElementById('saved')!.textContent = 'Your own track: not ranked.'; return }
  try {
    const r = await api.submit({ slug: s.slug, difficulty: chosen.difficulty, counts: result.counts, maxCombo: result.maxCombo, cleared: result.cleared })
    me = await api.me()
    document.getElementById('saved')!.innerHTML = r.personalBest
      ? `New personal best${r.rank ? ` · #${r.rank} on the leaderboard` : ''}.`
      : `Saved. Your best is still ${r.previousBest!.score.toLocaleString()} (${r.previousBest!.grade}).`
  } catch (err) { document.getElementById('saved')!.textContent = `Not saved: ${(err as Error).message}` }
}

async function runCalibration() {
  app.innerHTML = `<section class="card cal"><h2>Calibrate</h2>
    <p>Tap <kbd>Space</kbd> on each click. After 16 taps the median gap between when you heard it and when you pressed becomes your offset.</p>
    <div class="beatdot" id="dot"></div><p id="calmsg" class="muted">Press Space to start.</p>
    <div class="row"><button id="calback" class="ghost">Back</button></div></section>`
  document.getElementById('calback')!.onclick = () => { abort.abort(); select() }
  const abort = new AbortController()
  const offset = await calibrate(audioCtx(), document.getElementById('dot')!, document.getElementById('calmsg')!, abort.signal)
  if (offset === null) return
  me!.settings = await api.settings({ offsetMs: offset })
  document.getElementById('calmsg')!.textContent = `Saved: ${offset} ms. Your charts now line up with what you hear.`
}

boot()
