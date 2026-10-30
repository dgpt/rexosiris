import { getStore } from '@netlify/blobs'
import { handle, type Store } from '../../src/server/handler'

function blobStore(): Store {
  const blobs = getStore({ name: 'rhythm', consistency: 'strong' })
  return {
    get: (key) => blobs.get(key, { type: 'json' }),
    set: async (key, value) => { await blobs.setJSON(key, value) },
  }
}

export default (req: Request): Promise<Response> => {
  const secret = process.env['SESSION_SECRET'] ?? ''
  if (secret === '') return Promise.resolve(new Response(JSON.stringify({ error: 'SESSION_SECRET is not set on this deploy' }), { status: 500 }))
  return handle(req, blobStore(), secret)
}

export const config = { path: '/api/*' }
