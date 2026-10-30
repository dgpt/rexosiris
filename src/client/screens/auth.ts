import { api } from '../api'
import { stopPreview } from '../audio'
import { esc, find, notify, onClick, render } from '../dom'
import { nav } from '../nav'
import { ARTIST, state } from '../state'

const markup = (error: string) => `
  <section class="hero">
    <h1 class="title">${ARTIST}<span class="dot">.</span></h1>
    <p class="lede">${state.pending === null ? 'Sign in to keep your scores and get on the leaderboards. Playing works without it.' : 'Sign in or create an account and your last run goes on the leaderboard.'}</p>
    <form id="auth" class="card glass">
      <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
      <p class="error" role="alert">${esc(error)}</p>
      <div class="row"><button name="mode" value="login">Sign in</button><button name="mode" value="signup" class="ghost">Create account</button></div>
    </form>
    <button id="auth-back" class="ghost">Back to the music</button>
  </section>`

function field(data: FormData, name: string) {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}

async function savePending() {
  const run = state.pending
  if (run === null) return
  state.pending = null
  const receipt = await api.submit(run)
  state.me = await api.me()
  notify(receipt.rank === null ? 'Your run is saved.' : `Your run is saved: #${receipt.rank} on the leaderboard.`)
}

async function submit(form: HTMLFormElement, mode: string) {
  const data = new FormData(form)
  const username = field(data, 'username')
  const password = field(data, 'password')
  try {
    await (mode === 'signup' ? api.signup(username, password) : api.login(username, password))
    state.me = await api.me()
    await savePending()
    if (mode === 'signup') await nav().calibrate({ welcome: true })
    else nav().select()
  } catch (error) {
    auth(error instanceof Error ? error.message : String(error))
  }
}

export function auth(error = '') {
  stopPreview()
  render('auth', markup(error))
  const form = find('#auth', HTMLFormElement)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const button = e.submitter instanceof HTMLButtonElement ? e.submitter : null
    void submit(form, button?.value ?? 'login')
  })
  onClick('#auth-back', () => {
    state.pending = null
    nav().select()
  })
}
