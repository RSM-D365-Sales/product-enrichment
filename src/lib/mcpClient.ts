// Minimal MCP client (streamable HTTP / JSON-RPC 2.0) for the Dynamics 365
// ERP MCP server. Used because the Foundry workspace rejects the Anthropic
// server-side MCP connector ("mcp_connector not supported in your workspace"),
// so the app bridges MCP itself: list the server's tools, hand them to Claude
// as ordinary tools, execute tool calls here, feed results back.
//
// Browser → D365 directly would hit CORS, so calls are routed through the Vite
// dev server's /api/mcp proxy (vite.config.ts) when available; if the proxy
// isn't there (static hosting), a direct call is attempted and the resulting
// error is surfaced with a pointer to the README.

const PROXY_PATH = '/api/mcp'
const PROTOCOL_VERSION = '2025-03-26'

interface JsonRpcResponse {
  id?: number | string
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export class McpBridge {
  private sessionId: string | null = null
  private nextId = 1
  private initialized: Promise<void> | null = null
  private mode: 'unknown' | 'proxy' | 'direct' = 'unknown'
  private remoteProxy: string | null

  constructor(
    private url: string,
    private token: string,
    proxyBaseUrl = '',
    private proxyKey = '',
  ) {
    const base = proxyBaseUrl.trim().replace(/\/+$/, '')
    this.remoteProxy = base ? `${base}/api/mcp` : null
  }

  private headersFor(base: string): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }
    const viaProxy = base !== this.url
    if (viaProxy) {
      h['x-mcp-target'] = this.url
      if (this.token) h['x-mcp-token'] = this.token
      if (this.proxyKey) h['x-proxy-key'] = this.proxyKey
    } else {
      h.authorization = `Bearer ${this.token}`
    }
    if (this.sessionId) h['mcp-session-id'] = this.sessionId
    return h
  }

  private async post(payload: unknown): Promise<Response> {
    const attempt = (base: string) =>
      fetch(base, { method: 'POST', headers: this.headersFor(base), body: JSON.stringify(payload) })

    // an explicitly configured helper Function is authoritative — no fallback
    if (this.remoteProxy) return attempt(this.remoteProxy)

    if (this.mode === 'direct') return attempt(this.url)
    if (this.mode === 'proxy') return attempt(PROXY_PATH)

    // first call: prefer the dev proxy, fall back to direct if it isn't serving
    try {
      const res = await attempt(PROXY_PATH)
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 404 || res.status === 405 || ct.includes('text/html')) {
        this.mode = 'direct'
        return attempt(this.url)
      }
      this.mode = 'proxy'
      return res
    } catch {
      this.mode = 'direct'
      return attempt(this.url)
    }
  }

  private async parse(res: Response): Promise<JsonRpcResponse | null> {
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid
    const text = await res.text()
    if (!res.ok) {
      throw new Error(
        `MCP endpoint returned ${res.status}: ${text.slice(0, 400) || res.statusText}. ` +
          (res.status === 401 || res.status === 403
            ? 'Check the bearer token (expired?) and that its client ID is on the Allowed MCP clients page in F&O.'
            : ''),
      )
    }
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('text/event-stream')) {
      let last: JsonRpcResponse | null = null
      for (const line of text.split('\n')) {
        const m = line.match(/^data:\s*(.+)$/)
        if (!m) continue
        try {
          const j = JSON.parse(m[1]) as JsonRpcResponse
          if (j && (j.result !== undefined || j.error !== undefined)) last = j
        } catch {
          /* keep scanning */
        }
      }
      return last
    }
    if (!text.trim()) return null // notifications return an empty 202
    return JSON.parse(text) as JsonRpcResponse
  }

  private async rpc(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const id = this.nextId++
    const resp = await this.parse(await this.post({ jsonrpc: '2.0', id, method, params }))
    if (!resp) throw new Error(`MCP: empty response for ${method}`)
    if (resp.error) throw new Error(`MCP ${method} failed: ${resp.error.message}`)
    return resp.result ?? {}
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.rpc('initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'product-enrichment-agent', version: '0.1.0' },
        })
        await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }).then(
          (r) => void r.text().catch(() => undefined),
        )
      })().catch((e) => {
        this.initialized = null // allow retry on next call
        throw e
      })
    }
    return this.initialized
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.ensureInitialized()
    const result = await this.rpc('tools/list', {})
    return (result.tools as McpToolDef[] | undefined) ?? []
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; isError: boolean }> {
    await this.ensureInitialized()
    const result = await this.rpc('tools/call', { name, arguments: args })
    const content = (result.content as Array<Record<string, unknown>> | undefined) ?? []
    const text = content
      .map((c) => (c.type === 'text' ? String(c.text ?? '') : JSON.stringify(c)))
      .join('\n')
    return { text: text || JSON.stringify(result), isError: result.isError === true }
  }
}

/** Used by the Setup page: initialize + list tools, report what's there. */
export async function testMcpConnection(
  url: string,
  token: string,
  proxyBaseUrl = '',
  proxyKey = '',
): Promise<string> {
  const bridge = new McpBridge(url.trim(), token.trim(), proxyBaseUrl, proxyKey)
  const tools = await bridge.listTools()
  const kinds = ['data_', 'form_', 'api_']
    .map((p) => `${tools.filter((t) => t.name.startsWith(p)).length} ${p}*`)
    .join(', ')
  return `${tools.length} tools available (${kinds})`
}
