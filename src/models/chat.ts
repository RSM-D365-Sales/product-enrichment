import { LifecycleStatus } from './types'
import { EnrichPatch } from '../services/productService'

export type CardStatus = 'proposed' | 'applied' | 'dismissed'

interface CardBase {
  id: string
  title: string
  detail: string
  status: CardStatus
  styleNumber: string
}

export type ActionCard =
  | (CardBase & { kind: 'enrich'; patch: EnrichPatch })
  | (CardBase & { kind: 'lifecycle'; status2: LifecycleStatus; effectiveDate?: string })
  | (CardBase & { kind: 'variants'; sizes: string[]; colors: string[]; entityIds: string[] })
  | (CardBase & { kind: 'release'; entityIds: string[] })
  | (CardBase & { kind: 'revalidate' })

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: boolean
  cards: ActionCard[]
}

export const CARD_KIND_LABEL: Record<ActionCard['kind'], string> = {
  enrich: 'Enrich product data',
  lifecycle: 'Lifecycle change',
  variants: 'Add size / color',
  release: 'Release to legal entity',
  revalidate: 'Revalidate',
}
