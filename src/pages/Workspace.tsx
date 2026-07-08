import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProducts } from '../context/ProductsContext'
import { useConfig } from '../context/ConfigContext'
import {
  issueFrequency,
  launchingSoon,
  retiringSoon,
  stuckInReview,
  workspaceSummary,
} from '../lib/aggregations'
import { IssueBarChart } from '../components/charts/IssueBarChart'
import { KpiTile } from '../components/ui/KpiTile'
import { LifecyclePill, ReviewPill, ValidationPill } from '../components/ui/Pill'
import { ISSUE_LABELS, IssueType, ProductStyle } from '../models/types'
import { daysAgo, fmtDate } from '../lib/format'

type QueueFilter =
  | { kind: 'all' }
  | { kind: 'errors' }
  | { kind: 'ready' }
  | { kind: 'stuck' }
  | { kind: 'launching' }
  | { kind: 'retiring' }
  | { kind: 'issue'; issue: IssueType }

export default function Workspace() {
  const { styles, loading, loadError } = useProducts()
  const { config } = useConfig()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<QueueFilter>({ kind: 'errors' })
  const [search, setSearch] = useState('')

  const summary = useMemo(
    () => workspaceSummary(styles, config.stuckDays, config.horizonDays),
    [styles, config.stuckDays, config.horizonDays],
  )
  const freq = useMemo(() => issueFrequency(styles), [styles])

  const queue = useMemo<ProductStyle[]>(() => {
    let list: ProductStyle[]
    switch (filter.kind) {
      case 'errors':
        list = styles.filter((s) => s.validationStatus === 'errors')
        break
      case 'ready':
        list = styles.filter(
          (s) => s.validationStatus === 'passed' && s.reviewState !== 'released',
        )
        break
      case 'stuck':
        list = stuckInReview(styles, config.stuckDays)
        break
      case 'launching':
        list = launchingSoon(styles, config.horizonDays)
        break
      case 'retiring':
        list = retiringSoon(styles, config.horizonDays)
        break
      case 'issue':
        list = styles.filter((s) => s.issues.some((i) => i.type === filter.issue))
        break
      default:
        list = [...styles]
    }
    const q = search.trim().toLowerCase()
    if (q)
      list = list.filter(
        (s) => s.styleNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
      )
    return list
  }, [styles, filter, search, config.stuckDays, config.horizonDays])

  const filterLabel = (() => {
    switch (filter.kind) {
      case 'all': return 'All imported styles'
      case 'errors': return 'Styles with validation errors'
      case 'ready': return 'Ready for release'
      case 'stuck': return `Stuck in review > ${config.stuckDays} days`
      case 'launching': return `Launching in the next ${config.horizonDays} days`
      case 'retiring': return `Retiring in the next ${config.horizonDays} days`
      case 'issue': return ISSUE_LABELS[filter.issue]
    }
  })()

  if (loadError) {
    return (
      <div>
        <div className="eyebrow">Product Validation &amp; Enrichment</div>
        <h1 className="page-title">Workspace</h1>
        <div className="card section-gap" style={{ borderColor: 'var(--status-critical)' }}>
          {loadError} — adjust the data source in <Link to="/setup">Setup</Link>.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">Product Validation &amp; Enrichment</div>
      <h1 className="page-title">Workspace</h1>
      <p className="page-sub">
        Styles imported from PLM into D365, validated and prioritized before they progress to
        sourcing, inventory and order fulfillment.
      </p>

      <div className="kpi-row">
        <KpiTile
          label="Total imported styles"
          value={summary.totalImported}
          note="from PLM"
          selected={filter.kind === 'all'}
          onClick={() => setFilter({ kind: 'all' })}
        />
        <KpiTile
          label="Validation errors"
          value={summary.withErrors}
          note={`${summary.withWarnings} more with warnings`}
          alert
          selected={filter.kind === 'errors'}
          onClick={() => setFilter({ kind: 'errors' })}
        />
        <KpiTile
          label={`Stuck in review > ${config.stuckDays} days`}
          value={summary.stuckInReview}
          alert
          selected={filter.kind === 'stuck'}
          onClick={() => setFilter({ kind: 'stuck' })}
        />
        <KpiTile
          label={`New styles next ${config.horizonDays} days`}
          value={summary.launchingSoon}
          note="future-dated to active"
          selected={filter.kind === 'launching'}
          onClick={() => setFilter({ kind: 'launching' })}
        />
        <KpiTile
          label={`Retiring next ${config.horizonDays} days`}
          value={summary.retiringSoon}
          note="future-dated retirements"
          selected={filter.kind === 'retiring'}
          onClick={() => setFilter({ kind: 'retiring' })}
        />
        <KpiTile
          label="Ready for release"
          value={summary.readyForRelease}
          note="validation passed"
          selected={filter.kind === 'ready'}
          onClick={() => setFilter({ kind: 'ready' })}
        />
      </div>

      <div className="card">
        <div className="card-title">Most common validation issues</div>
        <IssueBarChart
          data={freq}
          selected={filter.kind === 'issue' ? filter.issue : null}
          onSelect={(t) => setFilter(t ? { kind: 'issue', issue: t } : { kind: 'errors' })}
        />
        <div className="chart-foot">
          Issue rules follow the required-field configuration in D365 — click a bar to filter the
          queue below.
        </div>
      </div>

      <div className="filter-row">
        <strong style={{ fontSize: 14 }}>{filterLabel}</strong>
        <span style={{ color: 'var(--muted)' }}>{queue.length} styles</span>
        <span style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="Search number or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Loading styles…</div>
        ) : queue.length === 0 ? (
          <div className="empty">Nothing matches this view.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Style</th>
                <th>Category</th>
                <th>Validation</th>
                <th>Open issues</th>
                <th>Lifecycle</th>
                <th>Review</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((s) => (
                <tr
                  key={s.styleNumber}
                  className="rowlink"
                  onClick={() => navigate(`/style/${s.styleNumber}`)}
                >
                  <td>
                    <Link
                      className="style-link"
                      to={`/style/${s.styleNumber}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.styleNumber}
                    </Link>
                    <div style={{ color: 'var(--ink-2)' }}>{s.name}</div>
                  </td>
                  <td>{s.category}</td>
                  <td><ValidationPill status={s.validationStatus} /></td>
                  <td style={{ maxWidth: 260 }}>
                    {s.issues.length
                      ? s.issues.map((i) => ISSUE_LABELS[i.type]).join(', ')
                      : '—'}
                  </td>
                  <td>
                    <LifecyclePill style={s} />
                    {s.scheduledLifecycle ? (
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                        → {s.scheduledLifecycle.status} {fmtDate(s.scheduledLifecycle.effectiveDate)}
                      </div>
                    ) : null}
                  </td>
                  <td><ReviewPill state={s.reviewState} /></td>
                  <td className="num">
                    {fmtDate(s.importedAt)}
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {daysAgo(s.importedAt)}d ago
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
