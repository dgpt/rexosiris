import { getStore } from '@netlify/blobs'
import { handle, type Store } from '../../src/server/handler'

function blobStore(): Store {
  const s = getStore({ name: 'rhythm', consistency: 'strong' })
  return {
    get: (key) => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value).then(() => undefined),
  }
}

export default async (req: Request) => {
  const secret = process.env.SESSION_SECRET
  if (!secret) return new Response(JSON.stringify({ error: 'SESSION_SECRET is not set on this deploy' }), { status: 500 })
  return handle(req, blobStore(), secret)
}

export const config = { path: '/api/*' }
