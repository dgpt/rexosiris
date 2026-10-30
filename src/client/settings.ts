import { api } from './api'
import { isSettings, type Settings } from './decode'
import { state } from './state'

export const DEFAULT_SETTINGS: Settings = { offsetMs: 0, speed: 0.5 }
const STORAGE_KEY = 'rexosiris.settings'

function stored(): Settings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return isSettings(parsed) ? parsed : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const currentSettings = (): Settings => state.me?.settings ?? stored()

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  if (state.me !== null) {
    const settings = await api.settings(patch)
    state.me = { ...state.me, settings }
    return settings
  }
  const settings = { ...stored(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  return settings
}
