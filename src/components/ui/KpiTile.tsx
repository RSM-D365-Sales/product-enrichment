import { fmtInt } from '../../lib/format'

// Stat-tile contract: sentence-case label, sans semibold value with
// proportional figures, optional note. Whole tile is a button (filter/nav).
export function KpiTile({
  label,
  value,
  note,
  alert,
  selected,
  onClick,
}: {
  label: string
  value: number
  note?: string
  alert?: boolean
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <button className={`kpi${selected ? ' selected' : ''}`} onClick={onClick} type="button">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${alert && value > 0 ? ' alert' : ''}`}>{fmtInt(value)}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </button>
  )
}
