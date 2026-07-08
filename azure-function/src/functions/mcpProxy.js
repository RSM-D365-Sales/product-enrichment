import { app } from '@azure/functions'
import { corsHeaders, getD365Token, keyRejection } from '../shared/auth.js'

// POST /api/mcp — forwards MCP JSON-RPC to the Dynamics 365 ERP MCP server.
// Adds the bearer token server-side: uses x-mcp-token if the caller supplied
// one, otherwise mints/caches a token from the stored app registration — so
// the browser needs no credentials at all beyond the optional shared key.
app.http('mcpProxy', {
  route: 'mcp',
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request) => {
    if (request.method === 'OPTIONS') return { status: 204, headers: corsHeaders() }
    const rejected = keyRejection(request)
    if (rejected) return rejected

    try {
      const configured = (process.env.D365_MCP_URL ?? '').trim()
      const requested = (request.headers.get('x-mcp-target') ?? '').trim()
      const target = configured || requested
      let host = ''
      try {
        host = new URL(target).hostname
      } catch {
        /* validated below */
      }
      if (!target.startsWith('https://') || !host.endsWith('.dynamics.com')) {
        return {
          status: 400,
          headers: corsHeaders(),
          jsonBody: {
            error:
              'MCP target must be an https://*.dynamics.com URL — set the D365_MCP_URL app setting (recommended) or send x-mcp-target.',
          },
        }
      }

      let token = (request.headers.get('x-mcp-token') ?? '').trim()
      if (!token) token = (await getD365Token()).token

      const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      }
      const sid = request.headers.get('mcp-session-id')
      if (sid) headers['mcp-session-id'] = sid

      const upstream = await fetch(target, {
        method: 'POST',
        headers,
        body: await request.text(),
      })

      const outHeaders = { ...corsHeaders() }
      const ct = upstream.headers.get('content-type')
      if (ct) outHeaders['content-type'] = ct
      const rsid = upstream.headers.get('mcp-session-id')
      if (rsid) outHeaders['mcp-session-id'] = rsid

      return { status: upstream.status, headers: outHeaders, body: await upstream.text() }
    } catch (e) {
      return {
        status: 502,
        headers: corsHeaders(),
        jsonBody: { error: e instanceof Error ? e.message : String(e) },
      }
    }
  },
})
