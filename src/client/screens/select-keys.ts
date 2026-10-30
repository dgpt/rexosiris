import { DIFFICULTIES } from '../../shared/analyze'
import { report } from '../dom'
import { nav } from '../nav'
import { playOrder, state } from '../state'

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLButtonElement

function stepSong(direction: 1 | -1) {
  const order = playOrder()
  const at = order.findIndex((s) => s.slug === state.picked.slug)
  const next = order[(at + direction + order.length) % order.length]
  if (next !== undefined) state.picked.slug = next.slug
  nav().select({ preview: true })
  document.querySelector('.song.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function stepDifficulty(direction: 1 | -1) {
  const at = DIFFICULTIES.indexOf(state.picked.difficulty)
  state.picked.difficulty = DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, at + direction))] ?? state.picked.difficulty
  nav().select()
}

const SELECT_KEYS: Readonly<Record<string, () => unknown>> = {
  ArrowDown: () => { stepSong(1) },
  ArrowUp: () => { stepSong(-1) },
  ArrowRight: () => { stepDifficulty(1) },
  ArrowLeft: () => { stepDifficulty(-1) },
  Enter: () => nav().start(),
}

export function selectKeys(e: KeyboardEvent) {
  if (document.body.dataset['screen'] !== 'select' || state.me === null || document.querySelector('#detail') === null) return
  const action = SELECT_KEYS[e.key]
  if (action === undefined || (e.key === 'Enter' && typing(e.target))) return
  e.preventDefault()
  void Promise.resolve(action()).catch(report)
}
