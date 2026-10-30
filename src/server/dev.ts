import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { handle, type Store } from './handler'

const DATA = process.env['DATA_DIR'] ?? '.data'

export function fileStore(root: string): Store {
  const path = (key: string) => join(root, `${key}.json`)
  const read = (key: string): unknown => existsSync(path(key)) ? JSON.parse(readFileSync(path(key), 'utf8')) : null
  const write = (key: string, value: unknown) => {
    mkdirSync(dirname(path(key)), { recursive: true })
    writeFileSync(path(key), JSON.stringify(value))
  }
  return {
    get: (key) => Promise.resolve(read(key)),
    set: (key, value) => { write(key, value); return Promise.resolve() },
  }
}

async function serveFile(pathname: string) {
  const file = Bun.file(join('public', pathname === '/' ? 'index.html' : pathname))
  return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 })
}

if (import.meta.main) {
  const store = fileStore(DATA)
  const secret = process.env['SESSION_SECRET'] ?? 'dev-only-secret'
  const port = Number(process.env['PORT'] ?? 4390)
  Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch: (req) => {
      const { pathname } = new URL(req.url)
      return pathname.startsWith('/api/') ? handle(req, store, secret) : serveFile(pathname)
    },
  })
  console.log(`http://127.0.0.1:${port}`)
}
