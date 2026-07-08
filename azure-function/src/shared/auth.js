// Shared helpers: client-credentials token minting (cached), CORS, and the
// optional shared-key gate. The client id + secret live ONLY in the Function
// App's application settings (or Key Vault references) — never in the SPA.

let cached = null // { token, exp }

/** Mint (or reuse) an Entra ID token for the F&O environment. */
export async function getD365Token() {
  const tenant = process.env.D365_TENANT_ID
  const clientId = process.env.D365_CLIENT_ID
  const secret = process.env.D365_CLIENT_SECRET
  const resource = (process.env.D365_RESOURCE ?? '').replace(/\/+$/, '')
  if (!tenant || !clientId || !secret || !resource) {
    throw new Error(
      'Missing app settings — set D365_TENANT_ID, D365_CLIENT_ID, D365_CLIENT_SECRET and D365_RESOURCE on the Function App.',
    )
  }
  // reuse until 5 minutes before expiry
  if (cached && cached.exp > Date.now() + 5 * 60 * 1000) return cached

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: `${resource}/.default`,
    }).toString(),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? 'Token request failed.')
  }
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return cached
}

/** CORS is handled in-code (not platform CORS) so we can expose the
    mcp-session-id response header, which the MCP session protocol needs. */
export function corsHeaders() {
  return {
    'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers':
      'content-type,x-mcp-target,x-mcp-token,x-proxy-key,mcp-session-id',
    'access-control-expose-headers': 'mcp-session-id',
    'access-control-max-age': '86400',
  }
}

/** Optional shared-key gate: set PROXY_SHARED_KEY on the Function App and the
    same value in the app's Setup page. Skipped when the setting is empty. */
export function keyRejection(request) {
  const expected = (process.env.PROXY_SHARED_KEY ?? '').trim()
  if (!expected) return null
  if ((request.headers.get('x-proxy-key') ?? '').trim() === expected) return null
  return {
    status: 401,
    headers: corsHeaders(),
    jsonBody: { error: 'Missing or wrong x-proxy-key (helper shared key).' },
  }
}
