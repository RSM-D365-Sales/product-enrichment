import {
  AuditEntry,
  ColorGroup,
  LegalEntity,
  LifecycleChange,
  ProductStyle,
  SizeGroup,
} from '../models/types'
import { COLOR_GROUPS, LEGAL_ENTITIES, MOCK_AUDIT, MOCK_STYLES, SIZE_GROUPS } from '../data/mockData'
import { revalidated } from '../lib/validation'
import { EnrichPatch, ProductService } from './productService'

const wait = (ms = 160) => new Promise((r) => setTimeout(r, ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export class MockProductService implements ProductService {
  readonly live = false
  private styles = new Map<string, ProductStyle>(
    clone(MOCK_STYLES).map((s: ProductStyle) => [s.styleNumber, s]),
  )
  private audit: AuditEntry[] = clone(MOCK_AUDIT)
  private auditSeq = 1000

  private log(styleNumber: string, user: string, action: AuditEntry['action'], detail: string) {
    this.audit.unshift({
      id: `a-${this.auditSeq++}`,
      ts: new Date().toISOString(),
      styleNumber,
      user,
      action,
      detail,
    })
  }

  private must(styleNumber: string): ProductStyle {
    const s = this.styles.get(styleNumber.toUpperCase())
    if (!s) throw new Error(`Style ${styleNumber} was not found in the workspace.`)
    return s
  }

  private commit(s: ProductStyle): ProductStyle {
    const next = revalidated(s)
    if (next.validationStatus === 'passed' && next.reviewState === 'in-review') {
      next.reviewState = 'approved'
    }
    this.styles.set(next.styleNumber, next)
    return clone(next)
  }

  async getStyles(): Promise<ProductStyle[]> {
    await wait()
    return clone([...this.styles.values()])
  }
  async getLegalEntities(): Promise<LegalEntity[]> {
    return clone(LEGAL_ENTITIES)
  }
  async getSizeGroups(): Promise<SizeGroup[]> {
    return clone(SIZE_GROUPS)
  }
  async getColorGroups(): Promise<ColorGroup[]> {
    return clone(COLOR_GROUPS)
  }
  async getAudit(styleNumber?: string): Promise<AuditEntry[]> {
    await wait(80)
    return clone(
      styleNumber ? this.audit.filter((a) => a.styleNumber === styleNumber) : this.audit,
    )
  }

  async enrichStyle(styleNumber: string, patch: EnrichPatch, user: string): Promise<ProductStyle> {
    await wait()
    const s = this.must(styleNumber)
    const changed: string[] = []
    if (patch.vendor !== undefined) ((s.vendor = patch.vendor), changed.push(`Vendor = ${patch.vendor}`))
    if (patch.countryOfOrigin !== undefined)
      ((s.countryOfOrigin = patch.countryOfOrigin), changed.push(`Country of origin = ${patch.countryOfOrigin}`))
    if (patch.htsCode !== undefined) ((s.htsCode = patch.htsCode), changed.push(`HTS code = ${patch.htsCode}`))
    if (patch.description !== undefined) ((s.description = patch.description), changed.push('Description updated'))
    if (patch.sizes !== undefined) {
      s.sizes = patch.sizes
      this.rebuildVariants(s)
      changed.push(`Size range = ${patch.sizes.join(', ') || '(none)'}`)
    }
    if (patch.colors !== undefined) {
      s.colors = patch.colors
      this.rebuildVariants(s)
      changed.push(`Color range = ${patch.colors.join(', ') || '(none)'}`)
    }
    if (changed.length) this.log(s.styleNumber, user, 'field-updated', changed.join(' · '))
    return this.commit(s)
  }

  private rebuildVariants(s: ProductStyle) {
    const now = new Date().toISOString()
    const existing = new Map(s.variants.map((v) => [`${v.size}|${v.color}`, v]))
    s.variants = []
    for (const size of s.sizes)
      for (const color of s.colors)
        s.variants.push(
          existing.get(`${size}|${color}`) ?? { size, color, releasedTo: [], addedAt: now },
        )
  }

  async addVariants(
    styleNumber: string,
    sizes: string[],
    colors: string[],
    entityIds: string[],
    user: string,
  ): Promise<ProductStyle> {
    await wait()
    const s = this.must(styleNumber)
    const group = SIZE_GROUPS.find((g) => g.id === s.sizeGroup)
    const cgroup = COLOR_GROUPS.find((g) => g.id === s.colorGroup)
    for (const size of sizes)
      if (group && !group.sizes.includes(size))
        throw new Error(`Size "${size}" is not part of size group ${group.name}.`)
    for (const color of colors)
      if (cgroup && !cgroup.colors.includes(color))
        throw new Error(`Color "${color}" is not part of color group ${cgroup.name}.`)

    const newSizes = sizes.filter((x) => !s.sizes.includes(x))
    const newColors = colors.filter((x) => !s.colors.includes(x))
    s.sizes = [...s.sizes, ...newSizes]
    s.colors = [...s.colors, ...newColors]
    this.rebuildVariants(s)
    if (entityIds.length) {
      for (const v of s.variants)
        if (
          (newSizes.includes(v.size) || newColors.includes(v.color)) &&
          v.releasedTo.length === 0
        )
          v.releasedTo = [...entityIds]
    }
    this.log(
      s.styleNumber,
      user,
      'variant-added',
      `Added ${[...newSizes.map((x) => `size ${x}`), ...newColors.map((x) => `color ${x}`)].join(', ') || 'no new dimensions'}` +
        (entityIds.length ? ` · released to ${entityIds.join(', ')}` : ''),
    )
    return this.commit(s)
  }

  async setLifecycle(
    styleNumber: string,
    change: LifecycleChange,
    user: string,
  ): Promise<ProductStyle> {
    await wait()
    const s = this.must(styleNumber)
    const future = new Date(change.effectiveDate).getTime() > Date.now() + 60_000
    const prev = s.lifecycle ?? '(unset)'
    if (future) {
      s.scheduledLifecycle = change
      this.log(
        s.styleNumber,
        user,
        'lifecycle-changed',
        `Lifecycle scheduled: ${prev} → ${change.status} effective ${new Date(change.effectiveDate).toLocaleDateString()}.`,
      )
    } else {
      s.lifecycle = change.status
      if (s.scheduledLifecycle?.status === change.status) s.scheduledLifecycle = undefined
      this.log(s.styleNumber, user, 'lifecycle-changed', `Lifecycle changed: ${prev} → ${change.status}.`)
    }
    return this.commit(s)
  }

  async releaseToEntities(
    styleNumber: string,
    entityIds: string[],
    user: string,
  ): Promise<ProductStyle> {
    await wait()
    const s = this.must(styleNumber)
    const valid = LEGAL_ENTITIES.map((e) => e.id)
    const bad = entityIds.filter((e) => !valid.includes(e))
    if (bad.length) throw new Error(`Unknown legal entity: ${bad.join(', ')}`)
    if (s.validationStatus === 'errors')
      throw new Error(
        `Style ${s.styleNumber} still has validation errors — resolve them before releasing.`,
      )
    for (const v of s.variants)
      for (const e of entityIds) if (!v.releasedTo.includes(e)) v.releasedTo.push(e)
    s.reviewState = 'released'
    this.log(
      s.styleNumber,
      user,
      'released',
      `${s.variants.length} size/color combinations released to ${entityIds.join(', ')}.`,
    )
    return this.commit(s)
  }

  async revalidate(styleNumber: string, user: string): Promise<ProductStyle> {
    await wait()
    const s = this.must(styleNumber)
    const next = this.commit(s)
    this.log(
      styleNumber,
      user,
      'revalidated',
      `Validation re-run: ${next.validationStatus === 'passed' ? 'all checks passed' : `${next.issues.length} issue(s) remain`}.`,
    )
    return next
  }
}
