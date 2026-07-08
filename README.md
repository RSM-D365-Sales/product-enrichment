# Vince · Product Validation & Enrichment Workspace

An RSM presales demo built on the same platform patterns as the Consignment / Popup Store
agents (see [DESIGN.md](DESIGN.md)): React + TypeScript + Vite, HashRouter, the Vince
quiet-luxury design system, a single mock ⇄ live data-source seam, and a tool-calling
assistant side card with human-in-the-loop action cards.

**What's different here:** the assistant is powered by **Claude on Microsoft Foundry**
(Azure AI Foundry) for real-time discussion, updates and analysis — streaming responses
and tool calling against the workspace's own aggregation logic, so every number it quotes
is grounded in the data on screen.

## What it does

The workspace gives a centralized view of product styles imported from the **PLM into
D365 F&SC**, so users can validate, review and enrich product data before it is released
downstream (sourcing, inventory, order fulfillment):

- **Workspace dashboard** — KPI tiles (total imported styles, validation errors, stuck in
  review > 5 days, new styles next 30 days, retiring next 30 days, ready for release), a
  chart of the most common validation issues (click a bar to filter), and a prioritized
  attention queue. Every style number links to its detail page.
- **Validation & enrichment** — automatic rules flag missing vendor, country of origin,
  HTS code, size range, color range, lifecycle status and compliance. Fix fields inline,
  or click **Suggest from category** to draft values from other products in the same
  category; saving revalidates immediately.
- **Update existing styles** — search by product and legal entity; view the size/color
  grid with per-legal-entity release status; add sizes/colors from the assigned size and
  color groups; change lifecycle **including future dating** (drives season launches and
  planned retirements); release to selected legal entities; full lifecycle + audit history
  of when size/color combinations were added and released.
- **Assistant side card** — ask *"What's stuck in review?"*, *"Suggest data for
  V826-4102"*, *"Retire V801-1001 in 30 days"*, *"Release V831-7001 to VUS and VCA"*.
  Mutating requests become **action cards you confirm** — nothing changes automatically.

## Run it

```sh
npm install
npm run dev        # local dev
npm run build      # typecheck + production build (dist/, relative base → any static host)
```

Defaults: bundled deterministic sample data (34 styles) + the offline heuristic assistant,
so the demo works with zero configuration.

## Enable Claude on Microsoft Foundry

