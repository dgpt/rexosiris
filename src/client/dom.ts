const ENTITY: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const esc = (text: string) => text.replaceAll(/[&<>"']/g, (c) => ENTITY[c] ?? c)

export const fmtTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

export function find<T extends Element>(selector: string, kind: abstract new () => T, root: ParentNode = document): T {
  const node = root.querySelector(selector)
  if (!(node instanceof kind)) throw new TypeError(`${selector} is not a ${kind.name}`)
  return node
}

export const findAll = <T extends Element>(selector: string, kind: abstract new () => T, root: ParentNode = document) =>
  [...root.querySelectorAll(selector)].filter((n): n is T => n instanceof kind)

export const app = () => find('#app', HTMLElement)

export function render(screen: string, markup: string) {
  document.body.dataset['screen'] = screen
  app().innerHTML = markup
}

export function onClick(selector: string, handler: () => unknown, root: ParentNode = document) {
  find(selector, HTMLElement, root).addEventListener('click', () => {
    void Promise.resolve(handler()).catch(report)
  })
}

export function report(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.setAttribute('role', 'alert')
  toast.textContent = message
  document.body.append(toast)
  setTimeout(() => { toast.remove() }, 4000)
}

export const setHue = (hue: number) => { document.documentElement.style.setProperty('--hue', String(hue)) }

export const hueOf = (seed: string) => Array.from(seed, (c) => c.codePointAt(0) ?? 0).reduce((h, c) => (h * 31 + c) % 360, 7)

export const count = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`
