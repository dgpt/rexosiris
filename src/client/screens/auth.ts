import { api } from '../api'
import { esc, find, render } from '../dom'
import { stopPreview } from '../audio'
import { nav } from '../nav'
import { state } from '../state'

export const ARTIST = 'REXOSIRIS'

const markup = (error: string) => `
  <section class="hero">
    <div class="logo" aria-hidden="true"><span>←</span><span>↓</span><span>↑</span><span>→</span></div>
    <h1 class="title">${ARTIST}<span class="dot">.</span></h1>
    <p class="lede">A rhythm game where every track is mine. Two albums, <i>what comes next?</i> and <i>e</i>, twenty songs, and charts that listen to the music and follow the kick, the snare, the lead, whatever is driving each phrase.</p>
    <form id="auth" class="card glass">
      <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8"></label>
      <p class="error" role="alert">${esc(error)}</p>
      <div class="row"><button name="mode" value="login">Sign in</button><button name="mode" value="signup" class="ghost">Create account</button></div>
    </form>
  </section>`

function field(data: FormData, name: string) {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}

async function submit(form: HTMLFormElement, mode: string) {
  const data = new FormData(form)
  const username = field(data, 'username')
  const password = field(data, 'password')
  try {
    await (mode === 'signup' ? api.signup(username, password) : api.login(username, password))
    state.me = await api.me()
    nav().select()
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
}
