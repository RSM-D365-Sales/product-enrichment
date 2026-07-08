import { ProductStyle, ValidationIssue, ValidationStatus } from '../models/types'

const HTS_RE = /^\d{4}\.\d{2}\.\d{4}$/

/** Rule set mirrors the required-field configuration in D365 F&SC.
    In a live implementation these rules are read from a parameter table. */
export function validateStyle(s: ProductStyle): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!s.vendor) {
    issues.push({
      type: 'missing-vendor',
      field: 'Vendor',
      message: 'No primary vendor is assigned to the released product.',
      severity: 'error',
    })
  }
  if (!s.countryOfOrigin) {
    issues.push({
      type: 'missing-country-of-origin',
      field: 'Country of origin',
      message: 'Country of origin is required for customs and reporting.',
      severity: 'error',
    })
  }
  if (!s.htsCode) {
    issues.push({
      type: 'missing-hts-code',
      field: 'HTS code',
      message: 'Harmonized tariff code is required before purchase orders can be confirmed.',
      severity: 'error',
    })
  } else if (!HTS_RE.test(s.htsCode)) {
    issues.push({
      type: 'invalid-hts-format',
      field: 'HTS code',
      message: `HTS code "${s.htsCode}" does not match the expected format 9999.99.9999.`,
      severity: 'warning',
    })
  }
  if (s.isMaster && s.sizes.length === 0) {
    issues.push({
      type: 'missing-size-range',
      field: 'Size range',
      message: 'Product master has no active sizes from its size group.',
      severity: 'error',
    })
  }
  if (s.isMaster && s.colors.length === 0) {
    issues.push({
      type: 'missing-color-range',
      field: 'Color range',
      message: 'Product master has no active colors from its color group.',
      severity: 'error',
    })
  }
  if (!s.lifecycle) {
    issues.push({
      type: 'missing-lifecycle',
      field: 'Lifecycle status',
      message: 'Product lifecycle state has not been set.',
      severity: 'error',
    })
  }
  if (s.compliance === 'failed') {
    issues.push({
      type: 'compliance',
      field: 'Compliance',
      message: 'Product compliance check failed — restricted-substance documentation rejected.',
      severity: 'error',
    })
  } else if (s.compliance === 'pending' || s.compliance === 'unknown') {
    issues.push({
      type: 'compliance',
      field: 'Compliance',
      message: 'Product compliance documentation has not been confirmed.',
      severity: 'warning',
    })
  }

  return issues
}

export function statusOf(issues: ValidationIssue[]): ValidationStatus {
  if (issues.some((i) => i.severity === 'error')) return 'errors'
  if (issues.length > 0) return 'warnings'
  return 'passed'
}

/** Re-run validation in place and return the same style object. */
export function revalidated(s: ProductStyle): ProductStyle {
  const issues = validateStyle(s)
  return {
    ...s,
    issues,
    validationStatus: statusOf(issues),
    lastValidatedAt: new Date().toISOString(),
  }
}
