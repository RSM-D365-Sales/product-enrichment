// Claude on Microsoft Foundry — the "live discussion" transport.
//
// Uses the official Anthropic Foundry SDK (@anthropic-ai/foundry-sdk) against
// an Azure AI Foundry resource that serves Claude via the Anthropic Messages
// API (https://<resource>.services.ai.azure.com/anthropic/v1).
//
// A manual tool loop (not the SDK tool runner) is used deliberately: mutating
// tools must NOT auto-execute — they produce human-in-the-loop ActionCards the
// user confirms in the side panel, and the model is told the proposal is
// pending. Read-only tools run immediately against the same aggregation logic
// as the dashboard, so every number is grounded.
//
// BYO-key demo pattern: the key entered in Setup is kept in localStorage and
// used directly from the browser. For production, front the call with an Azure
// Function / APIM proxy that holds the key server-side (see README).

import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk'
import { ActionCard } from '../models/chat'
import { FoundryConfig, McpConfig } from '../models/config'
import { executeTool, TOOL_DEFS, ToolContext } from './agentTools'
import { McpBridge, McpToolDef } from './mcpClient'

// D365 flows chain discovery → metadata → CRUD, so allow a deeper loop.
const MAX_TOOL_ROUNDS = 16

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface FoundryTurnCallbacks {
  onText: (delta: string) => void
  onCard: (card: ActionCard) => void
  onToolCall?: (name: string) => void
}

export interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

/** Guidance distilled from Microsoft's recommended agent instructions for the
    Dynamics 365 ERP MCP server, plus a conversational confirm gate: MCP tools
    execute server-side immediately, so the model must get an explicit yes in
    chat before any create/update/delete against the live environment. */
const D365_MCP_GUIDANCE = [
  '',
  'Dynamics 365 ERP MCP (live F&SC environment) is connected. Its tools come in three kinds: data_* (OData CRUD via data entities), form_* (drive application forms like a user), api_* (invoke X++ actions).',
  '',
  'Routing: when the user asks to create, update, or look up anything in Dynamics / D365 — or mentions an item number that is not in this workspace\'s local dataset — use the D365 MCP tools (data_*, form_*, api_*). The workspace tools (get_style_details, search_styles, …) only cover this app\'s local sample data. If unsure which the user means, check the workspace first, then D365, and always say which source a number came from.',
  '',
  'Method:',
  '- Prefer data tools for create/read/update/delete; fall back to form tools only when the operation is not available through data entities.',
  '- Discover before acting: call data_find_entity_type, then data_get_entity_metadata, before any CRUD tool. Use PLURAL entity collection names in OData paths (e.g. ReleasedProductsV2). Deep inserts are not supported — create parent records first, then children.',
  '- Query before create: read the current state first (does the record already exist? which company/dataAreaId applies?) so you never create duplicates.',
  '- For enum filters/values use: $filter=Field has Namespace.EnumType\'Value\'.',
  '',
  'Product dimension work (adding a color or size to an item):',
  '1. Find the item in released products by item number; note its product master number, company, and dimension groups.',
  '2. Read its existing dimension values (product master colors/sizes) so you do not duplicate one.',
  '3. If the new color/size value does not exist in the global color/size table, create it there first.',
  '4. Add the value to the product master\'s dimension range (product master colors/sizes entity).',
  '5. If sellable variants are wanted, create the product variants for the new combinations and release them to the requested companies.',
  '6. Re-query and report what now exists, so the user sees verified results — never claim success without reading it back.',
  '',
  'Write gate: D365 MCP tools execute IMMEDIATELY — there is no confirmation card for them. Before writing, present the full plan ONCE (entities, key field values, company) and wait for an explicit yes. After approval, execute every step of the approved plan without re-asking for each tool call, then report the verified result. Reads never need approval.',
].join('\n')

