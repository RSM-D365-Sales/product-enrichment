# Vince · Popup Store Agent — Design Document

> **Status:** design / starting point. This document is the blueprint for a new
> RSM presales demo for **Vince** (www.vince.com). It deliberately **reuses the
> platform** proven in the **Consignment Inventory Agent** — same look and feel,
> same architecture, same data-source seam, same tool-calling assistant — and
> retargets it to **popup store operations**.
>
> **Complexity target:** *parity, not harder.* Every heavy pattern already
> exists in the Consignment app. The only genuinely new technical piece is
> **spreadsheet (Excel) upload** for allocation. Everything else is a reskin +
> retarget.

---

## 1. The idea in one sentence

Let Vince wholesale/retail ops **stand up a popup store in minutes** — at a
fashion event or inside a department store — by allocating inventory to a
**temporary virtual warehouse**, reserving it against real DC stock, selling out
of it, and transferring the leftovers back — with an **agent side card** that
answers questions and drafts the moves.

## 2. Why this maps cleanly onto the existing platform

The Consignment app is built around one core metaphor: **a partner is a virtual
D365 warehouse**, and the agent drafts a **transfer order** to move stock in the
right direction. The Popup app is the *same metaphor with the arrow reversed and
a clock added*:

| Consignment app | Popup app |
| --- | --- |
| Retail partner = virtual warehouse | **Popup event = time-boxed virtual warehouse** |
| Season Return drafts a return email + transfer **partner → DC** | **Allocation** drafts a stocking transfer **DC → popup** |
| Receiving lowers partner on-hand | **Selling** lowers popup on-hand |
| Liquidation sale to a discounter | **Retail sale** out of the popup |
| — | **Return remaining** transfer **popup → DC** at teardown |
| Transfers page tracks Created→Picking→In transit→Received | Same lifecycle, two directions |
| Inventory Queue ranks partners | **Events Queue** ranks popups |
| Tool-calling assistant, human-in-the-loop cards | Same assistant, retargeted tools |

