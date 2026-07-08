// Offline rule-based assistant — the default transport, so the demo works with
// no key configured. It routes intents onto the SAME tool layer the Claude
// (Microsoft Foundry) transport uses, so numbers stay grounded.

import { ActionCard } from '../models/chat'
import { ISSUE_LABELS, LifecycleStatus } from '../models/types'
import { executeTool, ToolContext } from './agentTools'
import { fmtDate } from './format'

export interface HeuristicReply {
  reply: string
  cards: ActionCard[]
}

const STYLE_RE = /V\d{3}-\d{4}/i

function pretty(json: string): any {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function runHeuristicAgent(text: string, ctx: ToolContext): HeuristicReply {
  const t = text.toLowerCase()
  const styleMatch = text.match(STYLE_RE)
  const styleNumber = styleMatch?.[0].toUpperCase()
  const cards: ActionCard[] = []

  const run = (name: string, input: Record<string, unknown> = {}) => {
    const out = executeTool(name, input, ctx)
    if (out.card) cards.push(out.card)
    return pretty(out.result)
  }

  // ---- style-scoped intents ----
  if (styleNumber) {
    if (/(suggest|fix|enrich|fill|complete)/.test(t)) {
      const r = run('suggest_enrichment', { styleNumber })
      if (r?.error) return { reply: r.error, cards }
      if (r?.message) return { reply: r.message, cards }
      return {
        reply: `Here is a proposal for ${styleNumber}, based on other products in the same category. Review the card below and confirm to apply — nothing changes until you do.`,
        cards,
      }
    }
    if (/(retire|phase.?out|activate|lifecycle|go live|launch)/.test(t)) {
      let status: LifecycleStatus = 'active'
      if (/retire/.test(t)) status = 'retired'
      else if (/phase/.test(t)) status = 'phase-out'
      else if (/\bnew\b/.test(t)) status = 'new'
      let effectiveDate: string | undefined
      const inDays = t.match(/in (\d+) days?/)
      const onDate = text.match(/on (\d{4}-\d{2}-\d{2})/)
      if (inDays) effectiveDate = new Date(Date.now() + Number(inDays[1]) * 86400000).toISOString()
      if (onDate) effectiveDate = new Date(onDate[1]).toISOString()
      if (/end of (the )?season/.test(t))
        effectiveDate = new Date(Date.now() + 30 * 86400000).toISOString()
      const r = run('set_lifecycle', { styleNumber, status, effectiveDate })
      if (r?.error) return { reply: r.error, cards }
      return {
        reply: `Drafted a lifecycle change for ${styleNumber} → ${status}${
          effectiveDate ? `, effective ${fmtDate(effectiveDate)} (future-dated)` : ''
        }. Confirm the card below to apply it.`,
        cards,
      }
    }
    if (/release/.test(t)) {
      const entityIds = (text.match(/\b(VUS|VCA|VEU|VUK)\b/gi) ?? []).map((e) => e.toUpperCase())
      const r = run('release_style', {
        styleNumber,
        entityIds: entityIds.length ? entityIds : ['VUS'],
      })
      if (r?.error) return { reply: r.error, cards }
      return {
        reply: `Drafted the release for ${styleNumber}. Confirm the card below to release it.`,
        cards,
      }
    }
    if (/add/.test(t) && /(size|color|colour)/.test(t)) {
      const sizeGroupSizes = ctx.sizeGroups.flatMap((g) => g.sizes)
      const colorNames = ctx.colorGroups.flatMap((g) => g.colors)
      const sizes = sizeGroupSizes.filter((s) =>
        new RegExp(`\\b${s}\\b`, 'i').test(text.replace(styleNumber, '')),
      )
      const colors = colorNames.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text))
      const entityIds = (text.match(/\b(VUS|VCA|VEU|VUK)\b/gi) ?? []).map((e) => e.toUpperCase())
      const r = run('add_variants', { styleNumber, sizes, colors, entityIds })
      if (r?.error) return { reply: r.error, cards }
      return {
        reply: `Drafted the size/color additions for ${styleNumber}. Confirm the card below to apply.`,
        cards,
      }
    }
    if (/(history|audit|who|when)/.test(t)) {
      const rows = run('get_audit_history', { styleNumber }) as any[]
      if (!rows?.length) return { reply: `No audit history found for ${styleNumber}.`, cards }
      return {
        reply:
          `Audit history for ${styleNumber}:\n` +
          rows.map((r) => `• ${r.when} — ${r.user}: ${r.detail}`).join('\n'),
        cards,
      }
    }
    // default: details
    const d = run('get_style_details', { styleNumber })
    if (d?.error) return { reply: d.error, cards }
    const issueTxt = d.issues?.length ? d.issues.join('; ') : 'none — validation passed'
    return {
      reply:
        `${d.styleNumber} · ${d.name} (${d.category}, ${d.season})\n` +
        `Validation: ${d.validationStatus} — ${issueTxt}\n` +
        `Lifecycle: ${d.lifecycle ?? 'not set'}${d.scheduled ? ` · scheduled ${d.scheduled}` : ''}\n` +
        `Vendor: ${d.vendor ?? '—'} · Origin: ${d.countryOfOrigin ?? '—'} · HTS: ${d.htsCode ?? '—'}\n` +
        `Sizes: ${d.sizes?.join(', ') || '—'} · Colors: ${d.colors?.join(', ') || '—'} · ${d.variants?.length ?? 0} combos\n` +
        `Ask me to "suggest data for ${d.styleNumber}" or "release ${d.styleNumber} to VUS".`,
      cards,
    }
  }

  // ---- workspace intents ----
  if (/(stuck|too long|aging)/.test(t)) {
    const r = run('search_styles', { list: 'stuck' })
    if (!r?.count) return { reply: 'Nothing is stuck in review right now.', cards }
    return {
      reply:
        `${r.count} styles have been in review for more than ${ctx.stuckDays} days:\n` +
        r.styles
          .map((s: any) => `• ${s.styleNumber} ${s.name} — ${s.daysSinceImport} days, ${s.issues.join(', ') || 'no open issues'}`)
          .join('\n'),
      cards,
    }
  }
  if (/(launch|coming|new styles|go live)/.test(t)) {
    const r = run('search_styles', { list: 'launching' })
    if (!r?.count) return { reply: `No styles are scheduled to go active in the next ${ctx.horizonDays} days.`, cards }
    return {
      reply:
        `${r.count} styles go active in the next ${ctx.horizonDays} days:\n` +
        r.styles.map((s: any) => `• ${s.styleNumber} ${s.name} — ${s.scheduled}`).join('\n'),
      cards,
    }
  }
  if (/retir/.test(t)) {
    const r = run('search_styles', { list: 'retiring' })
    if (!r?.count) return { reply: `No styles retire in the next ${ctx.horizonDays} days.`, cards }
    return {
      reply:
        `${r.count} styles retire in the next ${ctx.horizonDays} days:\n` +
        r.styles.map((s: any) => `• ${s.styleNumber} ${s.name} — ${s.scheduled}`).join('\n'),
      cards,
    }
  }
  if (/(issue|error|validation|missing)/.test(t)) {
    const r = run('get_validation_issues') as any[]
    if (!r?.length) return { reply: 'No validation issues — every imported style passes.', cards }
    return {
      reply:
        'Most common validation issues right now:\n' +
        r.map((f) => `• ${f.label}: ${f.count} style${f.count === 1 ? '' : 's'}`).join('\n') +
        '\n\nAsk about any style number for detail, or say "suggest data for <style>" to draft a fix.',
      cards,
    }
  }
  if (/(summary|overview|status|how (are|is)|kpi)/.test(t)) {
    const s = run('get_workspace_summary')
    return {
      reply:
        `Workspace summary:\n` +
        `• ${s.totalImported} styles imported from PLM\n` +
        `• ${s.withErrors} with validation errors · ${s.withWarnings} with warnings\n` +
        `• ${s.readyForRelease} ready for release\n` +
        `• ${s.stuckInReview} stuck in review > ${s.stuckDays} days\n` +
        `• ${s.launchingSoon} launching and ${s.retiringSoon} retiring in the next ${s.horizonDays} days`,
      cards,
    }
  }
  if (/(audit|history|recent activity)/.test(t)) {
    const rows = run('get_audit_history') as any[]
    return {
      reply:
        'Recent activity:\n' +
        rows.slice(0, 8).map((r) => `• ${r.when} — ${r.style} · ${r.user}: ${r.detail}`).join('\n'),
      cards,
    }
  }

  // ---- fallback / help ----
  const s = run('get_workspace_summary')
  return {
    reply:
      `I can help you validate and enrich the ${s.totalImported} styles imported from PLM. Try:\n` +
      `• "Give me a summary" or "What are the most common issues?"\n` +
      `• "What's stuck in review?" · "What's launching soon?" · "What retires this month?"\n` +
      `• "Suggest data for V826-4102" — drafts missing fields from category peers\n` +
      `• "Retire V801-1001 in 30 days" · "Release V831-7001 to VUS and VCA"\n` +
      `• "Add size XL and color Navy to V820-4002 for VUS"\n\n` +
      `Every change I draft becomes a card you confirm — nothing is applied automatically.\n` +
      `Tip: connect the live assistant in Setup for free-form conversation.`,
    cards,
  }
}
