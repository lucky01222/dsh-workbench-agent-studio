import { invokeStudioMethod } from 'dsh-workbench-agent-studio-service/protocol'
export const inject = ['agentStudio']
export function apply(ctx) {
  const studio = ctx.agentStudio
  ctx.on('connection/request', async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/api/workbench-agent-studio') return next()
    res.setHeader('cache-control', 'no-store')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(405); res.end(JSON.stringify({ error: 'JSON POST required' })); return }
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new Error('Request too large'); chunks.push(chunk) }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const value = await invokeStudioMethod(studio, body.method, body.args)
      res.end(JSON.stringify({ ok: true, value }))
    } catch (e) {
      res.statusCode = e.code === 'NOT_FOUND' ? 404 : e.code === 'REVISION_CONFLICT' ? 409 : 400
      res.end(JSON.stringify({ ok: false, error: { code: e.code ?? 'STUDIO_ERROR', message: String(e.message) } }))
    }
  }, { prepend: true })
}
