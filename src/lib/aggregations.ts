import { ISSUE_LABELS, IssueType, ProductStyle } from '../models/types'
import { daysAgo, daysUntil } from './format'

export interface WorkspaceSummary {
  totalImported: number
  withErrors: number
  withWarnings: number
  readyForRelease: number
  stuckInReview: number
  launchingSoon: number
  retiringSoon: number
  stuckDays: number
  horizonDays: number
}

export function workspaceSummary(
  styles: ProductStyle[],
  stuckDays = 5,
  horizonDays = 30,
): WorkspaceSummary {
  return {
    totalImported: styles.length,
    withErrors: styles.filter((s) => s.validationStatus === 'errors').length,
    withWarnings: styles.filter((s) => s.validationStatus === 'warnings').length,
    readyForRelease: styles.filter(
      (s) => s.validationStatus === 'passed' && s.reviewState !== 'released',
    ).length,
    stuckInReview: stuckInReview(styles, stuckDays).length,
    launchingSoon: launchingSoon(styles, horizonDays).length,
    retiringSoon: retiringSoon(styles, horizonDays).length,
    stuckDays,
    horizonDays,
  }
}

export interface IssueFrequency {
  type: IssueType
  label: string
  count: number
}

export function issueFrequency(styles: ProductStyle[]): IssueFrequency[] {
  const counts = new Map<IssueType, number>()
  for (const s of styles) {
    for (const i of s.issues) counts.set(i.type, (counts.get(i.type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: ISSUE_LABELS[type], count }))
    .sort((a, b) => b.count - a.count)
}

export function stuckInReview(styles: ProductStyle[], days = 5): ProductStyle[] {
  return styles
    .filter((s) => s.reviewState === 'in-review' && daysAgo(s.importedAt) > days)
    .sort((a, b) => daysAgo(b.importedAt) - daysAgo(a.importedAt))
}

export function launchingSoon(styles: ProductStyle[], horizonDays = 30): ProductStyle[] {
  return styles
    .filter((s) => {
      const sc = s.scheduledLifecycle
      if (!sc || sc.status !== 'active') return false
      const d = daysUntil(sc.effectiveDate)
      return d >= 0 && d <= horizonDays
    })
    .sort(
      (a, b) =>
        daysUntil(a.scheduledLifecycle!.effectiveDate) -
        daysUntil(b.scheduledLifecycle!.effectiveDate),
    )
}

export function retiringSoon(styles: ProductStyle[], horizonDays = 30): ProductStyle[] {
  return styles
    .filter((s) => {
      const sc = s.scheduledLifecycle
      if (!sc || sc.status !== 'retired') return false
      const d = daysUntil(sc.effectiveDate)
      return d >= 0 && d <= horizonDays
    })
    .sort(
      (a, b) =>
        daysUntil(a.scheduledLifecycle!.effectiveDate) -
        daysUntil(b.scheduledLifecycle!.effectiveDate),
    )
}

export interface EnrichmentSuggestion {
  vendor?: string
  countryOfOrigin?: string
  htsCode?: string
  sizes?: string[]
  colors?: string[]
  lifecycle?: 'new'
  basis: string
}

/** Most common non-empty value among category peers. */
function mode(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | undefined
  let n = 0
  for (const [v, c] of counts) if (c > n) ((best = v), (n = c))
  return best
}

/** Suggest values for missing fields based on other products in the same category. */
export function suggestEnrichment(
  style: ProductStyle,
  all: ProductStyle[],
): EnrichmentSuggestion | null {
  const peers = all.filter(
    (p) => p.category === style.category && p.styleNumber !== style.styleNumber,
  )
  if (peers.length === 0) return null

  const out: EnrichmentSuggestion = {
    basis: `Based on ${peers.length} other ${style.category} styles in the workspace.`,
  }
  let any = false

  if (!style.vendor) {
    const v = mode(peers.map((p) => p.vendor))
    if (v) ((out.vendor = v), (any = true))
  }
  if (!style.countryOfOrigin) {
    const v = mode(peers.map((p) => p.countryOfOrigin))
    if (v) ((out.countryOfOrigin = v), (any = true))
  }
  if (!style.htsCode) {
    const v = mode(peers.map((p) => p.htsCode))
    if (v) ((out.htsCode = v), (any = true))
  }
  if (style.isMaster && style.sizes.length === 0) {
    const peer = peers.find((p) => p.sizeGroup === style.sizeGroup && p.sizes.length > 0)
    if (peer) ((out.sizes = [...peer.sizes]), (any = true))
  }
  if (style.isMaster && style.colors.length === 0) {
    const peer = peers.find((p) => p.colorGroup === style.colorGroup && p.colors.length > 0)
    if (peer) ((out.colors = [...peer.colors]), (any = true))
  }
  if (!style.lifecycle) {
    out.lifecycle = 'new'
    any = true
  }

  return any ? out : null
}
