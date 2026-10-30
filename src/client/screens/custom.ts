import { analyze, chartWithSections, DIFFICULTIES, type Difficulty, type Note, type Section } from '../../shared/analyze'
import type { SongChart } from '../../shared/types'
import { audioContext, stopPreview } from '../audio'
import { isDifficulty } from '../decode'
import { esc, find, findAll, fmtTime, onClick, render } from '../dom'
import { nav } from '../nav'
import { type CustomTrack, state } from '../state'

const ANALYSIS_RATE = 22_050

async function mixDown(buffer: AudioBuffer) {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * ANALYSIS_RATE), ANALYSIS_RATE)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

export async function chartFromFile(file: File, onStage: (stage: string) => void): Promise<CustomTrack> {
  onStage('Decoding audio…')
  const buffer = await audioContext().decodeAudioData(await file.arrayBuffer())
  onStage('Mixing down for analysis…')
  const mono = await mixDown(buffer)
  onStage('Finding the beat and the instruments…')
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  const analysis = analyze(mono, ANALYSIS_RATE)
  const built = DIFFICULTIES.map((d) => [d, chartWithSections(analysis, d)] as const)
  const charts: Record<Difficulty, Note[]> = { easy: [], normal: [], hard: [] }
  let sections: Section[] = []
  for (const [d, chart] of built) {
    charts[d] = chart.notes
    sections = chart.sections
  }
  const title = file.name.replace(/\.[^.]+$/, '')
  const song: SongChart = { slug: 'custom', album: 'your track', title, bpm: analysis.bpm, firstBeat: analysis.firstBeat, duration: analysis.duration, charts, sections }
  return { song, buffer }
}

function readyMarkup({ song }: CustomTrack) {
  const voices = [...new Set((song.sections ?? []).map((x) => x.voice))]
  const radios = DIFFICULTIES.map((d) => {
    const on = d === state.picked.difficulty
    return `<button role="radio" aria-checked="${on}" data-difficulty="${d}" class="${on ? 'on' : ''}">${d}<small>${song.charts[d].length} notes</small></button>`
  })
  return `<section class="card glass"><h2>${esc(song.title)}</h2>
    <p class="meta">${song.bpm.toFixed(1)} bpm · ${fmtTime(song.duration)} · charted in your browser by the same analyzer that charted my albums</p>
    ${voices.length > 0 ? `<p class="meta">It follows: ${voices.map((v) => `<span class="tag">${esc(v)}</span>`).join(' ')}</p>` : ''}
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${radios.join('')}</div>
    <p class="muted">Your own tracks aren't ranked. The leaderboards are for the albums.</p>
    <div class="row"><button id="go" class="play">Play</button><button id="back" class="ghost">Back</button></div></section>`
}

function showFailure(error: unknown) {
  const why = error instanceof Error && error.message !== '' ? error.message : 'The browser could not decode it.'
  render('select', `<section class="card glass"><h2>Couldn't chart that file</h2><p class="muted">${esc(why)}</p><div class="row"><button id="back">Back</button></div></section>`)
  onClick('#back', () => { nav().select() })
}

export async function custom(file: File) {
  stopPreview()
  render('loading', `<div class="loading"><div class="spinner"></div><span id="stage-message">Reading ${esc(file.name)}…</span></div>`)
  try {
    state.custom = await chartFromFile(file, (stage) => { find('#stage-message', HTMLElement).textContent = stage })
  } catch (error) {
    showFailure(error)
    return
  }
  const track = state.custom
  render('select', readyMarkup(track))
  for (const radio of findAll('[data-difficulty]', HTMLButtonElement)) {
    radio.addEventListener('click', () => {
      const d = radio.dataset['difficulty']
      if (isDifficulty(d)) state.picked.difficulty = d
      for (const other of findAll('[data-difficulty]', HTMLButtonElement)) {
        other.classList.toggle('on', other === radio)
        other.setAttribute('aria-checked', String(other === radio))
      }
    })
  }
  onClick('#go', () => nav().play(track.song, track.buffer, false))
  onClick('#back', () => { nav().select() })
}
