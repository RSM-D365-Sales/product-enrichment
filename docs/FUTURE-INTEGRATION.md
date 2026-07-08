# Live D365 F&SC integration runbook

The demo runs on `MockProductService`. `LiveProductService` is the documented stub behind
the same `ProductService` seam — wiring it is additive; no UI or agent changes required.

## Auth

- Entra ID app registration (client credentials) with access to the D365 F&O environment.
- Token audience: the environment URL; call OData at `{env}/data/...`.
- For the browser demo, tokens must be brokered by a small server-side proxy (Azure
  Function / APIM) — do not put client secrets in the SPA.

## Entity mapping

| Workspace concept | D365 F&SC surface |
| --- | --- |
| Imported style (master) | `EcoResProductMasterV2` (+ `EcoResProductV2` for non-masters) |
| Released product per legal entity | `EcoResReleasedProductV2` (`dataAreaId` = legal entity) |
| Size / color groups & values | Product dimension group entities, `EcoResProductMasterSizes`, `EcoResProductMasterColors` |
| Size/color combination (variant) | `EcoResProductVariantsV2`; release via the release-product action per `dataAreaId` |
| Lifecycle status | `ProductLifecycleState` on the released product; future dating via a scheduled-change record (custom entity or DMF batch) |
| Vendor | Default order settings / primary vendor on the released product |
| Country of origin / HTS | Foreign trade fields on released product (`OriginCountryRegionId`), `CustomsTariffCodes` |
| Compliance | Restricted-substance / compliance custom entity (client-specific) |
| Validation rules | Table-driven rule set (mirror of `lib/validation.ts`) read from a parameter entity |
| Audit history | Database log or a custom change-log entity; variant additions from `EcoResProductVariantsV2` created dates |

## Method mapping (`ProductService`)

- `getStyles()` — join released products + masters + dimension values, filtered to the
  import window; compute validation client-side (same rules) or read a validation-result
  staging table populated by the import batch.
- `enrichStyle()` — PATCH released-product fields; re-run validation.
- `addVariants()` — create variant records for new size/color combos, then release to the
  requested legal entities.
- `setLifecycle()` — immediate: PATCH `ProductLifecycleState`; future-dated: insert a
  scheduled change picked up by a batch job on the effective date.
- `releaseToEntities()` — release-product action per target `dataAreaId`.
- `revalidate()` — re-run the rule set; update the staging/validation record.

## Assistant in production

Keep the browser thin: route Claude (Microsoft Foundry) calls through the same proxy that
brokers D365 tokens. The tool layer stays client-side; only the model transport moves
server-side (key custody + CORS).
