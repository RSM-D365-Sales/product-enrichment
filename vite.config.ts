import { defineConfig, loadEnv, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// Dev-only helpers for the Dynamics 365 ERP MCP connection. Production
// deployments use the Azure Function in azure-function/ instead — it exposes
// the same two endpoints (/api/mcp-token, /api/mcp) with the same contract.
// ---------------------------------------------------------------------------

let devTokenCache: { token: string; exp: number } | null = null

/** Client-credentials exchange using .env.local (gitignored) — server-side in
    the Vite dev server, so the client secret never reaches the browser. */
async function mintD365Token(env: Record<string, string>): Promise<{ token: string; expiresIn: number }> {
  const tenant = env.D365_TENANT_ID
  const clientId = env.D365_CLIENT_ID
  const secret = env.D365_CLIENT_SECRET
  const resource = (env.D365_RESOURCE ?? '').replace(/\/+$/, '')
  if (!tenant || !clientId || !secret || !resource) {
    throw new Error(
      'Set D365_TENANT_ID, D365_CLIENT_ID, D365_CLIENT_SECRET and D365_RESOURCE in .env.local, then restart `npm run dev`.',
    )
  }
  if (devTokenCache && devTokenCache.exp > Date.now() + 5 * 60 * 1000) {
    return {
      token: devTokenCache.token,
      expiresIn: Math.floor((devTokenCache.exp - Date.now()) / 1000),
    }
  }
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: `${resource}/.default`,
    }).toString(),
  })
  const json = (await r.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!r.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? 'Token request failed.')
  }
  devTokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return { token: json.access_token, expiresIn: json.expires_in ?? 3600 }
}

/** GET /api/mcp-token — hands the browser a short-lived token (Setup button). */
function mcpTokenDevEndpoint(env: Record<string, string>): Plugin {
  return {
    name: 'mcp-token-dev-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mcp-token', (_req, res) => {
        void (async () => {
          res.setHeader('content-type', 'application/json')
          try {
            const { token, expiresIn } = await mintD365Token(env)
            res.end(JSON.stringify({ access_token: token, expires_in: expiresIn }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
          }
        })()
      })
    },
  }
}

/**
 * POST /api/mcp — CORS proxy for the D365 ERP MCP server. Forwards JSON-RPC
 * from the MCP bridge (src/lib/mcpClient.ts) with the bearer token attached;
 * if the browser didn't supply one (x-mcp-token), a token is minted from
 * .env.local automatically. Targets restricted to *.dynamics.com.
 */
function mcpProxyDevEndpoint(env: Record<string, string>): Plugin {
  return {
    name: 'mcp-proxy-dev-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mcp', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('POST only')
            return
          }
          const target = String(req.headers['x-mcp-target'] ?? '')
          let host = ''
          try {
            host = new URL(target).hostname
          } catch {
            /* handled below */
          }
          if (!target.startsWith('https://') || !host.endsWith('.dynamics.com')) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'x-mcp-target must be an https://*.dynamics.com URL' }))
            return
          }
          let token = String(req.headers['x-mcp-token'] ?? '')
          if (!token) token = (await mintD365Token(env)).token
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${token}`,
          }
          const sid = req.headers['mcp-session-id']
          if (sid) headers['mcp-session-id'] = String(sid)
          const upstream = await fetch(target, {
            method: 'POST',
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
          res.statusCode = upstream.status
          const ct = upstream.headers.get('content-type')
          if (ct) res.setHeader('content-type', ct)
          const rsid = upstream.headers.get('mcp-session-id')
          if (rsid) res.setHeader('mcp-session-id', rsid)
          res.end(await upstream.text())
        })().catch((e) => {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        })
      })
    },
  }
}

// Relative base so the built app deploys to any static path (GitHub Pages etc.),
// same convention as the Consignment / Popup platform apps.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [react(), mcpTokenDevEndpoint(env), mcpProxyDevEndpoint(env)],
  }
})