1. In [Azure AI Foundry](https://ai.azure.com), create/choose a resource with a **Claude**
   model deployment (the demo defaults to `claude-opus-4-8`). Claude is served through the
   resource's Anthropic-compatible endpoint:
   `https://<resource>.services.ai.azure.com/anthropic/v1`.
2. In the app, open **Setup → Assistant**, choose *Claude on Microsoft Foundry*, and enter
   the **resource name** (e.g. `my-resource` — pasting the full
   `my-resource.services.ai.azure.com` host or any resource URL also works; the app
   normalizes it), the API key, and the model/**deployment name** from *Models +
   endpoints*. The base-URL override is only needed for a proxy, and should end at
   `/anthropic/` (the SDK appends `v1/messages`). Use **Test connection** to verify, then
   save.
3. Chat. The agent streams responses and calls the workspace tools
   (`get_workspace_summary`, `get_validation_issues`, `get_style_details`, `search_styles`,
   `suggest_enrichment`, `set_lifecycle`, `add_variants`, `release_style`,
   `get_audit_history`). Reads execute instantly; writes always come back as confirmation
   cards.

Implementation: [src/lib/foundryAgent.ts](src/lib/foundryAgent.ts) uses the official
[`@anthropic-ai/foundry-sdk`](https://www.npmjs.com/package/@anthropic-ai/foundry-sdk)
with `messages.stream()` and a manual tool loop (the loop is manual on purpose — mutating
tools must pause for human confirmation instead of auto-executing).

> **Key handling** — this is a BYO-key demo: the key lives in `localStorage` and is sent
> from the browser (`dangerouslyAllowBrowser`). For production, put an Azure Function /
> API Management proxy in front of the Foundry endpoint so the key stays server-side, and
> point the *Base URL override* at the proxy. If the browser call fails with a CORS error,
> that proxy is the fix as well.

## Connect the Dynamics 365 ERP MCP server (create data in F&SC)

With the Claude transport active, the assistant can also be attached to Microsoft's
**Dynamics 365 ERP MCP server**, giving it the server's `data_*` (OData CRUD), `form_*`
(drive application forms) and `api_*` (invoke X++ actions) tools — enough to create
products, orders, or any entity data directly in a Finance & Supply Chain environment.

**How it connects:** the app bridges MCP itself ([src/lib/mcpClient.ts](src/lib/mcpClient.ts)).
At the start of a chat turn it initializes the MCP session, lists the server's tools, and
merges them into Claude's tool list; when Claude calls one, the app executes the JSON-RPC
`tools/call` and feeds the result back. (Foundry's server-side `mcp_connector` is not used —
it returns `mcp_connector not supported in your workspace` on standard deployments.)
Because the D365 endpoint sends no CORS headers, browser calls route through a proxy:
the Vite dev server's `/api/mcp` under `npm run dev`, or the **helper Azure Function**
(below) for deployed sites. Both mint the bearer token server-side from the stored app
registration when none is pasted, so no manual tokens are needed.

## Deploy: GitHub Pages + helper Azure Function

The site is static (GitHub Pages); the only server piece is the helper Function App in
[azure-function/](azure-function/), which holds the Entra app registration credentials and
exposes two endpoints matching the dev helpers:

- `GET /api/mcp-token` — mints a bearer token via client credentials (cached until expiry)
- `POST /api/mcp` — forwards MCP JSON-RPC to the D365 endpoint, auto-injecting the token

**1. Deploy the site** — push to `main`; [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds and publishes `dist/` to GitHub Pages (enable Pages → Source: GitHub Actions in the
repo settings once).

**2. Deploy the helper Function** — for click-by-click Azure Portal instructions (no CLI),
see [docs/AZURE-FUNCTION-SETUP.md](docs/AZURE-FUNCTION-SETUP.md). CLI equivalent:

```sh
az group create -n rg-pea-demo -l eastus
az storage account create -n <uniquestoragename> -g rg-pea-demo -l eastus --sku Standard_LRS
az functionapp create -n <unique-func-name> -g rg-pea-demo -s <uniquestoragename> \
  --consumption-plan-location eastus --runtime node --runtime-version 20 --functions-version 4

az functionapp config appsettings set -n <unique-func-name> -g rg-pea-demo --settings \
  D365_TENANT_ID=<tenant-guid> \
  D365_CLIENT_ID=<app-registration-client-id> \
  D365_CLIENT_SECRET=<secret-value> \
  D365_RESOURCE=https://<environment>.operations.dynamics.com \
  D365_MCP_URL=https://<environment>.operations.dynamics.com/mcp \
  ALLOWED_ORIGIN=https://www.rsmd365.com \
  PROXY_SHARED_KEY=<long-random-string>

cd azure-function && npm install && func azure functionapp publish <unique-func-name>
```

**3. Point the app at it** — Setup → Dynamics 365 ERP MCP: set *Helper Function base URL*
to `https://<unique-func-name>.azurewebsites.net` and *Helper shared key* to the
`PROXY_SHARED_KEY` value; leave the bearer-token field empty (the Function mints tokens).

Security notes: the secret lives only in Function App settings (upgrade path: Key Vault
references). The shared key + `ALLOWED_ORIGIN` gate the proxy — anyone with the key can
drive the D365 service account, so scope its security role tightly and point it at a
sandbox. Rotate `PROXY_SHARED_KEY` and the client secret when the demo winds down.

**F&O environment prerequisites** ([docs](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/copilot/copilot-mcp)):

1. Version **10.0.47+** (or 10.0.46 PQU-2 / 10.0.45 PQU-7); Tier 2+ or Unified Developer
   environment (not cloud-hosted dev VMs).
2. Feature **“Dynamics 365 ERP Model Context Protocol server”** enabled in Feature
   Management (on by default).
3. On the **Allowed MCP clients** page, add the Entra ID **client ID that will mint your
   token** and set Allowed = Yes. Only Copilot Studio and VS Code are allowed by default.
   For a quick demo with the Azure CLI, allow `04b07795-8ddb-461a-bbee-02f9e1bf7b46`.
4. Give the authenticating user/agent identity a security role scoped to what the agent
   should touch — the MCP server enforces it on every tool call.

**App setup** (Setup → Dynamics 365 ERP MCP):

- Endpoint: `https://<environment>.operations.dynamics.com/mcp`
- Token: `az account get-access-token --resource https://<environment>.operations.dynamics.com`
  (short-lived — paste a fresh one when calls 401)
- Tick *Attach the D365 ERP MCP server* and save.

Then ask things like *“Create the 12 stuck styles as released products in the sandbox”* —
Claude discovers entities with `data_find_entity_type` / `data_get_entity_metadata` and
creates records with `data_create_entities`. **Note:** MCP tools execute server-side
immediately; the app cannot gate them with confirmation cards, so the system prompt
requires the assistant to state every intended write and get your explicit yes in chat
first. Point it at a **sandbox**, and mind the metering (0.1 Copilot credits per tool call
for non-Copilot-Studio clients).

## Architecture

```
src/
  models/     types.ts (product domain) · config.ts (persisted settings) · chat.ts (messages, action cards)
  data/       mockData.ts (deterministic: 12 stuck in review, 5 launching, 3 retiring)
  services/   productService.ts (seam) · mockProductService.ts · liveProductService.ts (documented stub)
  lib/        validation.ts (rule set) · aggregations.ts (KPIs, suggestions) · format.ts
              agentTools.ts (shared tool layer) · heuristicAgent.ts (offline) · foundryAgent.ts (Claude)
  context/    ConfigContext · ProductsContext · ChatContext
  components/ layout/AppShell · charts/IssueBarChart · ui/KpiTile · ui/Pill · chat/ChatPanel + ActionCardView
  pages/      Workspace · Styles · StyleDetail · Setup
  styles/     theme.css (Vince tokens, validated chart palette) · app.css
docs/         FUTURE-INTEGRATION.md (D365 F&SC live wiring runbook)
```

Both assistant transports share one tool layer ([src/lib/agentTools.ts](src/lib/agentTools.ts)),
which runs the same aggregation code as the dashboard — grounded numbers, never hallucinated.
Data flows through the `ProductService` seam; the mock service keeps in-memory state, writes
the audit trail, and revalidates after every mutation. The live stub documents the D365
OData mapping (see [docs/FUTURE-INTEGRATION.md](docs/FUTURE-INTEGRATION.md)).

## Notes & disclaimers

- Sample data is fictional and generated deterministically (dates are relative to "today"
  so the KPIs always read well in a demo).
- "Vince" is used illustratively for a presales demonstration.
- Validation rules mirror a required-field configuration in D365 F&SC and are intended to
  be table-driven in a live implementation.
