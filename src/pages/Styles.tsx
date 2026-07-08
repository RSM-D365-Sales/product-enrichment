import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProducts } from '../context/ProductsContext'
import { LifecyclePill, ReviewPill, ValidationPill } from '../components/ui/Pill'
import { fmtDate } from '../lib/format'

// "Update existing styles" — search by product and legal entity, then drill
// into the size/color grid, lifecycle and release actions on the detail page.
export default function Styles() {
  const { styles, entities, loading } = useProducts()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState('')
  const [category, setCategory] = useState('')

  const categories = useMemo(
    () => [...new Set(styles.map((s) => s.category))].sort(),
    [styles],
  )

  const list = useMemo(() => {
    let out = [...styles].sort((a, b) => a.styleNumber.localeCompare(b.styleNumber))
    const q = query.trim().toLowerCase()
    if (q)
      out = out.filter(
        (s) => s.styleNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
      )
    if (category) out = out.filter((s) => s.category === category)
    if (entity)
      out = out.filter((s) => s.variants.some((v) => v.releasedTo.includes(entity)))
    return out
  }, [styles, query, category, entity])

  return (
    <div>
      <div className="eyebrow">Product Maintenance</div>
      <h1 className="page-title">Update existing styles</h1>
      <p className="page-sub">
        Search for a product and legal entity, review its size/color grid and where each combination
        is released, extend ranges, change lifecycle (including future dating), and release to
        additional entities.
      </p>

      <div className="filter-row">
        <input
          type="text"
          placeholder="Style number or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All legal entities</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} — {e.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span style={{ color: 'var(--muted)' }}>{list.length} styles</span>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : list.length === 0 ? (
          <div className="empty">No styles match.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Style</th>
                <th>Category</th>
                <th>Season</th>
                <th>Sizes × colors</th>
                <th>Released in</th>
                <th>Lifecycle</th>
                <th>Review</th>
                <th>Validation</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const released = [
                  ...new Set(s.variants.flatMap((v) => v.releasedTo)),
                ].sort()
                return (
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
                      <div style={{ color: 'var(--ink-2)' }}>
                        {s.name} {s.isMaster ? <span className="badge-master">master</span> : null}
                      </div>
                    </td>
                    <td>{s.category}</td>
                    <td>{s.season}</td>
                    <td className="num">
                      {s.sizes.length} × {s.colors.length} = {s.variants.length}
                    </td>
                    <td>{released.length ? released.join(', ') : '—'}</td>
                    <td><LifecyclePill style={s} /></td>
                    <td><ReviewPill state={s.reviewState} /></td>
                    <td><ValidationPill status={s.validationStatus} /></td>
                    <td className="num">{fmtDate(s.importedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
