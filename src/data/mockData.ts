import {
  AuditEntry,
  Channel,
  ColorGroup,
  ComplianceState,
  LegalEntity,
  LifecycleChange,
  LifecycleStatus,
  ProductCategory,
  ProductStyle,
  ReviewState,
  SizeGroup,
  VariantCell,
} from '../models/types'
import { statusOf, validateStyle } from '../lib/validation'

const DAY = 24 * 60 * 60 * 1000
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString()

export const LEGAL_ENTITIES: LegalEntity[] = [
  { id: 'VUS', name: 'Vince US', region: 'North America' },
  { id: 'VCA', name: 'Vince Canada', region: 'North America' },
  { id: 'VEU', name: 'Vince Europe B.V.', region: 'EMEA' },
  { id: 'VUK', name: 'Vince UK Ltd', region: 'EMEA' },
]

export const SIZE_GROUPS: SizeGroup[] = [
  { id: 'APP', name: 'Apparel alpha', sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL'] },
  { id: 'NUM', name: 'Apparel numeric', sizes: ['00', '0', '2', '4', '6', '8', '10', '12', '14'] },
  { id: 'ONE', name: 'One size', sizes: ['OS'] },
]

export const COLOR_GROUPS: ColorGroup[] = [
  { id: 'CORE', name: 'Core neutrals', colors: ['Black', 'Ivory', 'Camel', 'Heather Grey', 'Navy'] },
  { id: 'SEAS', name: 'Seasonal F26', colors: ['Sage', 'Terracotta', 'Dusty Rose', 'Deep Ocean'] },
  { id: 'DNM', name: 'Denim washes', colors: ['Indigo', 'Washed Black', 'Ecru'] },
]

const VENDORS = {
  knit: 'Prato Cashmere S.p.A.',
  silk: 'Seoul Silk House Co.',
  cotton: 'Lima Textiles S.A.C.',
  outer: 'Alba Outerwear S.r.l.',
  denim: 'Guimarães Denim Lda.',
}

interface Seed {
  n: string
  name: string
  cat: ProductCategory
  season?: string
  vendor?: string
  coo?: string
  hts?: string
  compliance?: ComplianceState
  master?: boolean
  sizeGroup?: string
  colorGroup?: string
  sizes?: string[]
  colors?: string[]
  channels?: Channel[]
  lifecycle?: LifecycleStatus
  scheduled?: LifecycleChange
  review?: ReviewState
  importedDaysAgo: number
  releasedTo?: string[]
  desc?: string
}

function variants(sizes: string[], colors: string[], releasedTo: string[], addedAt: string): VariantCell[] {
  const out: VariantCell[] = []
  for (const size of sizes)
    for (const color of colors) out.push({ size, color, releasedTo: [...releasedTo], addedAt })
  return out
}

function mk(s: Seed): ProductStyle {
  const importedAt = iso(-s.importedDaysAgo)
  const sizes = s.sizes ?? []
  const colors = s.colors ?? []
  const style: ProductStyle = {
    styleNumber: s.n,
    name: s.name,
    description: s.desc,
    category: s.cat,
    season: s.season ?? 'Fall 26',
    isMaster: s.master ?? true,
    sizeGroup: s.sizeGroup ?? 'APP',
    colorGroup: s.colorGroup ?? 'CORE',
    sizes,
    colors,
    variants: variants(sizes, colors, s.releasedTo ?? [], importedAt),
    channels: s.channels ?? ['Retail', 'E-Commerce'],
    vendor: s.vendor,
    countryOfOrigin: s.coo,
    htsCode: s.hts,
    compliance: s.compliance ?? 'passed',
    lifecycle: s.lifecycle,
    scheduledLifecycle: s.scheduled,
    reviewState: s.review ?? 'in-review',
    importedAt,
    source: 'PLM',
    issues: [],
    validationStatus: 'passed',
    lastValidatedAt: importedAt,
  }
  style.issues = validateStyle(style)
  style.validationStatus = statusOf(style.issues)
  return style
}

const IT = { vendor: VENDORS.knit, coo: 'Italy', hts: '6110.12.1060' }
const KR = { vendor: VENDORS.silk, coo: 'South Korea' }
const PE = { vendor: VENDORS.cotton, coo: 'Peru', hts: '6109.10.0060' }
const PT = { vendor: VENDORS.denim, coo: 'Portugal', hts: '6203.42.4511' }

export const MOCK_STYLES: ProductStyle[] = [
  // ---- stuck in review (> 5 days), most with validation errors — 12 styles ----
  mk({ n: 'V826-4101', name: 'Wool-Cashmere Crewneck', cat: 'Knitwear', vendor: IT.vendor, coo: 'Italy',
    sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Black', 'Ivory', 'Camel'], lifecycle: 'new',
    importedDaysAgo: 9, desc: 'Midweight crewneck in a wool-cashmere blend.' }),
  mk({ n: 'V826-4102', name: 'Ribbed Mock-Neck Sweater', cat: 'Knitwear', vendor: IT.vendor,
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Heather Grey', 'Navy'], lifecycle: 'new', importedDaysAgo: 12 }),
  mk({ n: 'V826-4110', name: 'Boiled Cashmere Funnel', cat: 'Knitwear', coo: 'Italy', hts: '6110.12.1060',
    sizes: ['S', 'M', 'L'], colors: ['Camel', 'Ivory'], lifecycle: 'new', importedDaysAgo: 7 }),
  mk({ n: 'V827-2205', name: 'Silk Slip Dress', cat: 'Dresses', ...KR, hts: '6204.43.4040',
    sizeGroup: 'NUM', colors: ['Black', 'Dusty Rose'], colorGroup: 'SEAS', sizes: [], lifecycle: 'new',
    importedDaysAgo: 15, desc: 'Bias-cut slip dress in sandwashed silk.' }),
  mk({ n: 'V827-2210', name: 'Pleated Midi Skirt', cat: 'Bottoms', ...KR, hts: '6204.53.3010',
    sizeGroup: 'NUM', sizes: ['0', '2', '4', '6', '8', '10'], colors: [], colorGroup: 'SEAS',
    lifecycle: 'new', importedDaysAgo: 8 }),
  mk({ n: 'V828-3301', name: 'Belted Wool Coat', cat: 'Outerwear', vendor: VENDORS.outer, coo: 'Italy',
    compliance: 'pending', sizes: ['XS', 'S', 'M', 'L'], colors: ['Camel', 'Black'], lifecycle: 'new',
    importedDaysAgo: 18, desc: 'Double-face wool wrap coat with self belt.' }),
  mk({ n: 'V828-3305', name: 'Quilted Liner Jacket', cat: 'Outerwear', hts: '6202.30.5020',
    sizes: ['S', 'M', 'L', 'XL'], colors: ['Black', 'Sage'], colorGroup: 'SEAS', lifecycle: 'new',
    importedDaysAgo: 11 }),
  mk({ n: 'V829-1120', name: 'Pima Cotton Tee', cat: 'Tops', ...PE, compliance: 'failed',
    sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL'], colors: ['Black', 'Ivory', 'Heather Grey'],
    lifecycle: 'new', importedDaysAgo: 6 }),
  mk({ n: 'V829-1125', name: 'Cotton Poplin Shirt', cat: 'Tops', vendor: VENDORS.cotton, coo: 'Peru',
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Navy'], lifecycle: 'new', importedDaysAgo: 13 }),
  mk({ n: 'V830-5501', name: 'Straight-Leg Jean', cat: 'Denim', vendor: VENDORS.denim, hts: '6204.62.8011',
    sizeGroup: 'NUM', colorGroup: 'DNM', sizes: ['0', '2', '4', '6', '8', '10', '12'],
    colors: ['Indigo', 'Washed Black'], lifecycle: 'new', importedDaysAgo: 10 }),
  mk({ n: 'V830-5505', name: 'Wide-Leg Trouser', cat: 'Bottoms', ...KR, hts: '6204.63.9010',
    sizeGroup: 'NUM', sizes: ['0', '2', '4', '6', '8'], colors: ['Black', 'Camel'],
    importedDaysAgo: 21, desc: 'Fluid wide-leg trouser in crepe suiting.' }),
  mk({ n: 'V831-9901', name: 'Silk Scarf Wrap', cat: 'Accessories', ...KR, hts: '62149010',
    sizeGroup: 'ONE', sizes: ['OS'], colors: ['Dusty Rose', 'Deep Ocean'], colorGroup: 'SEAS',
    importedDaysAgo: 9 }),

  // ---- approved, launching within 30 days — 5 styles ----
  mk({ n: 'V831-7001', name: 'Cashmere Wrap Cardigan', cat: 'Knitwear', ...IT, review: 'approved',
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Camel', 'Ivory'], lifecycle: 'new',
    scheduled: { status: 'active', effectiveDate: iso(9) }, importedDaysAgo: 24 }),
  mk({ n: 'V831-7002', name: 'Merino Polo Sweater', cat: 'Knitwear', ...IT, review: 'approved',
    sizes: ['S', 'M', 'L', 'XL'], colors: ['Navy', 'Black'], lifecycle: 'new',
    scheduled: { status: 'active', effectiveDate: iso(14) }, importedDaysAgo: 20 }),
  mk({ n: 'V827-2220', name: 'Satin Column Dress', cat: 'Dresses', ...KR, hts: '6204.43.4040',
    review: 'approved', sizeGroup: 'NUM', sizes: ['0', '2', '4', '6', '8', '10'],
    colors: ['Black', 'Deep Ocean'], colorGroup: 'SEAS', lifecycle: 'new',
    scheduled: { status: 'active', effectiveDate: iso(21) }, importedDaysAgo: 27 }),
  mk({ n: 'V829-1130', name: 'Linen Popover', cat: 'Tops', ...PE, review: 'approved',
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Sage'], colorGroup: 'SEAS', lifecycle: 'new',
    scheduled: { status: 'active', effectiveDate: iso(25) }, importedDaysAgo: 19 }),
  mk({ n: 'V830-5510', name: 'Cropped Flare Jean', cat: 'Denim', ...PT, review: 'approved',
    sizeGroup: 'NUM', colorGroup: 'DNM', sizes: ['0', '2', '4', '6', '8', '10'],
    colors: ['Indigo', 'Ecru'], lifecycle: 'new',
    scheduled: { status: 'active', effectiveDate: iso(28) }, importedDaysAgo: 22 }),

  // ---- carryover actives retiring within 30 days — 3 styles ----
  mk({ n: 'V801-1001', name: 'Essential V-Neck', cat: 'Knitwear', ...IT, review: 'released',
    season: 'Fall 24', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Black', 'Heather Grey'],
    lifecycle: 'active', scheduled: { status: 'retired', effectiveDate: iso(12) },
    importedDaysAgo: 420, releasedTo: ['VUS', 'VCA', 'VEU', 'VUK'] }),
  mk({ n: 'V802-2002', name: 'Slim Ankle Pant', cat: 'Bottoms', ...KR, hts: '6204.63.9010',
    review: 'released', season: 'Spring 25', sizeGroup: 'NUM',
    sizes: ['0', '2', '4', '6', '8', '10', '12', '14'], colors: ['Black', 'Navy'],
    lifecycle: 'active', scheduled: { status: 'retired', effectiveDate: iso(19) },
    importedDaysAgo: 300, releasedTo: ['VUS', 'VCA'] }),
  mk({ n: 'V803-3003', name: 'Classic Trench', cat: 'Outerwear', vendor: VENDORS.outer, coo: 'Italy',
    hts: '6202.30.5020', review: 'released', season: 'Spring 25', sizes: ['XS', 'S', 'M', 'L'],
    colors: ['Camel'], lifecycle: 'active', scheduled: { status: 'retired', effectiveDate: iso(26) },
    importedDaysAgo: 290, releasedTo: ['VUS', 'VEU', 'VUK'] }),

  // ---- released, active, clean (category peers used by "suggest from category") ----
  mk({ n: 'V820-4001', name: 'Cashmere Turtleneck', cat: 'Knitwear', ...IT, review: 'released',
    season: 'Fall 25', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Black', 'Camel', 'Ivory'],
    lifecycle: 'active', importedDaysAgo: 130, releasedTo: ['VUS', 'VCA', 'VEU', 'VUK'] }),
  mk({ n: 'V820-4002', name: 'Donegal Cardigan', cat: 'Knitwear', ...IT, review: 'released',
    season: 'Fall 25', sizes: ['S', 'M', 'L'], colors: ['Heather Grey', 'Camel'],
    lifecycle: 'active', importedDaysAgo: 128, releasedTo: ['VUS', 'VEU'] }),
  mk({ n: 'V821-2101', name: 'Draped Jersey Dress', cat: 'Dresses', ...KR, hts: '6204.43.4040',
    review: 'released', season: 'Fall 25', sizeGroup: 'NUM',
    sizes: ['0', '2', '4', '6', '8', '10'], colors: ['Black', 'Navy'], lifecycle: 'active',
    importedDaysAgo: 120, releasedTo: ['VUS', 'VCA', 'VEU'] }),
  mk({ n: 'V821-2102', name: 'Knit Sheath Dress', cat: 'Dresses', ...KR, hts: '6204.43.4040',
    review: 'released', season: 'Fall 25', sizeGroup: 'NUM', sizes: ['0', '2', '4', '6', '8'],
    colors: ['Black'], lifecycle: 'active', importedDaysAgo: 118, releasedTo: ['VUS'] }),
  mk({ n: 'V822-3201', name: 'Leather Moto Jacket', cat: 'Outerwear', vendor: VENDORS.outer,
    coo: 'Italy', hts: '4203.10.4030', review: 'released', season: 'Fall 25',
    sizes: ['XS', 'S', 'M', 'L'], colors: ['Black'], lifecycle: 'active',
    importedDaysAgo: 125, releasedTo: ['VUS', 'VEU'] }),
  mk({ n: 'V823-1101', name: 'Boxy Cotton Shirt', cat: 'Tops', ...PE, review: 'released',
    season: 'Fall 25', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Ivory', 'Black'],
    lifecycle: 'active', importedDaysAgo: 122, releasedTo: ['VUS', 'VCA', 'VEU', 'VUK'] }),
  mk({ n: 'V823-1102', name: 'Slub Long-Sleeve Tee', cat: 'Tops', ...PE, review: 'released',
    season: 'Fall 25', sizes: ['XS', 'S', 'M', 'L'], colors: ['Heather Grey', 'Ivory'],
    lifecycle: 'active', importedDaysAgo: 121, releasedTo: ['VUS', 'VCA'] }),
  mk({ n: 'V824-5201', name: 'Relaxed Taper Jean', cat: 'Denim', ...PT, review: 'released',
    season: 'Fall 25', sizeGroup: 'NUM', colorGroup: 'DNM',
    sizes: ['0', '2', '4', '6', '8', '10', '12'], colors: ['Indigo'], lifecycle: 'active',
    importedDaysAgo: 119, releasedTo: ['VUS', 'VEU'] }),
  mk({ n: 'V824-5202', name: 'Utility Chino', cat: 'Bottoms', ...PT, review: 'released',
    season: 'Fall 25', sizeGroup: 'NUM', sizes: ['0', '2', '4', '6', '8', '10'],
    colors: ['Camel', 'Black'], lifecycle: 'active', compliance: 'pending',
    importedDaysAgo: 117, releasedTo: ['VUS'] }),
  mk({ n: 'V825-9801', name: 'Ribbed Beanie', cat: 'Accessories', ...IT, hts: '6505.00.6090',
    review: 'released', season: 'Fall 25', sizeGroup: 'ONE', sizes: ['OS'],
    colors: ['Black', 'Camel', 'Heather Grey'], lifecycle: 'active', importedDaysAgo: 115,
    releasedTo: ['VUS', 'VCA', 'VEU', 'VUK'] }),
  mk({ n: 'V825-9802', name: 'Leather Belt', cat: 'Accessories', vendor: VENDORS.outer, coo: 'Italy',
    hts: '4203.30.0000', review: 'released', season: 'Fall 25', sizeGroup: 'ONE', sizes: ['OS'],
    colors: ['Black', 'Camel'], lifecycle: 'active', compliance: 'pending',
    importedDaysAgo: 114, releasedTo: ['VUS', 'VEU'] }),

  // ---- fresh imports (< 5 days, in review — not yet "stuck") ----
  mk({ n: 'V832-4301', name: 'Alpaca Shawl Cardigan', cat: 'Knitwear', vendor: IT.vendor,
    sizes: ['S', 'M', 'L'], colors: ['Camel', 'Ivory'], importedDaysAgo: 2 }),
  mk({ n: 'V832-2401', name: 'Velvet Wrap Dress', cat: 'Dresses', season: 'Holiday 26',
    sizeGroup: 'NUM', sizes: ['0', '2', '4', '6'], colors: ['Deep Ocean'], colorGroup: 'SEAS',
    importedDaysAgo: 1 }),
  mk({ n: 'V832-1501', name: 'Brushed Flannel Shirt', cat: 'Tops', vendor: VENDORS.cotton,
    coo: 'Peru', compliance: 'pending', sizes: ['XS', 'S', 'M', 'L'], colors: ['Navy'],
    importedDaysAgo: 3 }),
]

export const MOCK_AUDIT: AuditEntry[] = ([
  ...MOCK_STYLES.map((s, i) => ({
    id: `imp-${i}`,
    ts: s.importedAt,
    styleNumber: s.styleNumber,
    user: 'PLM Integration',
    action: 'imported' as const,
    detail: `Style imported from PLM (${s.season}) with ${s.variants.length || 'no'} size/color combinations.`,
  })),
  {
    id: 'a-1', ts: iso(-6), styleNumber: 'V820-4001', user: 'm.hargrove',
    action: 'variant-added', detail: "Size 'XL' added for colors Black, Camel (size group APP).",
  },
  {
    id: 'a-2', ts: iso(-6), styleNumber: 'V820-4001', user: 'm.hargrove',
    action: 'released', detail: 'Variants XL/Black, XL/Camel released to VUK.',
  },
  {
    id: 'a-3', ts: iso(-14), styleNumber: 'V801-1001', user: 'planning.svc',
    action: 'lifecycle-changed', detail: `Lifecycle scheduled: active → retired effective ${new Date(iso(12)).toLocaleDateString()}.`,
  },
  {
    id: 'a-4', ts: iso(-4), styleNumber: 'V831-7001', user: 's.linden',
    action: 'lifecycle-changed', detail: `Lifecycle scheduled: new → active effective ${new Date(iso(9)).toLocaleDateString()} (Fall 26 launch).`,
  },
  {
    id: 'a-5', ts: iso(-3), styleNumber: 'V827-2205', user: 's.linden',
    action: 'field-updated', detail: 'HTS code set to 6204.43.4040 (from category default).',
  },
] as AuditEntry[]).sort((a, b) => (a.ts < b.ts ? 1 : -1))
