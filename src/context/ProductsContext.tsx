import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import {
  AuditEntry,
  ColorGroup,
  LegalEntity,
  LifecycleChange,
  ProductStyle,
  SizeGroup,
} from '../models/types'
import { ActionCard } from '../models/chat'
import { getProductService, EnrichPatch } from '../services'
import { useConfig } from './ConfigContext'

interface ProductsCtx {
  loading: boolean
  loadError: string | null
  styles: ProductStyle[]
  entities: LegalEntity[]
  sizeGroups: SizeGroup[]
  colorGroups: ColorGroup[]
  audit: AuditEntry[]
  refresh: () => Promise<void>
  enrichStyle: (styleNumber: string, patch: EnrichPatch) => Promise<ProductStyle>
  addVariants: (
    styleNumber: string,
    sizes: string[],
    colors: string[],
    entityIds: string[],
  ) => Promise<ProductStyle>
  setLifecycle: (styleNumber: string, change: LifecycleChange) => Promise<ProductStyle>
  releaseToEntities: (styleNumber: string, entityIds: string[]) => Promise<ProductStyle>
  revalidate: (styleNumber: string) => Promise<ProductStyle>
  applyCard: (card: ActionCard) => Promise<void>
}

const Ctx = createContext<ProductsCtx | null>(null)

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig()
  const service = useMemo(() => getProductService(config.dataSource), [config.dataSource])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [styles, setStyles] = useState<ProductStyle[]>([])
  const [entities, setEntities] = useState<LegalEntity[]>([])
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([])
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [st, en, sg, cg, au] = await Promise.all([
        service.getStyles(),
        service.getLegalEntities(),
        service.getSizeGroups(),
        service.getColorGroups(),
        service.getAudit(),
      ])
      setStyles(st)
      setEntities(en)
      setSizeGroups(sg)
      setColorGroups(cg)
      setAudit(au)
    } catch (e) {
      setStyles([])
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [service])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const afterMutation = useCallback(
    async (updated: ProductStyle) => {
      setStyles((prev) =>
        prev.map((s) => (s.styleNumber === updated.styleNumber ? updated : s)),
      )
      setAudit(await service.getAudit())
      return updated
    },
    [service],
  )

  const user = config.userName

  const enrichStyle = useCallback(
    async (n: string, patch: EnrichPatch) => afterMutation(await service.enrichStyle(n, patch, user)),
    [service, afterMutation, user],
  )
  const addVariants = useCallback(
    async (n: string, sizes: string[], colors: string[], entityIds: string[]) =>
      afterMutation(await service.addVariants(n, sizes, colors, entityIds, user)),
    [service, afterMutation, user],
  )
  const setLifecycle = useCallback(
    async (n: string, change: LifecycleChange) =>
      afterMutation(await service.setLifecycle(n, change, user)),
    [service, afterMutation, user],
  )
  const releaseToEntities = useCallback(
    async (n: string, entityIds: string[]) =>
      afterMutation(await service.releaseToEntities(n, entityIds, user)),
    [service, afterMutation, user],
  )
  const revalidate = useCallback(
    async (n: string) => afterMutation(await service.revalidate(n, user)),
    [service, afterMutation, user],
  )

  const applyCard = useCallback(
    async (card: ActionCard) => {
      switch (card.kind) {
        case 'enrich': {
          await enrichStyle(card.styleNumber, card.patch)
          await revalidate(card.styleNumber)
          break
        }
        case 'lifecycle':
          await setLifecycle(card.styleNumber, {
            status: card.status2,
            effectiveDate: card.effectiveDate ?? new Date().toISOString(),
          })
          break
        case 'variants':
          await addVariants(card.styleNumber, card.sizes, card.colors, card.entityIds)
          break
        case 'release':
          await releaseToEntities(card.styleNumber, card.entityIds)
          break
        case 'revalidate':
          await revalidate(card.styleNumber)
          break
      }
    },
    [enrichStyle, setLifecycle, addVariants, releaseToEntities, revalidate],
  )

  const value: ProductsCtx = {
    loading,
    loadError,
    styles,
    entities,
    sizeGroups,
    colorGroups,
    audit,
    refresh,
    enrichStyle,
    addVariants,
    setLifecycle,
    releaseToEntities,
    revalidate,
    applyCard,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProducts(): ProductsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProducts outside ProductsProvider')
  return v
}