Because of this, ~80% of the code is a **retarget of existing modules**, not new
work. See [§10 Reuse map](#10-reuse-map-what-to-copy-from-the-consignment-app).

## 3. Target user & demo narrative

**Audience:** Vince retail/wholesale operations and merchandising.

**Demo story (≈4 minutes):**

1. "Vince has a two-week holiday popup opening inside **Nordstrom NYC**." → open
   **New Popup**, fill event name, venue, dates.
2. "Let's stock it." → build the allocation three ways: **from a template**,
   **from last year's event**, or **drag in an Excel file**; edit units inline.
3. The app **validates against DC on-hand**, flags shortfalls, then on **Confirm**
   it **reserves the stock and creates the outbound transfer order** (DC → popup).
4. "The popup is live." → record a few **sales**; the **event dashboard** updates
   sell-through, revenue, and **margin** in real time.
5. "It's closing Sunday." → the agent **drafts the return** of remaining units;
   one click creates the **return transfer order** (popup → DC).
6. Throughout, ask the **assistant**: *"How is the Nordstrom popup tracking?"*,
   *"Build an allocation for the Miami event from last year's sellers."*,
   *"Return everything left at Saks."*

## 4. Scope (v1)

**In scope**
- Create/manage popup events (venue, host, dates, source DC).
- Build an allocation plan via **template**, **previous event**, **Excel upload**,
  and **manual edit**; validate against DC availability.
- **Reserve + outbound transfer order** (DC → popup virtual warehouse).
- **Record sales** out of the popup; live metrics (sales, inventory, margin,
  sell-through).
- **Return remaining** inventory (popup → DC transfer order).
- **Transfers** tracking for both directions.
- **Setup** (D365 connection, DC mapping, hosts/venues, templates, assistant),
  mock ⇄ live toggle.
- **Assistant** side card (tool-calling, grounded, human-in-the-loop).

**Out of scope (v1) / roadmap**
- Real point-of-sale hardware / D365 Commerce Store Commerce integration
  (sales are recorded in-app for the demo).
- Live D365 write-back (documented stub; same approach as Consignment).
- Real Excel *templates library* persistence beyond localStorage.
- Multi-currency, tax, and payment processing.

## 5. Domain model

New `models/` types (names mirror the Consignment app's conventions).

```ts
// models/types.ts — popup domain
export type VenueType = 'department-store' | 'fashion-event' | 'standalone'

export type PopupStatus =
  | 'planning'    // being built, no stock moved
  | 'stocking'    // outbound transfer created, in transit
  | 'live'        // open and selling
  | 'closing'     // return being drafted
  | 'closed'      // reconciled, remaining returned

export interface PopupEvent {
  id: string                 // e.g. "POP-NORDNYC-H26"
  name: string               // "Vince × Nordstrom NYC · Holiday"
  venueType: VenueType
  hostId?: string            // department-store host (reuse Host/partner), if any
  location: string           // "New York, NY · 5th Ave, L2"
  startDate: string          // ISO
  endDate: string            // ISO
  status: PopupStatus
  virtualWarehouseId: string // the popup's D365 InventLocationId
  sourceDcWarehouseId: string// the DC stock is reserved/transferred from
  accent: string             // visual accent (reuse PARTNER_ACCENTS)
  salesTarget?: number       // $ target for the run (optional)
}

// A planned allocation line (before it becomes on-hand at the popup)
export interface AllocationLine {
  id: string
  eventId: string
  itemNumber: string         // style/SKU
  styleName: string
  category: ProductCategory  // reuse Consignment categories
  season: Season
  variant?: string           // size / color, optional
  unitCost: number
  retailPrice: number
  plannedUnits: number
  dcOnHand: number           // available at source DC (for validation)
  source: 'template' | 'excel' | 'previous-event' | 'manual'
}

// On-hand at the popup after the outbound transfer is received
export interface PopupInventoryLine {
  id: string
  eventId: string
  itemNumber: string
  styleName: string
  category: ProductCategory
  season: Season
  variant?: string
  unitCost: number
  retailPrice: number
  unitsOnHand: number        // decremented by sales, source for return
  unitsSold: number
}

export interface Sale {
  id: string
  eventId: string
  ts: string                 // ISO timestamp
  itemNumber: string
  units: number
  unitPrice: number          // actual sale price (may include discount)
  discountPct: number        // 0 = full price
  saleValue: number          // units * unitPrice
  cost: number               // units * unitCost
  margin: number             // saleValue - cost
}

export interface AllocationTemplate {
  id: string
  name: string               // "Contemporary Holiday Core"
  description?: string
  lines: Array<Pick<AllocationLine,
    'itemNumber' | 'styleName' | 'category' | 'season' | 'variant' | 'plannedUnits'>>
}
```

Reuse **as-is** from Consignment: `ProductCategory`, `Season`, `Metric`
(`'value' | 'units'`), the `Customer`-shaped record (repurposed as **Host /
Venue** for department stores), and the transfer-order lifecycle in
`models/operations.ts`.

### Event lifecycle (state machine)

```
planning ──(confirm allocation: reserve + create DC→popup transfer)──▶ stocking
stocking ──(transfer received at popup)──▶ live
live     ──(record sales; on-hand ⬇)──▶ live
live     ──(draft return)──▶ closing
closing  ──(return transfer popup→DC received)──▶ closed
```

Two `TransferOrder`s per event over its life: **outbound** (DC → popup,
`kind: 'outbound'`) and **return** (popup → DC, `kind: 'return'`). Extend the
existing `TransferOrder` with a `direction` field; keep the same
Created→Picking→In transit→Received status track.

## 6. Metrics (per event and portfolio)

All derived client-side in a `lib/aggregations.ts` (mirrors Consignment):

- **Allocated** — units & value (cost / retail) planned/stocked.
- **Sold** — units, **revenue** (Σ saleValue), **cost of goods**, **margin $**,
  **margin %** = margin / revenue.
- **On-hand / remaining** — units & value still in the popup.
- **Sell-through %** — unitsSold / allocatedUnits.
- **Pace vs target** — revenue vs `salesTarget`, and vs. days elapsed / total.
- **By category / by day / by style** — for charts and the assistant.
- **Portfolio** — totals and ranking across all events (feeds the Events Queue
  and `get_events_summary`).

Money/units formatting reuses `lib/format.ts`.

## 7. Screens / information architecture

Routing: **HashRouter** + relative Vite `base: './'` (same as Consignment, so it
deploys to any GitHub Pages path).

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | **Popup Events** (landing) | Ranked queue of events (Upcoming · Live · Closed) with KPIs (allocated, sold, sell-through, margin). One **Dollars ⇄ Units** toggle for the whole board. Filter by status/venue. *(Analog of Inventory Queue.)* |
| `/event/:eventId` | **Event detail** | KPIs, category/day breakdown charts, on-hand line list, and the **sales log**. Actions: Record sale, Draft return, Reprint pick list. *(Analog of Customer detail.)* |
| `/new` and `/new/:eventId` | **New Popup / Allocate** | The core workflow. Create the event, then build the allocation (Template · Previous event · **Excel upload** · Manual), validate vs DC on-hand, **Confirm & reserve + create outbound transfer**. *(Analog of Season Return.)* |
| `/transfers` | **Transfers** | Track outbound (DC→popup) and return (popup→DC) transfer orders through their lifecycle; reprint pick lists / labels. *(Reuse the Transfers page + shipping labels.)* |
| `/setup` | **Setup** | D365 connection & main DC, host/venue mapping, **allocation templates**, mock ⇄ live toggle, assistant config. *(Analog of Setup.)* |
| side card | **Popup Assistant** | Natural-language Q&A + actions, grounded in the same aggregation logic. *(Reuse ChatPanel + retargeted tools.)* |

## 8. Core flows

### 8.1 Allocation (the signature workflow)

`New Popup` screen, three ways to fill the allocation table (all land in the same
editable grid; every row tagged with its `source`):

1. **From template** — pick a saved `AllocationTemplate`; expands to lines with
   suggested `plannedUnits`.
2. **From a previous event** — pick a past popup; seed the plan from its **top
   sellers** (units sold, sell-through). This is the "previous popup events
   sales" ask — a simple ranked copy, *not* a forecast (keeps complexity flat).
3. **Excel/CSV upload** — drag in a spreadsheet; parsed client-side (see §9).
4. **Manual** — add/edit/remove rows inline; adjust `plannedUnits`.

Then **validate**: for each line, compare `plannedUnits` vs `dcOnHand`.
Flag shortfalls (over-allocation) and unknown SKUs. Show running totals (units,
cost, retail).

**Confirm & stock** → calls the service to (a) **reserve** the planned units
against DC on-hand and (b) **create the outbound transfer order** DC → popup
virtual warehouse. The event moves `planning → stocking`. A **pick list**
(reuse the shipping-label generator) can be printed.

### 8.2 Selling out of the popup

On the event detail page (event is `live`): **Record sale** — quick entry
(pick style, units, optional discount %) or a small "bulk day" entry. Applies a
per-line **removal** to `PopupInventoryLine.unitsOnHand` (exact overlay pattern
the Consignment app uses for receiving/selling), appends a `Sale`, and updates
metrics live. The agent can also record sales via a confirm card.

### 8.3 Return remaining

When `closing`: **Draft return** collects all lines with `unitsOnHand > 0` and
proposes a **return transfer order** popup → DC. On confirm, it creates the
transfer (reuse the transfer lifecycle) and, on receipt, the popup on-hand zeroes
out and the event goes `closed`. The agent's `return_remaining` tool proposes the
same card.

## 9. Excel / spreadsheet upload (the one new piece)

The only capability with no direct analog in the Consignment app.

- **Library:** [SheetJS `xlsx`](https://sheetjs.com) (community build) for
  `.xlsx`; fall back to a tiny built-in CSV parser for `.csv`. This is the sole
  new runtime dependency.
- **Downloadable template:** a **"Download template"** button emits a
  pre-formatted `.xlsx`/`.csv` with the expected columns and one example row, so
  users start from a known-good shape.
- **Expected columns** (header row, case-insensitive, order-independent):
  `Item Number` · `Style` · `Category` · `Season` · `Variant` (optional) ·
  `Unit Cost` · `Retail Price` · `Units`.
- **Parse → preview → reconcile:** show every parsed row in the allocation grid
  with inline validation:
  - unknown `Item Number` (not in DC catalog) → warn, allow keep/drop;
  - `Units > dcOnHand` → over-allocation flag;
  - missing/invalid numeric fields → row error.
- **All client-side.** No upload server; the file never leaves the browser —
  consistent with the static GitHub Pages hosting model.

`lib/excel.ts` owns parse + template-generate; the grid consumes typed
`AllocationLine[]`.

## 10. Reuse map (what to copy from the Consignment app)

Copy these modules and **retarget names/labels**, keep the structure:

| From Consignment | Reuse as | Change |
| --- | --- | --- |
| `styles/theme.css` + `styles/app.css` | **verbatim** | none — same Vince quiet-luxury design system (cream/ink/camel, Cormorant Garamond + Jost) |
| `components/layout/AppShell.tsx` | AppShell | swap NAV items + brand sub-label ("Popup Agent") |
| `components/chat/*` (ChatPanel, ActionCardView) | Assistant side card | new card kinds (allocation, sale, return) |
| `context/ConfigContext.tsx` | ConfigContext | events + hosts + templates instead of partners/mappings |
| `context/ChatContext.tsx` | ChatContext | wire retargeted tools |
| `context/InventoryContext.tsx` + `TransfersContext.tsx` | Popup inventory + transfers | overlay/removal + two-direction transfers |
| `services/d365Service.ts` (+ index/mock/live) | **service seam** | new interface methods (§11); mock impl + documented live stub |
| `lib/agentTools.ts` · `heuristicAgent.ts` · `azureAgent.ts` | agent layer | retargeted tool set (§12) |
| `lib/aggregations.ts` · `format.ts` · `shipping.ts` | verbatim-ish | popup metrics; pick lists reuse label generator |
| `components/charts/StackedBar.tsx`, `InventoryTable.tsx`, `ui/*` | verbatim-ish | relabel |
| `.github/workflows/deploy.yml`, Vite config, `HashRouter` | verbatim | GitHub Pages deploy unchanged |

**Design tokens are already defined** in `theme.css` (palette, spacing, radius,
`.btn`, `.card`, `.pill`, `.eyebrow`, `--nav-width`, `--chat-width`). Do not
reinvent — import the same file.

## 11. Data source strategy (mock ⇄ live D365)

Single interface seam, same pattern as `D365Service`. Factory returns
`MockPopupService` (default, bundled data) or `LivePopupService` (documented stub
that throws until OAuth+OData is wired). Toggle in **Setup**.

```ts
export interface PopupService {
  readonly live: boolean
  getEvents(): Promise<PopupEvent[]>
  getHosts(): Promise<Host[]>                         // department-store venues
  getDcInventory(): Promise<AllocationLine[]>         // available at source DC
  getPopupInventory(eventId: string): Promise<PopupInventoryLine[]>
  getSales(eventId: string): Promise<Sale[]>

  // Confirm allocation → reserve at DC + outbound transfer DC→popup
  reserveAndStock(input: {
    event: PopupEvent
    lines: AllocationLine[]
  }): Promise<TransferOrderResult>

  recordSale(eventId: string, sale: Sale): Promise<void>

  // Return remaining → transfer popup→DC
  returnRemaining(input: {
    event: PopupEvent
    lines: PopupInventoryLine[]
  }): Promise<TransferOrderResult>
}
```

**Mock:** a deterministic Vince popup dataset (2–3 past events with sales, 1 live,
1 upcoming; a DC catalog with on-hand). **Live (stub):** documented mapping to
D365 F&SC — reservations (`InventTrans`/reservation API), transfer orders
(`InventTransferOrder`/`InventTransferLine`), and **virtual warehouse
provisioning** (`InventLocation`). The runbook goes in
`docs/FUTURE-INTEGRATION.md` (mirror the Consignment doc).

Config persists to `localStorage` under a new key
(`vince-popup-agent.config.v1`); merge-over-defaults loader like Consignment.

## 12. Assistant (tool-calling side card)

Same architecture: shared typed tools (`lib/agentTools.ts`) that run the same
aggregation logic → **grounded numbers, never hallucinated**. Two transports
behind one seam — **heuristic** (offline default, rule-based router) and **Azure
OpenAI** (function calling + SSE streaming, BYO-key in Setup). Actions stay
**human-in-the-loop** — every mutating tool proposes an `ActionCard`; an explicit
click executes.

**Retargeted tool set:**

| Tool | Purpose | Card? |
| --- | --- | --- |
| `get_events_summary` | Portfolio across all popups (allocated, sold, margin, sell-through). | — |
| `compare_events` | Rank events by a metric (revenue, margin, sell-through), optional filters. | — |
| `get_event_details` | One event's KPIs, top categories/styles, pace vs target. | — |
| `query_inventory` | Flexible aggregation grouped by event/category/style/day. | — |
| `draft_allocation` | Propose an allocation for an event from a **template** or **previous event**. | ✅ confirm → reserve + outbound transfer |
| `record_sale` | Record a sale out of a popup. | ✅ confirm |
| `return_remaining` | Draft the return of leftover stock. | ✅ confirm → return transfer |
| `list_transfers` | List outbound/return transfer orders + statuses. | — |

Prod path = Azure Function proxy (key server-side), same as Consignment Track C.

## 13. Tech stack

Identical to Consignment (so tooling, deploy, and muscle memory carry over):

- **React 18 + TypeScript + Vite**
- **HashRouter**, relative `base: './'` → GitHub Pages at any path
- No backend; `PopupService` interface is the single data seam (mock + live stub)
- Tool-calling agent: heuristic (offline) + Azure OpenAI (SSE) behind a shared
  tool layer
- **New dependency:** `xlsx` (SheetJS) for spreadsheet upload/template
- Vince design system (custom CSS tokens; Cormorant Garamond + Jost)

## 14. Proposed project layout

```
src/
  models/        types.ts (popup domain) · config.ts (settings + hosts + templates)
                 · operations.ts (transfer orders, 2 directions) · chat.ts
  data/          mockData.ts (events, DC catalog, past sales, templates)
  services/      popupService.ts (interface) · mock / live impls · factory
  context/       ConfigContext · PopupInventoryContext · TransfersContext · ChatContext
  lib/           aggregations · format · excel (parse + template) · shipping (pick lists)
                 · agentTools · heuristicAgent · azureAgent
  components/    layout · charts · event queue card · allocation grid · sale dialog
                 · chat/ (ChatPanel · ActionCardView)
  pages/         PopupEvents · EventDetail · NewPopup · Transfers · Setup
  styles/        theme.css (tokens, reused) · app.css (layout + components)
docs/            FUTURE-INTEGRATION.md
```

## 15. Build phases (each independently demoable)

0. **Scaffold** — copy the Consignment platform; reskin brand/nav; strip
   consignment-specific pages. *(≈½ day; mostly mechanical.)*
1. **Events Queue + Event detail** on mock data (KPIs, charts, sales log).
2. **Allocation workflow** — template + manual grid → validate vs DC → **Confirm
   & reserve + outbound transfer**; Transfers page shows it move.
3. **Excel upload** — parse + downloadable template + previous-event seeding.
4. **Sell + live metrics** — record sale, on-hand overlay, margin/sell-through.
5. **Return remaining** — return transfer popup→DC; event → closed.
6. **Assistant** — retargeted tools + side card (heuristic first, Azure optional).
7. **Setup + live stub + deploy** — mock⇄live toggle, `FUTURE-INTEGRATION.md`,
   GitHub Pages workflow.

## 16. Open decisions (confirm before/early in build)

1. **Excel support depth** — `.xlsx` via SheetJS *and* `.csv`, or CSV-only to
   avoid a dependency? *(Recommend: both; SheetJS is small and the demo pops.)*
2. **Reservation model** — soft-reserve at DC on allocation, then transfer; or
   go straight to the outbound transfer order? *(Recommend: reserve-then-transfer
   to tell the fuller D365 story; both are one service method.)*
3. **Virtual warehouse provisioning** — auto-create the popup `InventLocation` on
   event creation, or assume it's pre-created and just mapped in Setup?
   *(Recommend: auto-create in mock; document both for live.)*
4. **Sales entry granularity** — per-transaction vs per-day bulk? *(Recommend:
   quick per-line entry + optional day bulk; keeps the demo lively.)*
5. **Host/venue reuse** — model department-store hosts with the existing
   `Customer`/partner record and runtime logo fetch, or a lighter `Host` type?
   *(Recommend: reuse partner record + Clearbit/favicon logo fetch.)*

## 17. Notes & disclaimers

- Sample data is fictional and generated deterministically for a stable demo.
- "Vince", "Nordstrom", "Saks Fifth Avenue", etc. are used illustratively for a
  presales demonstration. Host logos are fetched at runtime by domain
  (Clearbit → favicon → monogram); none are bundled.
- Uploaded spreadsheets are parsed **in the browser** and never transmitted.
```
