import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react'
import { ActionCard, ChatMessage } from '../models/chat'
import { ToolContext } from '../lib/agentTools'
import { runHeuristicAgent } from '../lib/heuristicAgent'
import { runFoundryTurn } from '../lib/foundryAgent'
import { useConfig } from './ConfigContext'
import { useProducts } from './ProductsContext'

interface ChatCtx {
  messages: ChatMessage[]
  busy: boolean
  providerLabel: string
  send: (text: string) => Promise<void>
  confirmCard: (messageId: string, cardId: string) => Promise<void>
  dismissCard: (messageId: string, cardId: string) => void
  clear: () => void
}

const Ctx = createContext<ChatCtx | null>(null)

let msgSeq = 1
const mid = () => `m-${Date.now()}-${msgSeq++}`

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  content:
    'I watch the styles imported from PLM and help you validate, enrich, and release them. Ask for a summary, dig into a style number, or have me draft fixes — every change becomes a card you confirm.',
  cards: [],
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig()
  const products = useProducts()
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const toolCtx = useMemo<ToolContext>(
    () => ({
      styles: products.styles,
      entities: products.entities,
      sizeGroups: products.sizeGroups,
      colorGroups: products.colorGroups,
      audit: products.audit,
      stuckDays: config.stuckDays,
      horizonDays: config.horizonDays,
    }),
    [products.styles, products.entities, products.sizeGroups, products.colorGroups, products.audit, config.stuckDays, config.horizonDays],
  )

  const useFoundry =
    config.assistant.provider === 'claude-foundry' &&
    !!config.assistant.foundry.apiKey &&
    !!(config.assistant.foundry.resource || config.assistant.foundry.baseUrl)

  const mcpActive =
    useFoundry && config.assistant.mcp.enabled && !!config.assistant.mcp.url.trim()

  const providerLabel = useFoundry
    ? `Claude · Microsoft Foundry (${config.assistant.foundry.model})${mcpActive ? ' + D365 ERP MCP' : ''}`
    : 'Heuristic · offline'

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busyRef.current) return
      busyRef.current = true
      setBusy(true)

      const userMsg: ChatMessage = { id: mid(), role: 'user', content: trimmed, cards: [] }
      const asstId = mid()
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: asstId, role: 'assistant', content: '', streaming: true, cards: [] },
      ])

      try {
        if (useFoundry) {
          // history for the model = plain text turns so far (excluding greeting + current)
          const history = messages
            .filter((m) => m.id !== 'greeting' && m.content.trim())
            .map((m) => ({ role: m.role, content: m.content }))
          let acc = ''
          const cards: ActionCard[] = []
          const final = await runFoundryTurn(
            config.assistant.foundry,
            config.assistant.mcp,
            config.assistant.instructions,
            history,
            trimmed,
            toolCtx,
            {
              onText: (delta) => {
                acc += delta
                patchMessage(asstId, { content: acc })
              },
              onCard: (card) => {
                cards.push(card)
                patchMessage(asstId, { cards: [...cards] })
              },
            },
          )
          patchMessage(asstId, {
            content: final || acc || 'Done.',
            cards: [...cards],
            streaming: false,
          })
        } else {
          const { reply, cards } = runHeuristicAgent(trimmed, toolCtx)
          patchMessage(asstId, { content: reply, cards, streaming: false })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        patchMessage(asstId, {
          streaming: false,
          error: true,
          content:
            `The Claude (Microsoft Foundry) call failed: ${msg}\n\n` +
            'Check the resource/base URL, API key and model deployment in Setup — or switch the assistant back to the offline mode. ' +
            'If this is a CORS error, route the call through a small server-side proxy (see README).',
        })
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [messages, useFoundry, config.assistant.foundry, toolCtx, patchMessage],
  )

  const confirmCard = useCallback(
    async (messageId: string, cardId: string) => {
      const message = messages.find((m) => m.id === messageId)
      const card = message?.cards.find((c) => c.id === cardId)
      if (!card || card.status !== 'proposed') return
      try {
        await products.applyCard(card)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  cards: m.cards.map((c) =>
                    c.id === cardId ? { ...c, status: 'applied' as const } : c,
                  ),
                }
              : m,
          ),
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((prev) => [
          ...prev,
          {
            id: mid(),
            role: 'assistant',
            content: `Could not apply "${card.title}": ${msg}`,
            error: true,
            cards: [],
          },
        ])
      }
    },
    [messages, products],
  )

  const dismissCard = useCallback((messageId: string, cardId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              cards: m.cards.map((c) =>
                c.id === cardId && c.status === 'proposed'
                  ? { ...c, status: 'dismissed' as const }
                  : c,
              ),
            }
          : m,
      ),
    )
  }, [])

  const clear = useCallback(() => setMessages([GREETING]), [])

  return (
    <Ctx.Provider value={{ messages, busy, providerLabel, send, confirmCard, dismissCard, clear }}>
      {children}
    </Ctx.Provider>
  )
}

export function useChat(): ChatCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat outside ChatProvider')
  return v
}
