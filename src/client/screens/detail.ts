import { DIFFICULTIES, type Difficulty } from '../../shared/analyze'
import type { ChartIndexEntry, ScoreRow } from '../../shared/types'
import { count, esc, fmtTime } from '../dom'
import { state } from '../state'

const LEADERBOARD_ROWS = 10

function difficultyButton(song: ChartIndexEntry, d: Difficulty) {
  const on = d === state.picked.difficulty
  const holds = song.holds?.[d] ?? 0
  const detail = `${count(song.notes[d], 'note')}${holds > 0 ? ` · ${count(holds, 'hold')}` : ''}`
  return `<button role="radio" aria-checked="${on}" data-difficulty="${d}" class="${on ? 'on' : ''}">${d}<small>${detail}</small></button>`
}

function bestMarkup(best: ScoreRow | undefined) {
  if (state.me === null) return 'Play as a guest, or sign in to keep your scores.'
  if (best === undefined) return 'Not played on this difficulty yet.'
  return `Your best <b class="g-${best.grade}">${best.grade}</b> ${best.score.toLocaleString()} · combo ${best.maxCombo}`
}

const KEYS_HELP = `<p class="keys">Song select: <kbd>↑</kbd><kbd>↓</kbd> songs · <kbd>←</kbd><kbd>→</kbd> difficulty · <kbd>Enter</kbd> play<br>
  In game: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd>, <kbd>A</kbd><kbd>W</kbd><kbd>D</kbd> or <kbd>J</kbd><kbd>I</kbd><kbd>L</kbd> · tap lanes on a phone · <kbd>Esc</kbd> quits</p>`

export function detailMarkup(song: ChartIndexEntry) {
  const track = song.track === null ? '' : ` · track ${song.track}`
  return `<div class="cover" aria-hidden="true"><div class="disc"></div></div>
    <h2>${esc(song.title)}</h2>
    <p class="meta">${esc(song.artist)} · <i>${esc(song.album)}</i>${track}</p>
    <p class="meta">${Math.round(song.bpm)} bpm · ${fmtTime(song.duration)}</p>
    <div class="diffs" role="radiogroup" aria-label="Difficulty">${DIFFICULTIES.map((d) => difficultyButton(song, d)).join('')}</div>
    <p class="best">${bestMarkup(state.me?.bests[`${song.slug}/${state.picked.difficulty}`])}</p>
    <div class="actions"><button id="go" class="play">Play</button><button id="listen" class="ghost listen">Listen</button></div>
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