function systemPrompt(ctx: ToolContext, mcpActive: boolean, extraInstructions?: string): string {
  return [
    'You are the Product Enrichment Assistant inside the Product Validation & Enrichment Workspace — a dashboard where merchandising operations validate, enrich, and release product styles imported from the PLM into Microsoft Dynamics 365 F&SC before they flow to sourcing, inventory and order fulfillment.',
    '',
    `Legal entities: ${ctx.entities.map((e) => `${e.id} (${e.name})`).join(', ')}.`,
    `Size groups: ${ctx.sizeGroups.map((g) => `${g.id}: ${g.sizes.join('/')}`).join(' · ')}.`,
    `Color groups: ${ctx.colorGroups.map((g) => `${g.id}: ${g.colors.join('/')}`).join(' · ')}.`,
    '',
    'Grounding rules:',
    '- Answer questions about styles, validation issues, lifecycle and audit history ONLY from tool results. Never invent style numbers, counts, or field values.',
    '- Mutating tools (suggest_enrichment, set_lifecycle, add_variants, release_style) do not change data; they create a proposal card the user must confirm in the side panel. After proposing, tell the user to review and confirm the card — never claim the change is applied.',
    '- Style numbers look like V826-4101. If the user gives a name instead, use search_styles first.',
    '- Future-dated lifecycle changes drive season launches (new → active on a date) and planned retirements (active → retired on a date).',
    '',
    'Style: plain text only — no markdown headers, no tables, no bullets other than a simple "•". Keep answers short and specific; lead with the answer, then at most a few supporting lines. Offer a next step when useful.',
    `Today is ${new Date().toDateString()}.`,
    mcpActive ? D365_MCP_GUIDANCE : '',
    extraInstructions?.trim()
      ? `\nOperator instructions (from Setup — follow these for this demo):\n${extraInstructions.trim()}`
      : '',
  ].join('\n')
}

/** The SDK expects the bare resource NAME and builds
    https://<name>.services.ai.azure.com/anthropic/ itself — accept a pasted
    full host or URL too and reduce it to the name. */
function normalizeResource(input: string): string {
  let r = input.trim().replace(/^https?:\/\//i, '')
  r = r.split('/')[0] // drop any path (e.g. /api/projects/...)
  return r.replace(/\.services\.ai\.azure\.com$/i, '')
}

/** The SDK appends v1/messages to the base URL, so an override should end at
    /anthropic/ — strip a trailing /v1 if the user pasted the full path. */
function normalizeBaseUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '')
  u = u.replace(/\/v1$/i, '')
  return `${u}/`
}

export function makeFoundryClient(cfg: FoundryConfig): AnthropicFoundry {
  const opts: Record<string, unknown> = {
    apiKey: cfg.apiKey,
    dangerouslyAllowBrowser: true,
  }
  if (cfg.baseUrl.trim()) opts.baseURL = normalizeBaseUrl(cfg.baseUrl)
  else opts.resource = normalizeResource(cfg.resource)
  return new AnthropicFoundry(opts as ConstructorParameters<typeof AnthropicFoundry>[0])
}

/** Minimal structural view of a MessageStream. */
interface StreamHandle {
  on(event: 'text', cb: (delta: string) => void): unknown
  finalMessage(): Promise<{ stop_reason: string | null; content: Array<{ type: string }> }>
}

// The MCP bridge + discovered tool list is cached per url|token so the
// initialize/tools-list handshake runs once, not per turn.
let cachedMcp: { key: string; bridge: McpBridge; tools: McpToolDef[] } | null = null

async function getMcpBridge(mcp: McpConfig) {
  const key = [mcp.url, mcp.authToken, mcp.proxyBaseUrl, mcp.proxyKey].map((s) => s.trim()).join('|')
  if (cachedMcp?.key === key) return cachedMcp
  const bridge = new McpBridge(mcp.url.trim(), mcp.authToken.trim(), mcp.proxyBaseUrl, mcp.proxyKey)
  const tools = await bridge.listTools()
  cachedMcp = { key, bridge, tools }
  return cachedMcp
}

