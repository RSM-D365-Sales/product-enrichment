# Helper Azure Function — manual setup guide (Azure Portal)

Step-by-step portal instructions for deploying the helper Function App in
[`azure-function/`](../azure-function/). The Function holds the Entra app registration
(client ID + secret) and exposes two endpoints the app uses:

| Endpoint | What it does |
| --- | --- |
| `GET /api/mcp-token` | Mints a bearer token for the F&O environment via client credentials (cached until expiry) |
| `POST /api/mcp` | Forwards MCP JSON-RPC to the Dynamics 365 ERP MCP server, auto-injecting the token |

Repo: `https://github.com/RSM-D365-Sales/product-enrichment` · Deployed site:
`https://www.rsmd365.com/product-enrichment/` (the org's custom Pages domain — the
`rsm-d365-sales.github.io` URL 301-redirects there, so the browser origin is
`https://www.rsmd365.com`)

---

## Step 0 — Gather your values

Have these ready before you start (a scratch notepad helps):

| # | Value | Where it comes from |
| --- | --- | --- |
| 1 | Tenant ID | Entra ID → Overview → *Tenant ID* |
| 2 | Client ID | The app registration (Step 1) |
| 3 | Client secret value | The app registration (Step 1) — visible **once** |
| 4 | F&O environment URL | e.g. `https://your-env.sandbox.operations.dynamics.com` (no trailing slash) |
| 5 | MCP URL | value #4 + `/mcp` |
| 6 | Allowed origin | `https://www.rsmd365.com` — **scheme + host only, no path, no trailing slash** (an "origin" never includes `/product-enrichment/`; the org's custom domain is what the browser reports, not `rsm-d365-sales.github.io`) |
| 7 | Shared key | Invent a long random string (25+ chars), e.g. from a password generator |

## Step 1 — Entra ID app registration (skip if you already have one)

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `pea-d365-mcp-demo` (anything). Supported account types: **single tenant**.
   Redirect URI: leave empty. → **Register**.
3. On the Overview page, copy **Application (client) ID** (value #2) and
   **Directory (tenant) ID** (value #1).
4. **Certificates & secrets** → **New client secret** → description + expiry (pick the
   shortest that outlives the demo) → **Add** → copy the **Value** column immediately
   (value #3 — it is never shown again; the *Secret ID* column is not the secret).
5. No API permissions are needed — F&O authorizes the app on its side (Step 2).

## Step 2 — Authorize the app in F&O (one-time, in the D365 client)

1. **System administration → Setup → Allowed MCP clients** *(the page added by the
   "Dynamics 365 ERP Model Context Protocol server" feature)*: add a row with the app's
   **client ID** (value #2), set **Allowed = Yes**, save.
2. **System administration → Setup → Microsoft Entra ID applications**: add a row mapping
   the same **client ID** to a **user ID** (create or pick a service account user). This is
   the identity every MCP call runs as.
3. Assign that user the security roles the agent needs (e.g. a product-data maintenance
   role) **plus** the **System agent** role (licensing exemption; it grants no permissions).
   Keep the functional role narrow — the agent can do whatever this user can do.

## Step 3 — Create the Function App (portal)

1. Portal → **Create a resource** → search **Function App** → **Create**.
2. Hosting: pick **Consumption** (or **Flex Consumption** if that's the default offered —
   either works for this).
3. Basics tab:
   - **Subscription / Resource group**: create a new group, e.g. `rg-pea-demo`.
   - **Function App name**: globally unique, e.g. `pea-helper-rsm` → your base URL becomes
     `https://pea-helper-rsm.azurewebsites.net`.
   - **Runtime stack**: **Node.js**, **Version 20 (LTS)**.
   - **Region**: anything near you; **OS**: accept the default.
4. Storage tab: accept the auto-created storage account. Everything else: defaults.
5. **Review + create** → **Create**, wait for the deployment, then **Go to resource**.

## Step 4 — Application settings (this is where the secret lives)

1. In the Function App: **Settings → Environment variables** (older portal: *Configuration
   → Application settings*).
2. **Add** each of these (names exactly as shown):

   | Name | Value |
   | --- | --- |
   | `D365_TENANT_ID` | value #1 |
   | `D365_CLIENT_ID` | value #2 |
   | `D365_CLIENT_SECRET` | value #3 |
   | `D365_RESOURCE` | value #4 |
   | `D365_MCP_URL` | value #5 |
   | `ALLOWED_ORIGIN` | value #6 (`https://www.rsmd365.com`) |
   | `PROXY_SHARED_KEY` | value #7 |

3. **Apply / Save** (the app restarts). The secret is now encrypted at rest in app
   settings; the upgrade path later is a Key Vault reference
   (`@Microsoft.KeyVault(SecretUri=…)`) in the same field — no code change.

> While testing from `npm run dev` you can temporarily set `ALLOWED_ORIGIN` to `*`,
> then tighten it to the Pages origin before the demo.

### Step 4b — Platform CORS (required on Flex Consumption)

On **Flex Consumption** plans the platform intercepts every `OPTIONS` preflight before it
reaches the function code, so the in-code CORS alone is not enough — you must also
configure CORS on the Function App itself:

1. Function App → **API → CORS**.
2. Add the site origins: `https://www.rsmd365.com`, `http://localhost:5173`,
   `http://localhost:4173` (scheme + host only, no paths).
3. Save. (The pre-seeded `https://portal.azure.com` entry only matters for testing
   functions inside the portal — keep or remove as you like.)

CLI equivalent:

```sh
az functionapp cors add -n <func-name> -g <resource-group> \
  --allowed-origins https://www.rsmd365.com http://localhost:5173 http://localhost:4173
```

The platform then answers preflights and stamps the correct `Access-Control-Allow-Origin`
per origin; the in-code headers still expose `mcp-session-id` so the MCP session works.

## Step 5 — Deploy the code (VS Code, no CLI)

1. Clone the repo if you haven't:
   `git clone https://github.com/RSM-D365-Sales/product-enrichment`
2. In VS Code, install the **Azure Functions** extension (which brings the Azure
   Resources extension) and sign in to Azure (Azure icon in the sidebar → Sign in).
3. **File → Open Folder…** → select the **`azure-function`** folder itself (not the repo
   root — the extension needs `host.json` at the workspace root).
4. Open a terminal in that folder and run `npm install` once.
5. Command Palette (`Ctrl+Shift+P`) → **Azure Functions: Deploy to Function App…** →
   pick your subscription → pick the Function App from Step 3 → confirm the overwrite
   prompt → wait for **"Deployment completed"**.
6. Verify in the portal: Function App → **Overview** → the Functions list shows
   **mcpToken** and **mcpProxy**. (If the list is empty, the wrong folder was deployed —
   redo step 3 making sure `azure-function` was the opened folder.)

*CLI alternative for later:* `cd azure-function && npm install && func azure functionapp publish <name>`.

## Step 6 — Smoke-test the Function by itself

From PowerShell (a browser address bar can't send the shared-key header):

```powershell
$h = @{ 'x-proxy-key' = '<value #7>' }
Invoke-RestMethod -Uri 'https://<func-name>.azurewebsites.net/api/mcp-token' -Headers $h
```

Expected: JSON with `access_token` (a long `eyJ…` string) and `expires_in`. First call may
take ~10–20 s (cold start + token mint); repeats are fast (cached).

| If you get… | It means… |
| --- | --- |
| `401 Missing or wrong x-proxy-key` | Header/value mismatch with `PROXY_SHARED_KEY` |
| `500 Missing app settings…` | One of the `D365_*` settings is absent/typo'd — recheck Step 4 |
| `500` with an AADSTS code | Entra rejected the exchange — AADSTS7000215 = wrong secret value (did you copy the Secret *ID* instead of the *Value*?); AADSTS700016 = wrong client/tenant ID |
| `404 Not Found` | Code isn't deployed (Step 5) or wrong URL |

## Step 7 — Point the app at the Function

On the deployed site (or localhost) → **Setup → Dynamics 365 ERP MCP**:

1. Tick **Attach the D365 ERP MCP server**.
2. **MCP endpoint URL**: value #5.
3. **Helper Function base URL**: `https://<func-name>.azurewebsites.net` (no `/api`).
4. **Helper shared key**: value #7.
5. **Bearer token**: leave **empty** — the Function mints it.
6. **Test MCP connection** → expect `✓ MCP connected — N tools available (data_*, form_*, api_*)`.
7. **Save settings.**

| If the MCP test fails with… | Check… |
| --- | --- |
| CORS error in the browser console | Step 4b first (on Flex, platform CORS must list the origin — a bare 204 preflight with no `Access-Control-*` headers is the tell); then `ALLOWED_ORIGIN` exactly equals the site's origin — `https://www.rsmd365.com`, no path/trailing slash |
| `401/403` from the D365 endpoint | Step 2: client ID on **Allowed MCP clients**, app mapped to a user, user has roles |
| `400 MCP target must be …dynamics.com` | The MCP URL field / `D365_MCP_URL` value |
| `502` | The Function couldn't reach the environment (URL typo, or environment in a servicing window) |

## Step 8 — Wind-down hygiene

- Rotate/delete the **client secret** and change `PROXY_SHARED_KEY` after the demo cycle.
- The service user's security role is the real blast-radius control — keep it sandbox-only.
- Deleting resource group `rg-pea-demo` removes the Function App and its settings entirely.
