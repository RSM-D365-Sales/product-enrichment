import {
  AuditEntry,
  ColorGroup,
  LegalEntity,
  LifecycleChange,
  ProductStyle,
  SizeGroup,
} from '../models/types'

export interface EnrichPatch {
  vendor?: string
  countryOfOrigin?: string
  htsCode?: string
  sizes?: string[]
  colors?: string[]
  description?: string
}

/** Single data-source seam — mock (bundled, default) or live D365 F&SC.
    Same pattern as the D365Service seam in the Consignment / Popup apps. */
export interface ProductService {
  readonly live: boolean
  getStyles(): Promise<ProductStyle[]>
  getLegalEntities(): Promise<LegalEntity[]>
  getSizeGroups(): Promise<SizeGroup[]>
  getColorGroups(): Promise<ColorGroup[]>
  getAudit(styleNumber?: string): Promise<AuditEntry[]>

  /** Enrich / correct product data fields, then revalidate. */
  enrichStyle(styleNumber: string, patch: EnrichPatch, user: string): Promise<ProductStyle>

  /** Add size/color combinations (must belong to the style's size/color groups). */
  addVariants(
    styleNumber: string,
    sizes: string[],
    colors: string[],
    entityIds: string[],
    user: string,
  ): Promise<ProductStyle>

  /** Change lifecycle status — immediate, or future-dated via effectiveDate. */
  setLifecycle(styleNumber: string, change: LifecycleChange, user: string): Promise<ProductStyle>

  /** Release the style's variants to the selected legal entities. */
  releaseToEntities(styleNumber: string, entityIds: string[], user: string): Promise<ProductStyle>

  /** Re-run validation rules after changes. */
  revalidate(styleNumber: string, user: string): Promise<ProductStyle>
}
