import { MockProductService } from './mockProductService'
import { LiveProductService } from './liveProductService'
import { ProductService } from './productService'

let mock: MockProductService | null = null

export function getProductService(source: 'mock' | 'live'): ProductService {
  if (source === 'live') return new LiveProductService()
  // keep one mock instance so in-memory edits persist across pages
  if (!mock) mock = new MockProductService()
  return mock
}

export type { ProductService, EnrichPatch } from './productService'
