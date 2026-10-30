import { api } from './api'
import { decode, isIndex } from './decode'
import { report } from './dom'
import { select } from './screens'
import { selectKeys } from './screens/select-keys'
import { state } from './state'

document.addEventListener('keydown', selectKeys)

async function boot() {
  const index: unknown = await fetch('/charts/index.json').then((r): Promise<unknown> => r.json())
  state.songs = decode(index, isIndex, 'song list')
  state.me = (await api.session()) ? await api.me() : null
  select()
}

await boot().catch(report)
