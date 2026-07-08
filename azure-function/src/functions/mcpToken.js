import { app } from '@azure/functions'
import { corsHeaders, getD365Token, keyRejection } from '../shared/auth.js'

// GET /api/mcp-token — same contract as the Vite dev helper: exchanges the
// stored app registration (app settings) for a short-lived bearer token.
// Mostly a convenience/diagnostic endpoint; the /api/mcp proxy injects the
// token itself, so the browser normally never needs to fetch one.
app.http('mcpToken', {
  route: 'mcp-token',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (request) => {
    if (request.method === 'OPTIONS') return { status: 204, headers: corsHeaders() }
    const rejected = keyRejection(request)
    if (rejected) return rejected
    try {
      const { token, exp } = await getD365Token()
      return {
        headers: corsHeaders(),
        jsonBody: {
          access_token: token,
          expires_in: Math.max(0, Math.floor((exp - Date.now()) / 1000)),
        },
      }
    } catch (e) {
      return {
        status: 500,
        headers: corsHeaders(),
        jsonBody: { error: e instanceof Error ? e.message : String(e) },
      }
    }
  },
})
