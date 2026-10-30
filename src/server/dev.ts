import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { handle, type Store } from './handler'

const DATA = process.env.DATA_DIR ?? '.data'

export function fileStore(root: string): Store {
  const path = (key: string) => join(root, `${key}.json`)
  return {
    async get(key) { return existsSync(path(key)) ? JSON.parse(readFileSync(path(key), 'utf8')) : null },
    async set(key, value) { mkdirSync(dirname(path(key)), { recursive: true }); writeFileSync(path(key), JSON.stringify(value)) },
  }
}

if (import.meta.main) {
  const store = fileStore(DATA)
  const secret = process.env.SESSION_SECRET ?? 'dev-only-secret'
  const port = Number(process.env.PORT ?? 4390)
  Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.startsWith('/api/')) return handle(req, store, secret)
      const file = Bun.file(join('public', url.pathname === '/' ? 'index.html' : url.pathname))
      return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 })
    },
  })
  console.log(`http://127.0.0.1:${port}`)
}
