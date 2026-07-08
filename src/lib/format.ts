const DAY = 24 * 60 * 60 * 1000

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY)
}

export function isoInDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\w)/g, (m) => m.toUpperCase())
}
