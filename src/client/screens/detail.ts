import { DIFFICULTIES, type Difficulty } from '../../shared/analyze'
import type { ChartIndexEntry, ScoreRow } from '../../shared/types'
import { count, esc, fmtTime } from '../dom'
import { signedIn, state } from '../state'

const PATH_SHOWN = 9
const LEADERBOARD_ROWS = 10
const VOICE_NAME: Readonly<Record<string, string>> = { air: 'cymbals' }

function pathMarkup(voices: readonly string[] | undefined) {
  if (voices === undefined || voices.length === 0) return ''
  const shown = voices.slice(0, PATH_SHOWN).map((v) => `<span class="tag">${esc(VOICE_NAME[v] ?? v)}</span>`)
  const more = voices.length > PATH_SHOWN ? '<span class="arrow">…</span>' : ''
  return `<p class="path" title="The instrument the chart follows, phrase by phrase">${shown.join('<span class="arrow">→</span>')}${more}</p>`
}

function difficultyButton(song: ChartIndexEntry, d: Difficulty) {
  const on = d === state.picked.difficulty
  const holds = song.holds?.[d] ?? 0
  const detail = `${count(song.notes[d], 'note')}${holds > 0 ? ` · ${count(holds, 'hold')}` : ''}`
  return `<button role="radio" aria-checked="${on}" data-difficulty="${d}" class="${on ? 'on' : ''}">${d}<small>${detail}</small></button>`
}

function bestMarkup(best: ScoreRow | undefined) {
  if (best === undefined) return 'Not played on this difficulty yet.'
  return `Your best <b class="g-${best.grade}">${best.grade}</b> ${best.score.toLocaleString()} · combo ${best.maxCombo}`
}

const KEYS_HELP = `<p class="keys">Song select: <kbd>↑</kbd><kbd>↓</kbd> songs · <kbd>←</kbd><kbd>→</kbd> difficulty · <kbd>Enter</kbd> play<br>
  In game: <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd> or <kbd>D</kbd><kbd>F</kbd><kbd>J</kbd><kbd>K</kbd> · tap lanes on a phone · <kbd>Esc</kbd> quits</p>`

export function detailMarkup(song: ChartIndexEntry) {
  const track = song.track === null ? '' : ` · track ${song.track}`
  return `<div class="cover" aria-hidden="true"><div class="disc"></div></div>
    <h2>${esc(song.title)}</h2>
    <p class="meta">${esc(song.artist)} · <i>${esc(song.album)}</i>${track}</p>
    <p class="meta">${Math.round(song.bpm)} bpm · ${fmtTime(song.duration)}</p>
    ${pathMarkup(song.voices)}
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => difficultyButton(song, d)).join('')}</div>
    <p class="best">${bestMarkup(signedIn().bests[`${song.slug}/${state.picked.difficulty}`])}</p>
    <button id="go" class="play">Play</button>
    ${KEYS_HELP}
    <h3>Leaderboard</h3><ol class="board" id="board"><li class="muted">Loading…</li></ol>`
}

export function leaderboardMarkup(rows: readonly ScoreRow[], me: string) {
  if (rows.length === 0) return '<li class="muted">No scores yet. Be first.</li>'
  return rows
    .slice(0, LEADERBOARD_ROWS)
    .map((r) => `<li class="${r.user === me ? 'me' : ''}"><span>${esc(r.user)}</span><span class="g-${r.grade}">${r.grade}</span><span>${r.score.toLocaleString()}</span></li>`)
    .join('')
}
