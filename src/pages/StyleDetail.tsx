import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProducts } from '../context/ProductsContext'
import { suggestEnrichment } from '../lib/aggregations'
import { daysAgo, fmtDate } from '../lib/format'
import { LifecyclePill, ReviewPill, ValidationPill } from '../components/ui/Pill'
import { ISSUE_LABELS, LifecycleStatus } from '../models/types'
import { EnrichPatch } from '../services'

export default function StyleDetail() {
  const { styleNumber = '' } = useParams()
  const {
    styles,
    entities,
    sizeGroups,
    colorGroups,
    audit,
    enrichStyle,
    addVariants,
    setLifecycle,
    releaseToEntities,
    revalidate,
  } = useProducts()

  const style = styles.find((s) => s.styleNumber.toUpperCase() === styleNumber.toUpperCase())

  const [draft, setDraft] = useState<EnrichPatch>({})
  const [suggestNote, setSuggestNote] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lens, setLens] = useState<string>('') // legal entity view for the matrix
  const [addSize, setAddSize] = useState('')
  const [addColor, setAddColor] = useState('')
  const [releaseSel, setReleaseSel] = useState<string[]>([])
  const [lcStatus, setLcStatus] = useState<LifecycleStatus>('active')
  const [lcDate, setLcDate] = useState('')

  const styleAudit = useMemo(
    () => audit.filter((a) => a.styleNumber === style?.styleNumber),
    [audit, style?.styleNumber],
  )

  if (!style) {
    return (
      <div>
        <h1 className="page-title">Style not found</h1>
        <p className="page-sub">
          {styleNumber} is not in the workspace. <Link to="/styles">Back to styles</Link>.
        </p>
      </div>
    )
  }

  const sizeGroup = sizeGroups.find((g) => g.id === style.sizeGroup)
  const colorGroup = colorGroups.find((g) => g.id === style.colorGroup)
  const availSizes = (sizeGroup?.sizes ?? []).filter((s) => !style.sizes.includes(s))
  const availColors = (colorGroup?.colors ?? []).filter((c) => !style.colors.includes(c))

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const guard = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      flash(ok)
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const fillSuggestions = () => {
    const s = suggestEnrichment(style, styles)
    if (!s) {
      setSuggestNote('No suggestions available — no missing fields, or no category peers.')
      return
    }
    const { basis, lifecycle: _lc, ...patch } = s
    setDraft((d) => ({ ...patch, ...stripUndefined(d) }))
    setSuggestNote(basis)
  }

  const saveEnrichment = () =>
    guard(async () => {
      const patch = stripUndefined(draft)
      if (Object.keys(patch).length === 0) throw new Error('Nothing to save.')
      await enrichStyle(style.styleNumber, patch)
      setDraft({})
      setSuggestNote(null)
    }, 'Fields saved and style revalidated.')

  const errorIssues = style.issues.filter((i) => i.severity === 'error')
  const warnIssues = style.issues.filter((i) => i.severity === 'warning')

  return (
    <div>
      <div className="eyebrow">
        <Link to="/styles" style={{ textDecoration: 'none', color: 'inherit' }}>
          Styles
        </Link>{' '}
        / {style.styleNumber}
      </div>
      <h1 className="page-title">
        {style.name}{' '}
        {style.isMaster ? <span className="badge-master">master · {style.variants.length} variants</span> : null}
      </h1>
      <p className="page-sub">
        {style.styleNumber} · {style.category} · {style.season} · imported {fmtDate(style.importedAt)} (
        {daysAgo(style.importedAt)} days ago) from PLM
        {style.description ? ` — ${style.description}` : ''}
      </p>
      <div className="filter-row" style={{ marginTop: 10 }}>
        <ValidationPill status={style.validationStatus} />
        <LifecyclePill style={style} />
        <ReviewPill state={style.reviewState} />
        {style.scheduledLifecycle ? (
          <span className="pill camel">
            <span className="dot" aria-hidden />
            scheduled: {style.scheduledLifecycle.status} on {fmtDate(style.scheduledLifecycle.effectiveDate)}
          </span>
        ) : null}
        <span className="pill">
          <span className="dot" aria-hidden />
          channels: {style.channels.join(', ')}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={busy} onClick={() => void guard(() => revalidate(style.styleNumber), 'Validation re-run.')}>
          Revalidate
        </button>
      </div>

      <div className="detail-grid">
        {/* ------------------------------------------------ validation & enrichment */}
        <section className="card">
          <div className="card-title">Validation &amp; enrichment</div>
          {style.issues.length === 0 ? (
            <div className="empty">All validation checks pass. This style is ready to progress.</div>
          ) : (
            <>
              {[...errorIssues, ...warnIssues].map((i) => (
                <div className="issue-line" key={i.type + i.field}>
                  <span className={`pill ${i.severity === 'error' ? 'critical' : 'warning'}`}>
                    <span className="dot" aria-hidden />
                    {i.severity}
                  </span>
                  <div className="issue-msg">
                    <div>{ISSUE_LABELS[i.type]}</div>
                    <div className="why">{i.message}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, margin: '14px 0 10px' }}>
            <button className="btn camel small" onClick={fillSuggestions} disabled={busy}>
              Suggest from category
            </button>
            {suggestNote ? <span className="hint" style={{ alignSelf: 'center' }}>{suggestNote}</span> : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field">
              Vendor
              <input
                type="text"
                value={draft.vendor ?? style.vendor ?? ''}
                placeholder="—"
                onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value }))}
              />
            </label>
            <label className="field">
              Country of origin
              <input
                type="text"
                value={draft.countryOfOrigin ?? style.countryOfOrigin ?? ''}
                placeholder="—"
                onChange={(e) => setDraft((d) => ({ ...d, countryOfOrigin: e.target.value }))}
              />
            </label>
            <label className="field">
              HTS code
              <input
                type="text"
                value={draft.htsCode ?? style.htsCode ?? ''}
                placeholder="9999.99.9999"
                onChange={(e) => setDraft((d) => ({ ...d, htsCode: e.target.value }))}
              />
            </label>
            <label className="field">
              Compliance
              <input type="text" value={style.compliance} disabled />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => void saveEnrichment()} disabled={busy}>
              Save &amp; revalidate
            </button>
          </div>
        </section>

        {/* ------------------------------------------------ lifecycle */}
        <section className="card">
          <div className="card-title">Lifecycle</div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Current: <strong>{style.lifecycle ?? 'not set'}</strong>
            {style.scheduledLifecycle
              ? ` — scheduled to become ${style.scheduledLifecycle.status} on ${fmtDate(style.scheduledLifecycle.effectiveDate)}`
              : ''}
            . A future date drives season launches and planned retirements.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field">
              New status
              <select value={lcStatus} onChange={(e) => setLcStatus(e.target.value as LifecycleStatus)}>
                <option value="new">new</option>
                <option value="active">active</option>
                <option value="phase-out">phase-out</option>
                <option value="retired">retired</option>
              </select>
            </label>
            <label className="field">
              Effective date (optional)
              <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} />
            </label>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void guard(
                  () =>
                    setLifecycle(style.styleNumber, {
                      status: lcStatus,
                      effectiveDate: lcDate
                        ? new Date(lcDate + 'T12:00:00').toISOString()
                        : new Date().toISOString(),
                    }),
                  lcDate ? 'Lifecycle change scheduled.' : 'Lifecycle updated.',
                )
              }
            >
              Apply
            </button>
          </div>

          <div className="card-title" style={{ marginTop: 22 }}>Release to legal entities</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {entities.map((e) => (
              <label key={e.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={releaseSel.includes(e.id)}
                  onChange={(ev) =>
                    setReleaseSel((prev) =>
                      ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id),
                    )
                  }
                />
                {e.id} · {e.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="btn camel"
              disabled={busy || releaseSel.length === 0}
              onClick={() =>
                void guard(
                  () => releaseToEntities(style.styleNumber, releaseSel),
                  `Released to ${releaseSel.join(', ')}.`,
                )
              }
            >
              Release {style.variants.length} combinations
            </button>
            {style.validationStatus === 'errors' ? (
              <div className="hint" style={{ marginTop: 6 }}>
                Release is blocked while validation errors remain.
              </div>
            ) : null}
          </div>
        </section>

        {/* ------------------------------------------------ size/color matrix */}
        <section className="card span2">
          <div className="card-title">Size / color grid</div>
          <div className="filter-row" style={{ margin: '0 0 12px' }}>
            <label className="field">
              View releases for
              <select value={lens} onChange={(e) => setLens(e.target.value)}>
                <option value="">All legal entities</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.id} — {e.name}</option>
                ))}
              </select>
            </label>
            <span style={{ flex: 1 }} />
            <label className="field">
              Add size ({sizeGroup?.name ?? '—'})
              <select value={addSize} onChange={(e) => setAddSize(e.target.value)}>
                <option value="">—</option>
                {availSizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Add color ({colorGroup?.name ?? '—'})
              <select value={addColor} onChange={(e) => setAddColor(e.target.value)}>
                <option value="">—</option>
                {availColors.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={busy || (!addSize && !addColor)}
              onClick={() =>
                void guard(async () => {
                  await addVariants(
                    style.styleNumber,
                    addSize ? [addSize] : [],
                    addColor ? [addColor] : [],
                    lens ? [lens] : [],
                  )
                  setAddSize('')
                  setAddColor('')
                }, 'Size/color range extended.')
              }
            >
              Add to range
            </button>
          </div>

          {style.sizes.length === 0 || style.colors.length === 0 ? (
            <div className="empty">
              This master has {style.sizes.length === 0 ? 'no active sizes' : 'no active colors'} —
              add dimensions above or use “Suggest from category”.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th>Size \ Color</th>
                    {style.colors.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {style.sizes.map((sz) => (
                    <tr key={sz}>
                      <th>{sz}</th>
                      {style.colors.map((c) => {
                        const v = style.variants.find((x) => x.size === sz && x.color === c)
                        const rel = v?.releasedTo ?? []
                        const shown = lens ? rel.filter((r) => r === lens) : rel
                        const on = shown.length > 0
                        return (
                          <td key={c} className={on ? 'on' : 'off'}>
                            {on ? (
                              lens ? '✓ released' : shown.map((r) => <span className="chip" key={r}>{r}</span>)
                            ) : (
                              'not released'
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 10 }}>
            Cells show which legal entities each size/color combination is released in. New sizes and
            colors must belong to the style's assigned size and color groups.
          </div>
        </section>

        {/* ------------------------------------------------ audit */}
        <section className="card span2">
          <div className="card-title">Lifecycle &amp; audit history</div>
          {styleAudit.length === 0 ? (
            <div className="empty">No history recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {styleAudit.map((a) => (
                    <tr key={a.id}>
                      <td className="num">{fmtDate(a.ts)}</td>
                      <td>{a.user}</td>
                      <td>{a.action.replace('-', ' ')}</td>
                      <td>{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

function stripUndefined(p: EnrichPatch): EnrichPatch {
  const out: EnrichPatch = {}
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v
  }
  return out
}
