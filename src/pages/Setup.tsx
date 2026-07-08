import { useState } from 'react'
import { useConfig } from '../context/ConfigContext'
import { useProducts } from '../context/ProductsContext'
import { testFoundryConnection } from '../lib/foundryAgent'
import { testMcpConnection } from '../lib/mcpClient'
import { AssistantProvider } from '../models/config'

export default function Setup() {
  const { config, replace } = useConfig()
  const { entities } = useProducts()
  const [draft, setDraft] = useState(config)
  const [testState, setTestState] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mcpTokenState, setMcpTokenState] = useState<string | null>(null)
  const [mcpTesting, setMcpTesting] = useState(false)

  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
  }
  const setFoundry = (patch: Partial<typeof draft.assistant.foundry>) =>
    set({
      assistant: {
        ...draft.assistant,
        foundry: { ...draft.assistant.foundry, ...patch },
      },
    })
  const setMcp = (patch: Partial<typeof draft.assistant.mcp>) =>
    set({
      assistant: {
        ...draft.assistant,
        mcp: { ...draft.assistant.mcp, ...patch },
      },
    })

  const save = () => {
    replace(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  const runMcpTest = async () => {
    setMcpTesting(true)
    setMcpTokenState('Connecting to the MCP server…')
    try {
      const summary = await testMcpConnection(
        draft.assistant.mcp.url,
        draft.assistant.mcp.authToken,
        draft.assistant.mcp.proxyBaseUrl,
        draft.assistant.mcp.proxyKey,
      )
      setMcpTokenState(`✓ MCP connected — ${summary}`)
    } catch (e) {
      setMcpTokenState(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setMcpTesting(false)
    }
  }

  const fetchDevToken = async () => {
    setMcpTokenState('Fetching…')
    const remoteBase = draft.assistant.mcp.proxyBaseUrl.trim().replace(/\/+$/, '')
    try {
      const headers: Record<string, string> = {}
      if (remoteBase && draft.assistant.mcp.proxyKey.trim())
        headers['x-proxy-key'] = draft.assistant.mcp.proxyKey.trim()
      const r = await fetch(remoteBase ? `${remoteBase}/api/mcp-token` : '/api/mcp-token', {
        headers,
      })
      const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string }
      if (!r.ok || !j.access_token) throw new Error(j.error ?? 'Token request failed.')
      setMcp({ authToken: j.access_token })
      setMcpTokenState(
        `✓ Token fetched — valid ~${Math.round((j.expires_in ?? 3600) / 60)} min. Remember to save settings.`,
      )
    } catch (e) {
      setMcpTokenState(
        `✗ ${e instanceof Error ? e.message : String(e)} — needs the local dev helper (npm run dev + .env.local) or a helper Function URL below.`,
      )
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestState(null)
    try {
      const res = await testFoundryConnection(draft.assistant.foundry)
      setTestState(`✓ Connected — ${res}`)
    } catch (e) {
      setTestState(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className="eyebrow">Configuration</div>
      <h1 className="page-title">Setup</h1>
      <p className="page-sub">
        Data source, assistant transport and workspace thresholds. Settings persist in this
        browser only.
      </p>

      <div className="setup-grid">
        <section className="card">
          <div className="card-title">Data source</div>
          <label className="field">
            Source
            <select
              value={draft.dataSource}
              onChange={(e) => set({ dataSource: e.target.value as 'mock' | 'live' })}
            >
              <option value="mock">Sample data (bundled, deterministic)</option>
              <option value="live">Live D365 F&amp;SC (documented stub)</option>
            </select>
          </label>
          <div className="hint">
            The live option is a documented stub — the service seam maps to EcoResProductMasterV2 /
            EcoResReleasedProductV2 / variant release OData entities. See the README for the
            integration runbook.
          </div>
          <label className="field">
            Stuck-in-review threshold (days)
            <input
              type="number"
              min={1}
              value={draft.stuckDays}
              onChange={(e) => set({ stuckDays: Number(e.target.value) || 5 })}
            />
          </label>
          <label className="field">
            Launch / retirement horizon (days)
            <input
              type="number"
              min={7}
              value={draft.horizonDays}
              onChange={(e) => set({ horizonDays: Number(e.target.value) || 30 })}
            />
          </label>
          <label className="field">
            Your name (audit trail)
            <input
              type="text"
              value={draft.userName}
              onChange={(e) => set({ userName: e.target.value })}
            />
          </label>

          <div className="card-title" style={{ marginTop: 10 }}>Legal entities</div>
          <div className="hint">
            {entities.map((e) => `${e.id} — ${e.name} (${e.region})`).join(' · ') ||
              'Loaded from the data source.'}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Assistant</div>
          <label className="field">
            Transport
            <select
              value={draft.assistant.provider}
              onChange={(e) =>
                set({
                  assistant: {
                    ...draft.assistant,
                    provider: e.target.value as AssistantProvider,
                  },
                })
              }
            >
              <option value="heuristic">Offline heuristic (no key needed)</option>
              <option value="claude-foundry">Claude on Microsoft Foundry</option>
            </select>
          </label>

          <div className="hint">
            The Foundry transport talks to Claude through your Azure AI Foundry resource's
            Anthropic endpoint (https://&lt;resource&gt;.services.ai.azure.com/anthropic/v1) with
            streaming and tool calling. The key is stored in this browser and sent directly —
            fine for a demo; for production put an Azure Function / APIM proxy in front so the key
            stays server-side.
          </div>

          <label className="field">
            Foundry resource name
            <input
              type="text"
              placeholder="my-resource (pasting the full host or URL is fine too)"
              value={draft.assistant.foundry.resource}
              onChange={(e) => setFoundry({ resource: e.target.value })}
            />
          </label>
          <label className="field">
            Base URL override (optional — takes precedence, e.g. a proxy)
            <input
              type="text"
              placeholder="https://my-resource.services.ai.azure.com/anthropic/"
              value={draft.assistant.foundry.baseUrl}
              onChange={(e) => setFoundry({ baseUrl: e.target.value })}
            />
          </label>
          <label className="field">
            API key
            <input
              type="password"
              placeholder="Foundry API key"
              value={draft.assistant.foundry.apiKey}
              onChange={(e) => setFoundry({ apiKey: e.target.value })}
            />
          </label>
          <label className="field">
            Model (deployment)
            <input
              type="text"
              value={draft.assistant.foundry.model}
              onChange={(e) => setFoundry({ model: e.target.value })}
            />
          </label>
          <label className="field">
            Agent instructions (appended to the system prompt)
            <textarea
              rows={6}
              placeholder={
                'Demo-specific guidance the agent should follow, e.g.\n' +
                'Default company is USMF. Item numbers look like V170813201.\n' +
                'When I ask for a new color on an item, add it to the color range and create/release variants for all existing sizes unless I say otherwise.'
              }
              value={draft.assistant.instructions}
              onChange={(e) =>
                set({ assistant: { ...draft.assistant, instructions: e.target.value } })
              }
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn"
              disabled={testing || !draft.assistant.foundry.apiKey}
              onClick={() => void runTest()}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testState ? (
              <span
                className="hint"
                style={{
                  color: testState.startsWith('✓')
                    ? 'var(--status-good-text)'
                    : 'var(--status-critical-text)',
                }}
              >
                {testState}
              </span>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Dynamics 365 ERP MCP (Finance &amp; Supply Chain)</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={draft.assistant.mcp.enabled}
              onChange={(e) => setMcp({ enabled: e.target.checked })}
            />
            Attach the D365 ERP MCP server to the Claude assistant
          </label>
          <div className="hint">
            The app bridges MCP itself: it reads the server's tool list (data_* OData CRUD,
            form_*, api_*) and gives those tools to Claude, executing calls client-side — no
            Foundry-side MCP support needed. Calls route through the local dev server
            (<code>npm run dev</code>) to avoid CORS. Writes execute immediately — the assistant
            is instructed to present its plan and get your explicit yes in chat first, so keep
            this pointed at a sandbox.
          </div>
          <label className="field">
            MCP endpoint URL
            <input
              type="text"
              placeholder="https://<environment>.operations.dynamics.com/mcp"
              value={draft.assistant.mcp.url}
              onChange={(e) => setMcp({ url: e.target.value })}
            />
          </label>
          <label className="field">
            Helper Function base URL (optional — for deployed sites)
            <input
              type="text"
              placeholder="https://my-helper.azurewebsites.net"
              value={draft.assistant.mcp.proxyBaseUrl}
              onChange={(e) => setMcp({ proxyBaseUrl: e.target.value })}
            />
          </label>
          <label className="field">
            Helper shared key (PROXY_SHARED_KEY, optional)
            <input
              type="password"
              placeholder="sent as x-proxy-key"
              value={draft.assistant.mcp.proxyKey}
              onChange={(e) => setMcp({ proxyKey: e.target.value })}
            />
          </label>
          <label className="field">
            Entra ID bearer token (optional — leave empty to let the helper mint one)
            <input
              type="password"
              placeholder="empty = auto-mint via dev helper / Azure Function"
              value={draft.assistant.mcp.authToken}
              onChange={(e) => setMcp({ authToken: e.target.value })}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => void fetchDevToken()}>
              Fetch token (local dev helper)
            </button>
            <button
              className="btn"
              disabled={mcpTesting || !draft.assistant.mcp.url.trim()}
              onClick={() => void runMcpTest()}
            >
              {mcpTesting ? 'Testing…' : 'Test MCP connection'}
            </button>
            {mcpTokenState ? (
              <span
                className="hint"
                style={{
                  color: mcpTokenState.startsWith('✓')
                    ? 'var(--status-good-text)'
                    : 'var(--status-critical-text)',
                }}
              >
                {mcpTokenState}
              </span>
            ) : null}
          </div>
          <div className="hint">
            The dev helper exchanges the app ID + client secret from <code>.env.local</code>
            (gitignored) for a token inside the Vite dev server — the secret never reaches the
            browser bundle. It works on <code>npm run dev</code> only; on a static host (GitHub
            Pages) paste a token manually or point a small Azure Function at this button's URL.
          </div>
          <div className="hint">
            Prerequisites in F&amp;O: version 10.0.47+ (or 10.0.46 PQU-2 / 10.0.45 PQU-7), the
            “Dynamics 365 ERP Model Context Protocol server” feature enabled, Tier 2+ or Unified
            Developer environment — and the client ID that mints this token must be added on the
            <strong> Allowed MCP clients</strong> page with Allowed = Yes.
            <br />
            <br />
            Quick token for a demo (Azure CLI client ID 04b07795-8ddb-461a-bbee-02f9e1bf7b46 must
            be on the allowed list):
            <br />
            <code>az account get-access-token --resource https://&lt;environment&gt;.operations.dynamics.com</code>
            <br />
            Tokens expire after ~60–90 minutes — paste a fresh one when calls start failing with
            401.
          </div>
        </section>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn primary" onClick={save}>
          Save settings
        </button>
        {saved ? <span className="hint" style={{ color: 'var(--status-good-text)' }}>Saved.</span> : null}
      </div>
    </div>
  )
}
