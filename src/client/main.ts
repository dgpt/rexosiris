import { api } from './api'
import { decode, isIndex } from './decode'
import { report } from './dom'
import { registerScreens } from './nav'
import { auth } from './screens/auth'
import { calibrate } from './screens/calibrate'
import { custom } from './screens/custom'
import { play, start } from './screens/play'
import { select, selectKeys } from './screens/select'
import { state } from './state'

registerScreens({ auth, select, play, start, custom, calibrate })

document.addEventListener('keydown', selectKeys)

async function boot() {
  const index: unknown = await fetch('/charts/index.json').then((r): Promise<unknown> => r.json())
  state.songs = decode(index, isIndex, 'song list')
  state.me = (await api.session()) ? await api.me() : null
  if (state.me === null) auth()
  else select()
}

await boot().catch(report)
