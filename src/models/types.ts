// Product Validation & Enrichment Workspace — domain types.
// Styles are imported from the PLM into the ERP (D365 F&SC) and must be
// validated + enriched before release to downstream processes.

export type ProductCategory =
  | 'Knitwear'
  | 'Dresses'
  | 'Outerwear'
  | 'Tops'
  | 'Bottoms'
  | 'Denim'
  | 'Accessories'

export type Channel = 'Retail' | 'E-Commerce' | 'Wholesale'

/** D365 product lifecycle state (a data field on the released product — can be missing). */
export type LifecycleStatus = 'new' | 'active' | 'phase-out' | 'retired'

/** Workspace processing state for the imported style. */
export type ReviewState = 'in-review' | 'approved' | 'released'

export type ComplianceState = 'passed' | 'pending' | 'failed' | 'unknown'

export type IssueType =
  | 'missing-vendor'
  | 'missing-country-of-origin'
  | 'missing-hts-code'
  | 'missing-size-range'
  | 'missing-color-range'
  | 'missing-lifecycle'
  | 'compliance'
  | 'invalid-hts-format'

export const ISSUE_LABELS: Record<IssueType, string> = {
  'missing-vendor': 'Missing vendor',
  'missing-country-of-origin': 'Missing country of origin',
  'missing-hts-code': 'Missing HTS code',
  'missing-size-range': 'Missing size range',
  'missing-color-range': 'Missing color range',
  'missing-lifecycle': 'Missing lifecycle status',
  compliance: 'Product compliance',
  'invalid-hts-format': 'Invalid HTS format',
}

export interface ValidationIssue {
  type: IssueType
  field: string
  message: string
  severity: 'error' | 'warning'
}

export type ValidationStatus = 'errors' | 'warnings' | 'passed'

export interface LegalEntity {
  id: string // D365 legal entity / dataAreaId, e.g. "VUS"
  name: string
  region: string
}

export interface SizeGroup {
  id: string
  name: string
  sizes: string[]
}

export interface ColorGroup {
  id: string
  name: string
  colors: string[]
}

/** One size/color combination of a product master. */
export interface VariantCell {
  size: string
  color: string
  /** Legal entity ids this combo has been released to. */
  releasedTo: string[]
  addedAt: string // ISO
}

export interface LifecycleChange {
  status: LifecycleStatus
  effectiveDate: string // ISO — may be in the future (future-dated release / retirement)
}

export interface ProductStyle {
  styleNumber: string
  name: string
  description?: string
  category: ProductCategory
  season: string
  isMaster: boolean
  sizeGroup?: string
  colorGroup?: string
  /** Active size range (subset of the size group). Empty = missing size range. */
  sizes: string[]
  /** Active color range (subset of the color group). Empty = missing color range. */
  colors: string[]
  variants: VariantCell[]
  channels: Channel[]
  vendor?: string
  countryOfOrigin?: string
  htsCode?: string
  compliance: ComplianceState
  lifecycle?: LifecycleStatus
  /** Future-dated lifecycle change (season launch or retirement). */
  scheduledLifecycle?: LifecycleChange
  reviewState: ReviewState
  importedAt: string // ISO — import from PLM
  source: 'PLM'
  issues: ValidationIssue[]
  validationStatus: ValidationStatus
  lastValidatedAt: string
}

export interface AuditEntry {
  id: string
  ts: string // ISO
  styleNumber: string
  user: string
  action:
    | 'imported'
    | 'field-updated'
    | 'variant-added'
    | 'lifecycle-changed'
    | 'released'
    | 'revalidated'
  detail: string
}
