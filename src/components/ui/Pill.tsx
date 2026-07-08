import { ProductStyle } from '../../models/types'

// Status colors are reserved and never carry meaning alone — every pill pairs
// the color with a text label (and the dot acts as the icon).
export function ValidationPill({ status }: { status: ProductStyle['validationStatus'] }) {
  const map = {
    errors: { cls: 'critical', label: 'Errors' },
    warnings: { cls: 'warning', label: 'Warnings' },
    passed: { cls: 'good', label: 'Passed' },
  } as const
  const m = map[status]
  return (
    <span className={`pill ${m.cls}`}>
      <span className="dot" aria-hidden />
      {m.label}
    </span>
  )
}

export function LifecyclePill({ style }: { style: ProductStyle }) {
  const label = style.lifecycle ?? 'not set'
  const cls =
    style.lifecycle === 'active'
      ? 'good'
      : style.lifecycle === 'retired'
        ? ''
        : style.lifecycle
          ? 'camel'
          : 'warning'
  return (
    <span className={`pill ${cls}`}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  )
}

export function ReviewPill({ state }: { state: ProductStyle['reviewState'] }) {
  const map = {
    'in-review': { cls: 'warning', label: 'In review' },
    approved: { cls: 'camel', label: 'Approved' },
    released: { cls: 'good', label: 'Released' },
  } as const
  const m = map[state]
  return (
    <span className={`pill ${m.cls}`}>
      <span className="dot" aria-hidden />
      {m.label}
    </span>
  )
}