/** Convert MCP tool definitions to Anthropic tool definitions. */
function toAnthropicTools(tools: McpToolDef[]): Array<Record<string, unknown>> {
  const localNames = new Set(TOOL_DEFS.map((t) => t.name))
  return tools
    .filter((t) => !localNames.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description || `Dynamics 365 ERP MCP tool ${t.name}`,
      input_schema:
        t.inputSchema && (t.inputSchema as { type?: string }).type === 'object'
          ? t.inputSchema
          : { type: 'object', properties: {}, ...(t.inputSchema ?? {}) },
    }))
}

/** Run one conversational turn (streaming, with tool use). Returns the final text.
    When the Dynamics 365 ERP MCP is configured, the app itself bridges MCP:
    the server's tools are merged into Claude's tool list and executed
    client-side (via the dev-server proxy to avoid CORS). The Foundry
    workspace's server-side mcp_connector is not required. */
export async function runFoundryTurn(
  cfg: FoundryConfig,
  mcp: McpConfig | undefined,
  instructions: string | undefined,
  history: HistoryEntry[],
  userText: string,
  ctx: ToolContext,
  cb: FoundryTurnCallbacks,
): Promise<string> {
  const client = makeFoundryClient(cfg)
  // token is optional: the local dev helper or the Azure Function helper can
  // mint one server-side from the stored app registration
  const mcpActive = !!(mcp?.enabled && mcp.url.trim())

  let mcpBridge: McpBridge | null = null
  let mcpTools: Array<Record<string, unknown>> = []
  if (mcpActive) {
    const b = await getMcpBridge(mcp!)
    mcpBridge = b.bridge
    mcpTools = toAnthropicTools(b.tools)
  }
  const mcpToolNames = new Set(mcpTools.map((t) => t.name as string))
  const allTools = [...TOOL_DEFS, ...mcpTools]

  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userText },
  ]

  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: cfg.model || 'claude-opus-4-8',
      max_tokens: 16000,
      system: systemPrompt(ctx, mcpActive, instructions),
      messages: messages as never,
      tools: allTools as never,
    }) as unknown as StreamHandle

    stream.on('text', (delta: string) => {
      finalText += delta
      cb.onText(delta)
    })

    const message = await stream.finalMessage()

    if (message.stop_reason === 'pause_turn') {
      // server-side pause — resend to continue
      messages.push({ role: 'assistant', content: message.content })
      continue
    }

    if (message.stop_reason !== 'tool_use') break

    const toolUses = (message.content as Array<{ type: string }>).filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    )
    if (toolUses.length === 0) break

    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        cb.onToolCall?.(tu.name)
        if (mcpBridge && mcpToolNames.has(tu.name)) {
          try {
            const r = await mcpBridge.callTool(tu.name, tu.input ?? {})
            return {
              type: 'tool_result' as const,
              tool_use_id: tu.id,
              content: r.text,
              ...(r.isError ? { is_error: true } : {}),
            }
          } catch (e) {
            return {
              type: 'tool_result' as const,
              tool_use_id: tu.id,
              content: `D365 MCP call failed: ${e instanceof Error ? e.message : String(e)}`,
              is_error: true,
            }
          }
        }
        const outcome = executeTool(tu.name, tu.input ?? {}, ctx)
        if (outcome.card) cb.onCard(outcome.card)
        return {
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: outcome.result,
        }
      }),
    )

    // echo assistant turn (incl. tool_use blocks), then ALL results in ONE user message
    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: toolResults })
  }

  return finalText
}

/** Cheap connectivity check used by the Setup page. */
export async function testFoundryConnection(cfg: FoundryConfig): Promise<string> {
  const client = makeFoundryClient(cfg)
  const res = await client.messages.create({
    model: cfg.model || 'claude-opus-4-8',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Reply with the single word: connected' }],
  })
  const text = res.content
    .map((b: { type: string }) => (b.type === 'text' ? (b as { type: 'text'; text: string }).text : ''))
    .join('')
    .trim()
  return `${res.model}: ${text || '(no text)'}`
}
