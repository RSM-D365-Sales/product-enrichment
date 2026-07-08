export type AssistantProvider = 'heuristic' | 'claude-foundry'

export interface FoundryConfig {
  /** Foundry resource host, e.g. "my-resource.services.ai.azure.com" (or the
      short resource name shown in the Foundry portal). */
  resource: string
  /** Optional full base URL override, e.g.
      "https://my-resource.services.ai.azure.com/anthropic/v1". Takes precedence. */
  baseUrl: string
  apiKey: string
  model: string
}

export interface McpConfig {
  enabled: boolean
  /** Dynamics 365 ERP MCP endpoint: https://<environment>.operations.dynamics.com/mcp */
  url: string
  /** Optional manual Entra ID bearer token. Leave empty to let the local dev
      helper or the Azure Function helper mint one from the stored app
      registration. The minting client ID must be listed in the environment's
      "Allowed MCP clients" form. */
  authToken: string
  /** Base URL of the deployed helper Function App
      (e.g. https://my-helper.azurewebsites.net). Empty = use the local Vite
      dev-server helpers. */
  proxyBaseUrl: string
  /** Shared key for the helper (PROXY_SHARED_KEY app setting), sent as x-proxy-key. */
  proxyKey: string
}

export interface AppConfig {
  dataSource: 'mock' | 'live'
  assistant: {
    provider: AssistantProvider
    foundry: FoundryConfig
    mcp: McpConfig
    /** Demo-specific guidance appended to the assistant's system prompt. */
    instructions: string
  }
  stuckDays: number
  horizonDays: number
  userName: string
}

export const DEFAULT_CONFIG: AppConfig = {
  dataSource: 'mock',
  assistant: {
    provider: 'heuristic',
    foundry: {
      resource: '',
      baseUrl: '',
      apiKey: '',
      model: 'claude-opus-4-8',
    },
    mcp: {
      enabled: false,
      url: '',
      authToken: '',
      proxyBaseUrl: '',
      proxyKey: '',
    },
    instructions: '',
  },
  stuckDays: 5,
  horizonDays: 30,
  userName: 'demo.user',
}

const KEY = 'product-enrichment-agent.config.v1'

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      assistant: {
        ...DEFAULT_CONFIG.assistant,
        ...(parsed.assistant ?? {}),
        foundry: {
          ...DEFAULT_CONFIG.assistant.foundry,
          ...(parsed.assistant?.foundry ?? {}),
        },
        mcp: {
          ...DEFAULT_CONFIG.assistant.mcp,
          ...(parsed.assistant?.mcp ?? {}),
        },
      },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(cfg: AppConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}
