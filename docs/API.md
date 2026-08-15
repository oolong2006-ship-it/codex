# API surface

The app is Server-Action-first. Mutations are typed Server Actions (not REST endpoints);
two Route Handlers exist for auth and secure file streaming. Every action re-checks
authorization server-side and scopes data by the session's `organizationId`.

## Route Handlers

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET/POST` | `/api/auth/[...nextauth]` | — | NextAuth (credentials) sign-in/session/csrf |
| `GET` | `/api/documents/[id]` | Session | Stream a document. Suppliers get their own; procurement roles get any in-tenant. Returns 401/403/404/410 as appropriate. |

## Server Actions

### Public registration — `src/app/supplier/register/actions.ts`
- `registerSupplierAction(input, force?)` — validates (zod), screens duplicates (blocks on
  identical CR/VAT unless `force`), creates the SUPPLIER user + supplier profile + first
  contact + categories in a transaction, logs activity. Returns `{ ok, supplierCode }` or
  `{ ok:false, duplicates }`.

### Supplier portal — `src/app/portal/actions.ts`
Guarded by `requireOwnedSupplier()` (must be the SUPPLIER owner):
`updateCompanyAction`, `addContactAction`/`deleteContactAction`, `setCategoriesAction`,
`addProductAction`/`deleteProductAction`, `addServiceAction`/`deleteServiceAction`,
`addBrandAction`/`deleteBrandAction`, `addLocationAction`/`deleteLocationAction`,
`saveCommercialTermsAction`, `uploadDocumentAction`/`deleteDocumentAction`,
`submitApplicationAction`. Each recomputes completeness and revalidates the portal.

### AI catalog — `src/app/portal/catalog/actions.ts`
- `runCatalogExtractionAction(form)` — stores upload, extracts text, runs AI (or heuristic),
  persists an `AiExtractionJob` in `NEEDS_REVIEW` with `AiExtractedProduct` rows. **Nothing is
  written to the live catalog automatically.**
- `approveExtractedProductAction(id)` — human approval promotes one extracted product into `products`.
- `discardExtractedProductAction(id)`.

### Procurement — `src/app/(procurement)/suppliers/[id]/actions.ts`
Guarded by `requirePermission(...)`:
- `changeStatusAction(id, key, reason?)` — `approve` / `prequalify` / `conditional` / `review` /
  `reject` / `suspend` / `blacklist`. Writes status history + activity, notifies the supplier.
- `requestInfoAction(id, documentCodes, message)` — logs + notifies.
- `addNoteAction(id, body)` — internal-only note.
- `addEvaluationAction(id, score, outcome, comment)` — recomputes average rating.
- `addToShortlistAction(id, shortlistId | "__new__", newName?)`.
- `verifyDocumentAction(id, documentId, approve, reason?)` — mark VALID/EXPIRED or REJECTED.

## Validation
All inputs are validated with **zod** schemas in `src/lib/validators.ts` before any write.
Uploads are validated for MIME type and size in `src/lib/storage.ts`.

## Errors
Actions return `{ ok: boolean, error?: string }`. Authorization failures throw
`AuthorizationError`; the middleware and layout guards prevent unauthorized navigation up front.
