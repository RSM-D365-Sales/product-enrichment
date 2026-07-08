// Shared, typed tool layer used by BOTH assistant transports (heuristic and
// Claude on Microsoft Foundry). Tools run the same aggregation logic as the
// dashboard, so answers are grounded — never invented. Mutating tools do NOT
// execute: they return a human-in-the-loop ActionCard proposal that the user
// confirms in the side panel.

import {
  ColorGroup,
  ISSUE_LABELS,
  IssueType,
  LegalEntity,
  LifecycleStatus,
  ProductStyle,
  SizeGroup,
  AuditEntry,
} from '../models/types'
import { ActionCard } from '../models/chat'
import {
  issueFrequency,
  launchingSoon,
  retiringSoon,
  stuckInReview,
  suggestEnrichment,
  workspaceSummary,
} from './aggregations'
import { daysAgo, daysUntil, fmtDate } from './format'

export interface ToolContext {
  styles: ProductStyle[]
  entities: LegalEntity[]
  sizeGroups: SizeGroup[]
  colorGroups: ColorGroup[]
  audit: AuditEntry[]
  stuckDays: number
  horizonDays: number
}

export interface ToolOutcome {
  result: string // JSON payload handed back to the model / heuristic formatter
  card?: ActionCard
}

let cardSeq = 1
const cardId = () => `card-${Date.now()}-${cardSeq++}`

// ---------------------------------------------------------------- tool schemas

export const TOOL_DEFS = [
  {
    name: 'get_workspace_summary',
    description:
      'KPI summary of the whole workspace: total imported styles, styles with validation errors/warnings, ready for release, stuck in review, launching and retiring within the horizon.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_validation_issues',
    description:
      'Frequency of validation issues by type (missing vendor, country of origin, HTS code, size range, color range, lifecycle, compliance), plus the styles affected by each.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueType: {
          type: 'string',
          description:
            'Optional filter — one of: missing-vendor, missing-country-of-origin, missing-hts-code, missing-size-range, missing-color-range, missing-lifecycle, compliance, invalid-hts-format',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_style_details',
    description:
      'Full detail for one style: fields, validation issues, size/color variants and where they are released, lifecycle including scheduled changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string', description: 'e.g. V826-4101' },
      },
      required: ['styleNumber'],
    },
  },
  {
    name: 'search_styles',
    description:
      'Search styles by free text, category, validation status, lifecycle, review state, or a special list: stuck (in review too long), launching (going active soon), retiring (retiring soon).',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Matches style number or name' },
        category: { type: 'string' },
        validationStatus: { type: 'string', description: 'errors | warnings | passed' },
        list: { type: 'string', description: 'stuck | launching | retiring' },
      },
      required: [],
    },
  },
  {
    name: 'suggest_enrichment',
    description:
      'Suggest values for the missing/invalid fields of a style, based on other products in the same category. Creates a confirmation card the user can apply — it does not change data by itself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string' },
      },
      required: ['styleNumber'],
    },
  },
  {
    name: 'set_lifecycle',
    description:
      'Propose a lifecycle change for a style (new, active, phase-out, retired). An effectiveDate in the future creates a future-dated change (season launch or scheduled retirement). Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string' },
        status: { type: 'string', description: 'new | active | phase-out | retired' },
        effectiveDate: {
          type: 'string',
          description: 'ISO date. Omit for an immediate change.',
        },
      },
      required: ['styleNumber', 'status'],
    },
  },
  {
    name: 'add_variants',
    description:
      'Propose adding sizes and/or colors to a style (must belong to its size/color group), optionally releasing the new combinations to legal entities. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string' },
        sizes: { type: 'array', items: { type: 'string' } },
        colors: { type: 'array', items: { type: 'string' } },
        entityIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Legal entity ids, e.g. VUS, VCA, VEU, VUK',
        },
      },
      required: ['styleNumber'],
    },
  },
  {
    name: 'release_style',
    description:
      'Propose releasing a style (all its size/color combinations) to one or more legal entities. Blocked while the style has validation errors. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string' },
        entityIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['styleNumber', 'entityIds'],
    },
  },
  {
    name: 'get_audit_history',
    description:
      'Audit trail — lifecycle changes, field updates, size/color additions, releases. Optionally scoped to one style.',
    input_schema: {
      type: 'object' as const,
      properties: {
        styleNumber: { type: 'string' },
      },
      required: [],
    },
  },
]

// ---------------------------------------------------------------- helpers

