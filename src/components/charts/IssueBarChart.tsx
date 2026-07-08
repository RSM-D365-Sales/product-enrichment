import { IssueFrequency } from '../../lib/aggregations'
import { IssueType } from '../../models/types'

// Nominal categories, one measure → every bar wears the SAME validated hue
// (--data-1); identity comes from the row label, magnitude from length, and
// the count is direct-labeled at each data end (values never gated behind
// hover). Bars are thin with a rounded data-end and square baseline.
export function IssueBarChart({
  data,
  selected,
  onSelect,
}: {
  data: IssueFrequency[]
  selected: IssueType | null
  onSelect: (t: IssueType | null) => void
}) {
  if (data.length === 0) return <div className="empty">No open validation issues.</div>
  const max = Math.max(...data.map((d) => d.count))
  return (
    <div className="barchart" role="list" aria-label="Validation issues by type">
      {data.map((d) => (
        <button
          key={d.type}
          role="listitem"
          className={`bar-row${selected === d.type ? ' selected' : ''}`}
          onClick={() => onSelect(selected === d.type ? null : d.type)}
          title={`${d.label}: ${d.count} style${d.count === 1 ? '' : 's'} — click to filter the queue`}
        >
          <span className="bar-label">{d.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }}
              aria-hidden
            />
            <span className="bar-value">{d.count}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