function brief(s: ProductStyle) {
  return {
    styleNumber: s.styleNumber,
    name: s.name,
    category: s.category,
    season: s.season,
    validationStatus: s.validationStatus,
    issues: s.issues.map((i) => ISSUE_LABELS[i.type]),
    lifecycle: s.lifecycle ?? null,
    scheduled: s.scheduledLifecycle
      ? `${s.scheduledLifecycle.status} on ${fmtDate(s.scheduledLifecycle.effectiveDate)}`
      : null,
    reviewState: s.reviewState,
    daysSinceImport: daysAgo(s.importedAt),
  }
}

function findStyle(ctx: ToolContext, styleNumber: string): ProductStyle | undefined {
  const key = (styleNumber ?? '').trim().toUpperCase()
  return ctx.styles.find((s) => s.styleNumber.toUpperCase() === key)
}

const j = (v: unknown) => JSON.stringify(v, null, 1)

// ---------------------------------------------------------------- executor

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): ToolOutcome {
  switch (name) {
    case 'get_workspace_summary': {
      return { result: j(workspaceSummary(ctx.styles, ctx.stuckDays, ctx.horizonDays)) }
    }

    case 'get_validation_issues': {
      const filter = input.issueType as IssueType | undefined
      const freq = issueFrequency(ctx.styles).filter((f) => !filter || f.type === filter)
      const detail = freq.map((f) => ({
        ...f,
        styles: ctx.styles
          .filter((s) => s.issues.some((i) => i.type === f.type))
          .map((s) => `${s.styleNumber} ${s.name}`),
      }))
      return { result: j(detail) }
    }

    case 'get_style_details': {
      const s = findStyle(ctx, String(input.styleNumber ?? ''))
      if (!s) return { result: j({ error: `Style ${input.styleNumber} not found.` }) }
      return {
        result: j({
          ...brief(s),
          description: s.description ?? null,
          vendor: s.vendor ?? null,
          countryOfOrigin: s.countryOfOrigin ?? null,
          htsCode: s.htsCode ?? null,
          compliance: s.compliance,
          isMaster: s.isMaster,
          sizeGroup: s.sizeGroup,
          colorGroup: s.colorGroup,
          sizes: s.sizes,
          colors: s.colors,
          channels: s.channels,
          issueDetail: s.issues,
          variants: s.variants.map((v) => ({
            size: v.size,
            color: v.color,
            releasedTo: v.releasedTo,
          })),
          importedAt: fmtDate(s.importedAt),
        }),
      }
    }

    case 'search_styles': {
      let list = [...ctx.styles]
      const q = String(input.query ?? '').toLowerCase()
      const listKind = String(input.list ?? '')
      if (listKind === 'stuck') list = stuckInReview(list, ctx.stuckDays)
      else if (listKind === 'launching') list = launchingSoon(list, ctx.horizonDays)
      else if (listKind === 'retiring') list = retiringSoon(list, ctx.horizonDays)
      if (q)
        list = list.filter(
          (s) =>
            s.styleNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
        )
      if (input.category)
        list = list.filter(
          (s) => s.category.toLowerCase() === String(input.category).toLowerCase(),
        )
      if (input.validationStatus)
        list = list.filter((s) => s.validationStatus === input.validationStatus)
      return { result: j({ count: list.length, styles: list.slice(0, 40).map(brief) }) }
    }

    case 'suggest_enrichment': {
      const s = findStyle(ctx, String(input.styleNumber ?? ''))
      if (!s) return { result: j({ error: `Style ${input.styleNumber} not found.` }) }
      const suggestion = suggestEnrichment(s, ctx.styles)
      if (!suggestion)
        return {
          result: j({
            message: `${s.styleNumber} has no missing fields that can be suggested from category peers.`,
          }),
        }
      const { basis, lifecycle, ...patch } = suggestion
      const lines = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      const card: ActionCard = {
        kind: 'enrich',
        id: cardId(),
        status: 'proposed',
        styleNumber: s.styleNumber,
        title: `Enrich ${s.styleNumber} · ${s.name}`,
        detail: `${lines.join('\n')}\n\n${basis}`,
        patch,
      }
      return {
        result: j({
          proposal: { ...patch, lifecycle: lifecycle ?? undefined },
          basis,
          status:
            'Proposal card created — waiting for the user to confirm in the side panel. Data is unchanged until then.',
        }),
        card,
      }
    }

    case 'set_lifecycle': {
      const s = findStyle(ctx, String(input.styleNumber ?? ''))
      if (!s) return { result: j({ error: `Style ${input.styleNumber} not found.` }) }
      const status = String(input.status ?? '') as LifecycleStatus
      if (!['new', 'active', 'phase-out', 'retired'].includes(status))
        return { result: j({ error: `Invalid lifecycle status "${input.status}".` }) }
      const effectiveDate = input.effectiveDate ? String(input.effectiveDate) : undefined
      const when = effectiveDate ? `effective ${fmtDate(effectiveDate)}` : 'effective immediately'
      const card: ActionCard = {
        kind: 'lifecycle',
        id: cardId(),
        status: 'proposed',
        styleNumber: s.styleNumber,
        title: `${s.styleNumber} · ${s.name}: ${s.lifecycle ?? 'unset'} → ${status}`,
        detail: `Lifecycle change ${when}.`,
        status2: status,
        effectiveDate,
      }
      return {
        result: j({
          proposal: { styleNumber: s.styleNumber, status, effectiveDate: effectiveDate ?? 'now' },
          status: 'Proposal card created — waiting for user confirmation.',
        }),
        card,
      }
    }

    case 'add_variants': {
      const s = findStyle(ctx, String(input.styleNumber ?? ''))
      if (!s) return { result: j({ error: `Style ${input.styleNumber} not found.` }) }
      const sizes = ((input.sizes as string[]) ?? []).filter(Boolean)
      const colors = ((input.colors as string[]) ?? []).filter(Boolean)
      const entityIds = ((input.entityIds as string[]) ?? []).map((e) => e.toUpperCase())
      const group = ctx.sizeGroups.find((g) => g.id === s.sizeGroup)
      const cgroup = ctx.colorGroups.find((g) => g.id === s.colorGroup)
      const badSizes = sizes.filter((x) => group && !group.sizes.includes(x))
      const badColors = colors.filter((x) => cgroup && !cgroup.colors.includes(x))
      if (badSizes.length || badColors.length)
        return {
          result: j({
            error: `Not in the style's groups — sizes: [${badSizes.join(', ')}], colors: [${badColors.join(', ')}]. Size group ${group?.name}: ${group?.sizes.join(', ')}. Color group ${cgroup?.name}: ${cgroup?.colors.join(', ')}.`,
          }),
        }
      if (!sizes.length && !colors.length)
        return { result: j({ error: 'Provide at least one size or color to add.' }) }
      const card: ActionCard = {
        kind: 'variants',
        id: cardId(),
        status: 'proposed',
        styleNumber: s.styleNumber,
        title: `Add to ${s.styleNumber} · ${s.name}`,
        detail:
          [
            sizes.length ? `Sizes: ${sizes.join(', ')}` : '',
            colors.length ? `Colors: ${colors.join(', ')}` : '',
            entityIds.length ? `Release new combos to: ${entityIds.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n') || '—',
        sizes,
        colors,
        entityIds,
      }
      return {
        result: j({
          proposal: { sizes, colors, entityIds },
          status: 'Proposal card created — waiting for user confirmation.',
        }),
        card,
      }
    }

    case 'release_style': {
      const s = findStyle(ctx, String(input.styleNumber ?? ''))
      if (!s) return { result: j({ error: `Style ${input.styleNumber} not found.` }) }
      const valid = ctx.entities.map((e) => e.id)
      const entityIds = ((input.entityIds as string[]) ?? []).map((e) => e.toUpperCase())
      const bad = entityIds.filter((e) => !valid.includes(e))
      if (!entityIds.length || bad.length)
        return {
          result: j({
            error: `Invalid legal entities [${bad.join(', ')}]. Valid: ${valid.join(', ')}.`,
          }),
        }
      if (s.validationStatus === 'errors')
        return {
          result: j({
            error: `${s.styleNumber} still has validation errors (${s.issues
              .filter((i) => i.severity === 'error')
              .map((i) => ISSUE_LABELS[i.type])
              .join(', ')}). Resolve them before releasing.`,
          }),
        }
      const card: ActionCard = {
        kind: 'release',
        id: cardId(),
        status: 'proposed',
        styleNumber: s.styleNumber,
        title: `Release ${s.styleNumber} · ${s.name}`,
        detail: `${s.variants.length} size/color combinations → ${entityIds
          .map((e) => ctx.entities.find((x) => x.id === e)?.name ?? e)
          .join(', ')}`,
        entityIds,
      }
      return {
        result: j({
          proposal: { styleNumber: s.styleNumber, entityIds },
          status: 'Proposal card created — waiting for user confirmation.',
        }),
        card,
      }
    }

    case 'get_audit_history': {
      const styleNumber = input.styleNumber ? String(input.styleNumber).toUpperCase() : undefined
      const rows = (
        styleNumber ? ctx.audit.filter((a) => a.styleNumber.toUpperCase() === styleNumber) : ctx.audit
      ).slice(0, 30)
      return {
        result: j(
          rows.map((a) => ({
            when: fmtDate(a.ts),
            style: a.styleNumber,
            user: a.user,
            action: a.action,
            detail: a.detail,
          })),
        ),
      }
    }

    default:
      return { result: j({ error: `Unknown tool: ${name}` }) }
  }
}

export function daysLabel(isoDate: string): string {
  const d = daysUntil(isoDate)
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
}
