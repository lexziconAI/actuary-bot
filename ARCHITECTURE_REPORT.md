# Axiom Actuarial Bot — Granular Technical Architecture Report

**Version:** 0.1.0 — Phase 1 Constitutional Skeleton
**Author:** Axiom Intelligence Ltd
**Date:** 2026-02-24
**Runtime:** Node.js 22 / Express 4.18 / better-sqlite3 / tweetnacl
**Sovereign:** Regan Duff — Ko Taniwha ahau. He kaitiaki ahau nō Taranaki. 🇳🇿🐉🔥

---

## Table of Contents

1. [What Actuary Bot Is](#1-what-actuary-bot-is)
2. [What Actuary Bot Does NOT Do (Phase 1 Deliberately)](#2-what-actuary-bot-does-not-do)
3. [Repository Structure](#3-repository-structure)
4. [Runtime & Dependency Map](#4-runtime--dependency-map)
5. [HTTP Server Architecture](#5-http-server-architecture)
6. [Middleware Stack & Ordering](#6-middleware-stack--ordering)
7. [Five Yamas Constitutional Gate System](#7-five-yamas-constitutional-gate-system)
8. [Consent Protocol](#8-consent-protocol)
9. [Kaitiaki Ed25519 Transport Layer](#9-kaitiaki-ed25519-transport-layer)
10. [Kaitiaki Chain of Custody System](#10-kaitiaki-chain-of-custody-system)
11. [SQLite Persistence Layer](#11-sqlite-persistence-layer)
12. [API Routes — Full Reference](#12-api-routes--full-reference)
13. [Integration Layer — Drug Discovery & Dr Bot](#13-integration-layer--drug-discovery--dr-bot)
14. [Security Architecture](#14-security-architecture)
15. [What Is Offline on Render (Intentional)](#15-what-is-offline-on-render-intentional)
16. [Deployment Architecture on Render](#16-deployment-architecture-on-render)
17. [Constitutional Scoring Formula — Full Derivation](#17-constitutional-scoring-formula--full-derivation)
18. [Data Flow — End-to-End Request Trace](#18-data-flow--end-to-end-request-trace)
19. [Phase 1 vs Phase 2 vs Phase 3 Roadmap](#19-phase-1-vs-phase-2-vs-phase-3-roadmap)
20. [Ideas for Expanding Utility](#20-ideas-for-expanding-utility)

---

## 1. What Actuary Bot Is

Actuary Bot is a **constitutional actuarial intelligence service** built on a foundational principle: *risk modelling that harms the people it is modelling is not intelligence, it is exploitation*.

The system is built around the **Turangawaewae Protocol** — a Māori-grounded framework that places identity, consent, and community accountability at the centre of every technical decision. The name "Turangawaewae" means "a place to stand" — the protocol demands that every actuarial computation be grounded in consent, truthfulness, and non-harm before any model is consulted.

### What it actually does today (Phase 1)

- Accepts actuarial assessment requests from clinicians and pipelines
- **Runs all five Yamas constitutional gates on every single request** — these are hard blocking gates, not advisory scores
- Generates cryptographically deterministic consent record IDs from cohort + scope + authorising clinician
- Validates that the consent_record_id on every request was legitimately generated from the claimed inputs
- Persists every assessment attempt (pass or fail) with full constitutional scores in an immutable SQLite ledger
- Logs every gate verdict to a separate constitutional audit log
- Signs every HTTP response with an Ed25519 key using a Double Helix + Arnold Cat Map PoSC chain
- Accepts inbound integration signals from the Drug Discovery pipeline and Dr Bot
- Chains Kaitiaki receipts cross-service: AB → DD → DrBot provenance is traceable end-to-end
- Serves a full landing page with service status, gate documentation, and API reference

### What makes it different from a conventional actuarial system

Conventional actuarial systems compute risk first, then worry about consent and equity later (if at all). Actuary Bot inverts this entirely. The constitutional gates are not a compliance layer bolted on afterwards — they are the **first thing that runs**, architecturally guaranteed to fire before any computation reaches the persistence layer. A request that fails Brahmacharya cannot physically reach the database. There is no code path around the gates.

---

## 2. What Actuary Bot Does NOT Do

These are **deliberate Phase 1 absences**, not oversights:

| Capability | Status | Reason |
|---|---|---|
| Risk score computation | NOT PRESENT | Pending independent SME validation of equity coefficients |
| Equity coefficients (age, sex, ethnicity, disability weighting) | NOT PRESENT | Requires academic + community SME review before any numbers are published |
| Population mortality tables | NOT PRESENT | Requires validated actuarial data sources with consent-compliant provenance |
| Patient-facing output generation | BLOCKED by Ahimsa gate | Ahimsa scores patient_facing=true at 0.80, not 0.95 — additional path required |
| Model inference or ML pipelines | NOT PRESENT | Phase 2 — awaiting constitutional sign-off on model architecture |
| External API calls | NOT PRESENT | All computation is local; no external data fetch in Phase 1 |
| User authentication | NOT PRESENT | Phase 2 — clinician_id in consent protocol is a trust token, not an auth claim |
| Rate limiting | NOT PRESENT | Phase 2 |
| WebSocket / real-time | NOT PRESENT | Phase 3 |

The absence of the risk engine is not a bug. It is the most important architectural decision in the system. Publishing a risk score before equity coefficients have been validated by independent SMEs and community representatives would reproduce the exact harm that systems like this have historically caused.

---

## 3. Repository Structure

```
actuary-bot/
├── server.js                          # Entry point — Express app, all routes
├── package.json                       # ESM ("type": "module"), 4 deps
├── .node-version                      # Pin Node 22 for Render
│
├── constitutional/
│   ├── yamas-gates.js                 # Five gate functions + runAllGates()
│   └── consent-protocol.js            # generateConsentRecordId(), validateConsentRecord()
│
├── kaitiaki/
│   ├── middleware.cjs                  # Ed25519 transport signing (CJS — createRequire bridge)
│   └── chain.cjs                       # Cross-service receipt chaining (CJS — createRequire bridge)
│
├── storage/
│   └── actuary-store.js               # better-sqlite3 — 3 tables, WAL mode
│
├── public/
│   ├── index.html                     # Landing page
│   └── logo.png                       # Axiom Actuarial Bot logo
│
└── data/
    └── actuary-bot.db                 # SQLite database (auto-created at first request)
```

Note: `data/` and `actuary-bot.db` are created at runtime on first database access. On Render, this database lives on the ephemeral filesystem — it resets on each deploy. Phase 2 will introduce a persistent volume or external Postgres.

---

## 4. Runtime & Dependency Map

### Node.js module system

`package.json` declares `"type": "module"` — the entire codebase uses **ES Modules (ESM)** natively. `import`/`export` throughout. The two legacy CJS modules (`kaitiaki/middleware.cjs`, `kaitiaki/chain.cjs`) use the `.cjs` extension which forces Node.js to treat them as CommonJS regardless of the `type` field. They are loaded via `createRequire(import.meta.url)` — the standard ESM→CJS bridge pattern.

This was the root cause of the most significant deployment bug (SCAR-051): both files were originally `.js`, which caused `ReferenceError: require is not defined in ES module scope` at startup on Render.

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.0 | HTTP server framework |
| `better-sqlite3` | ^9.0.0 | Synchronous SQLite3 bindings — WAL mode, prepared statements |
| `tweetnacl` | ^1.0.3 | Ed25519 digital signatures (NaCl — no native bindings, pure JS) |
| `tweetnacl-util` | ^0.15.1 | Encoding utilities for tweetnacl |

### Why better-sqlite3 over postgres/mysql

Synchronous SQLite is ideal for Phase 1: zero network overhead, zero connection pooling complexity, zero credentials to manage, and the `prepare()` / `run()` API makes SQL injection structurally impossible (no string interpolation ever touches the database). The WAL (Write-Ahead Log) journal mode enables concurrent readers while a write is in progress.

The tradeoff: SQLite is per-instance on Render. On a multi-instance deploy, each instance has its own database. For Phase 1's single-instance usage this is fine. Phase 2 will require a Render Postgres instance with connection pooling.

### Why tweetnacl

TweetNaCl is a pure JavaScript implementation of the NaCl cryptographic library. It has:
- **Zero native bindings** — no `node-gyp`, no compilation step, deploys cleanly on any platform
- **Audited** — the NaCl spec is one of the most peer-reviewed cryptography implementations
- **Ed25519** — the same signature scheme used by SSH keys, Git signing, and Tor

The alternative (Node.js built-in `crypto.subtle.sign`) requires async operations which would complicate the synchronous middleware pattern. TweetNaCl's `nacl.sign.detached()` is synchronous and sub-millisecond.

---

## 5. HTTP Server Architecture

Server entry point: `server.js`

The Express application is created and configured in a strict initialization order:

```
1. loadOrCreateKeypair()        ← Kaitiaki keypair (on module load, not on request)
2. app.use(kaitiakiMiddleware)   ← MUST be first — shadows res.json before any routes see it
3. app.use(express.json())       ← Body parser — after kaitiaki so body is available in routes
4. app.use(express.static())     ← Static files — serves public/index.html + public/logo.png
5. Routes (GET, POST)            ← All business logic
6. app.listen(PORT)              ← Bind to PORT env var (Render injects this) or 3090
```

The server listens on `process.env.PORT || 3090`. On Render, `PORT` is always injected — the fallback `3090` is for local development only.

### ESM-compatible __dirname

Since `server.js` is ESM, `__dirname` is not available natively. The standard pattern is used:

```javascript
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

This is then used for `express.static(join(__dirname, 'public'))` — critical for the static files to resolve correctly in all deployment environments.

---

## 6. Middleware Stack & Ordering

### Why Kaitiaki must be first

The Kaitiaki middleware works by **shadowing `res.json` on every request**. It replaces Express's native `res.json` with a wrapper that:

1. Calls `sealTransport(data, domain)` to generate the Ed25519 receipt
2. Injects three response headers: `X-Kaitiaki-Receipt-Id`, `X-Kaitiaki-Chain-Position`, `X-Kaitiaki-Public-Key`
3. For plain objects: merges `_kaitiaki: compactReceipt` into the response body
4. For arrays/primitives: injects headers only (preserves body contract)
5. Calls the original `res.json` with the enriched data

If any other middleware or route calls `res.json` before Kaitiaki has shadowed it, those responses go unsigned. By mounting Kaitiaki as `app.use()` position 1 (before body parser, before routes), the shadow is guaranteed to be in place for every request.

### Why express.json() is second

The body parser must come after Kaitiaki's middleware registration (which doesn't need the body) but before any routes that need `req.body`. The Kaitiaki middleware doesn't consume the body — it reads the outbound response data, not the inbound request body.

### Why express.static() comes after json()

Static file serving for `GET /` (landing page) happens through `express.static`. Placing it after `express.json()` means JSON body parsing is set up before static files are served — although it doesn't matter for static assets, it means the ordering is: security → parsing → serving, which is clean.

---

## 7. Five Yamas Constitutional Gate System

The Five Yamas are a set of ethical restraints from the Yoga Sutras of Patanjali. In Actuary Bot, each Yama maps to a specific actuarial risk: the places where this kind of system, historically, has caused the most harm to the most vulnerable people.

All five gates are implemented as pure functions in `constitutional/yamas-gates.js`. Each function takes a `ctx` object (the merged request context) and returns `{ pass: boolean, score: number, reason: string }`.

The orchestrating function `runAllGates(ctx)` calls all five in sequence and computes a composite constitutional score.

### Gate 1 — Ahimsa (Non-Harm)

**File:** `yamas-gates.js:26–43`
**Constitutional weight:** 0.25

Ahimsa checks whether the assessment could cause direct harm to individuals or communities. Three vectors:

**Vector A — Forbidden assessment types**
The set `['genetic_exclusion', 'racial_profiling', 'disability_penalty']` is hardcoded as an absolute block. These are assessment types that have been used historically to exclude people from insurance, employment, and healthcare on discriminatory grounds. There is no override, no score floor, no advisory path — a request with any of these types returns `score: 0.0` and blocks immediately.

**Vector B — Large-population equity blind spot**
If `population_size > 10000` and no `equity_flag` is provided, the assessment is blocked. This forces the caller to explicitly acknowledge that they have considered equity implications before running a large-scale assessment. The threshold of 10,000 is the point at which statistical patterns in actuarial models can begin to create systematic disadvantage for minority sub-populations.

**Vector C — Patient-facing score reduction**
If `patient_facing: true`, the Ahimsa score is capped at 0.80 (vs 0.95 for non-patient-facing). This reduction propagates through the composite score calculation. It does not block on its own, but combined with other marginal scores it can push the composite below the 0.60 threshold. The intent is to signal that patient-facing outputs require higher overall constitutional quality.

**Score formula:** `patient_facing ? 0.80 : 0.95`

### Gate 2 — Satya (Truthfulness)

**File:** `yamas-gates.js:54–75`
**Constitutional weight:** 0.25

Satya checks that the confidence and data quality claims in the request are honest and sufficient. Three sub-checks:

**Sub-check A — Confidence range validation**
`confidence` must be a number in `[0, 1]`. Non-numeric, negative, or `>1` values block immediately. This prevents a caller from passing `confidence: 999` to game the system.

**Sub-check B — Confidence floor**
`confidence < 0.60` blocks immediately. A minimum of 60% model confidence is required before any actuarial assessment is recorded. This prevents low-confidence model outputs from appearing in the constitutional ledger as "assessed."

**Sub-check C — Data quality gate**
`data_quality === 'unknown'` or `data_quality === 'poor'` blocks. The only passing values are `'good'`, `'high'`, `'excellent'` (or any other non-empty string that isn't explicitly poor). This forces the caller to make a truthful claim about their data quality before proceeding.

**Sub-check D — Model version required**
`!model_version` blocks. Every assessment must name the model that produced it. This prevents hidden model drift: if a model is silently updated and starts producing different outputs, the version field creates an audit trail that can detect the change.

**Score formula:** `Math.min(1.0, confidence * 1.1)` — a slight 10% bonus for declaring a model version, capped at 1.0.

### Gate 3 — Asteya (Non-Stealing / Consent)

**File:** `yamas-gates.js:86–99`
**Constitutional weight:** 0.15

Asteya means "non-stealing." In the context of actuarial work on human populations, running a risk assessment without consent is stealing from people their right to control how their health and futures are modelled.

**Sub-check A — Consent record ID presence**
`!consent_record_id` blocks immediately with the most explicit error message in the system: *"no analysis without consent."*

**Sub-check B — Consent record validation**
Delegates to `validateConsentRecord(consent_record_id, { cohort, scope, clinician_id })`. This recomputes what the consent_record_id *should* be for the given inputs and checks it against what was provided. If they don't match, it means either:
- The cohort/scope/clinician_id were changed after the consent record was generated
- The consent_record_id was fabricated
- The consent_record_id belongs to a different assessment context

Any of these scenarios blocks the request. Consent cannot be borrowed from a different context.

**Score formula:** Fixed at `0.95` on pass — consent is binary.

### Gate 4 — Brahmacharya (Ethical Boundaries / Domain Guard)

**File:** `yamas-gates.js:119–138`
**Constitutional weight:** 0.20
**Special rule: Brahmacharya < 0.5 → AUTOMATIC COMPOSITE REJECT regardless of other scores**

Brahmacharya enforces scope boundaries. The validated scope set is a whitelist of the actuarial domains that have been reviewed and approved for use:

```javascript
const VALIDATED_SCOPES = new Set([
  'life_insurance_pricing',
  'health_insurance_risk',
  'reinsurance_modelling',
  'population_mortality',
  'drug_discovery_integration',
  'dr_bot_integration',
]);
```

**Sub-check A — Scope presence**
`!scope` blocks immediately. No scope = no boundaries = block.

**Sub-check B — Scope whitelist**
Any scope not in `VALIDATED_SCOPES` blocks with a message listing the valid options. This prevents scope creep: an operator cannot start passing `scope: 'credit_scoring'` or `scope: 'employment_risk'` without those scopes being explicitly added to the validated set (which would require a constitutional review).

**Sub-check C — Regulatory jurisdiction advisory**
If `regulatory_jurisdiction` is provided, score is `0.90`. If absent, score drops to `0.70`. This is advisory-only (does not block) but the score reduction can affect the composite. The intent is to encourage callers to declare which regulatory regime governs their assessment.

**The Brahmacharya auto-reject:** If Brahmacharya fails, `constitutional_score` is forced to `0` regardless of all other gates. This is enforced in `runAllGates()`:

```javascript
const constitutional_score = brahmaAuto ? 0 :
  0.25 * ahimsa.score + 0.25 * satya.score + ...
```

A request that is out-of-scope cannot be redeemed by high scores on truthfulness or consent.

### Gate 5 — Aparigraha (Non-Attachment / Epistemic Diversity)

**File:** `yamas-gates.js:149–164`
**Constitutional weight:** 0.15

Aparigraha means "non-hoarding" or "non-attachment." In epistemic terms, it means a refusal to cling to a single model's view of the world. Actuarial systems that rely on one model produce overconfident, brittle risk scores. The harm is compounded when that one model has absorbed historical biases from training data.

**Sub-check A — Ensemble requirement**
If `model_count < 2` AND `dissent_flag !== true`, the request blocks. Every assessment must either:
- Use at least 2 models in ensemble (model_count ≥ 2), or
- Carry an explicit `dissent_flag: true` (caller acknowledges this is a single-model output and flags it for review)

**Score formula:**
- `model_count >= 3`: score = `0.95` (strong ensemble)
- `dissent_flag: true` (single model, explicitly flagged): score = `0.80`
- `model_count == 2` (minimum ensemble, no flag): score = `0.72`

**Note on Dr Bot integration:** The `/api/v1/dr_bot_ingest` endpoint always sets `dissent_flag: true` — Dr Bot signals carry inherent epistemic challenge, so the adversarial dissent is treated as the required diversity check.

---

## 8. Consent Protocol

**File:** `constitutional/consent-protocol.js`

The consent protocol provides **cryptographic consent anchoring** — consent is not just recorded, it is *embedded in the identity of the assessment itself.*

### generateConsentRecordId({ cohort, scope, clinician_id })

Produces a deterministic `consent_record_id` that is a SHA-256 hash of the three pillars of informed consent:

1. **cohort** — who is being assessed
2. **scope** — what is being assessed about them
3. **clinician_id** — who authorises the assessment

Critically, the hash input is **canonicalised before hashing**:

```javascript
const canonical = JSON.stringify({
  cohort:       String(cohort).trim().toLowerCase(),
  scope:        String(scope).trim().toLowerCase(),
  clinician_id: String(clinician_id).trim(),
});
```

Canonical ordering (alphabetical JSON key order), lowercasing of cohort and scope, and trimming prevents trivial bypass attacks:
- `cohort: "NZ Population"` and `cohort: "nz population"` produce the same ID
- Parameter swap attacks (same three values in different positions) produce the same ID (because JSON key order is fixed)
- Whitespace injection doesn't change the ID

The output format is `CR-{first 32 hex chars of SHA-256}`. The prefix `CR-` is part of the format contract — `validateConsentRecord` checks for it as the first validation step.

### validateConsentRecord(consent_record_id, { cohort, scope, clinician_id })

Recomputes the expected ID from the provided inputs and checks it against the provided ID. If they don't match, validation fails.

This is a **reconstruction check**, not a database lookup. The ID is self-contained — it encodes its own validity. No database table needs to be consulted to validate a consent record in real-time; the cryptographic hash is the proof.

### consentSummary({ consent_record_id, cohort, scope })

Produces a human-readable string for audit logs: `"consent=CR-abc123 cohort=nz-smokers scope=population_mortality"`. Note that `clinician_id` is deliberately **excluded** from the summary — only the hash is logged, preventing PII leakage into log aggregation systems that may have broader access than the consent record store.

### Consent in the storage layer

When a consent record is generated via `/api/consent/generate`, `upsertConsentRecord()` stores:
- `consent_record_id` (the hash — acts as primary key)
- `cohort` and `scope` (plain text — needed for audit queries)
- `clinician_hash`: SHA-256 of `clinician_id` truncated to 16 hex chars

The `clinician_id` itself is **never stored in the database**. Only its hash. This means audit queries can verify "did a specific clinician authorise this?" by hashing their ID and checking against `clinician_hash` — but the database cannot be queried to discover clinician identities.

---

## 9. Kaitiaki Ed25519 Transport Layer

**File:** `kaitiaki/middleware.cjs`

The Kaitiaki transport layer is the most cryptographically sophisticated component in the system. It implements **Turangawaewae Protocol v3** — a three-layer provenance seal applied to every HTTP response at the transport level.

### Three-layer seal architecture

**Layer 1 — Double Helix (Ed25519 signature)**

```
cotHash     = SHA-256(JSON.stringify(payload))
parseHash   = SHA-256(domain + "|" + timestamp)
artifactHash = SHA-256(cotHash + parseHash)
signature   = Ed25519.sign(artifactHash, secretKey)
```

The "double helix" name refers to the dual-hash construction: one hash captures the payload content (cotHash — "chain of thought hash"), the other captures the request domain and timestamp (parseHash — the contextual envelope). The final `artifactHash` binds both together, and only then is the Ed25519 signature applied.

This construction means:
- The same payload at a different timestamp produces a different signature (replay protection)
- The same payload on a different endpoint produces a different signature (cross-endpoint replay protection)
- Tampering with the payload invalidates the signature
- Tampering with the domain/timestamp invalidates the signature

**Layer 2 — PoSC Chain (Proof of Sequential Computation)**

```
arnold = ArnoldTransform(prevPrevState, prevState)
state  = SHA-256(artifactHash + arnold)
chainPosition += 1
```

The PoSC chain creates a **linked list of all responses** from a service instance. Each response's state depends on the states of the two previous responses via the Arnold Cat Map. This is analogous to how a blockchain links blocks — you cannot insert a fabricated response into the middle of the chain without recomputing every subsequent state.

**The Arnold Cat Map:** A chaotic map from dynamical systems theory. Applied here to two 64-bit values (derived from the previous two hash states):

```
P = 0xffffffffffffffffffffffffffffff61 (large prime)
x = (2*A + B) mod P
y = (A + B) mod P
state = SHA-256(x || y)
```

The map has the property that small changes in input produce large, unpredictable changes in output (sensitive dependence on initial conditions). This makes the PoSC chain computationally hard to forge — you can't work backwards from a desired future state.

**Layer 3 — Seven Seals (entropy injection)**

Five entropy sources are recorded in the seal:
- `artifact_hash` — the Double Helix output
- `drand_beacon` — local entropy stub (Phase 2 will integrate drand.io random beacon)
- `geonet_entropy` — local entropy stub (Phase 2 will integrate GeoNet seismic entropy)
- `sadi_fingerprint` — domain-specific fingerprint
- `posc_link` — reference to the PoSC chain state

The current implementation uses local entropy stubs for drand and GeoNet. The full v3 protocol calls these external entropy sources in real-time; the stubs maintain architectural compatibility while eliminating external dependencies for Phase 1.

### Keypair persistence

On first startup, `loadOrCreateKeypair()` generates an Ed25519 keypair and writes it to:

```
kaitiaki/.kaitiaki-middleware/keypair.json
```

On subsequent startups, the existing keypair is loaded from disk. This means:
- All responses from a given service instance carry signatures from the same key
- Verifiers can pin to the public key and check that all receipts come from the expected instance
- If the file is deleted, a new keypair is generated and the chain is broken (deliberate — a new chain starts)

On Render, this file lives on the ephemeral filesystem. It is regenerated on each deploy. Phase 2 will inject the keypair via a Render secret or persistent volume to maintain chain continuity across deploys.

### Compact receipt vs full seal

The full seal object is large (~500 bytes). The `compactReceipt()` function extracts the six most useful fields for embedding in response bodies:

```json
{
  "receipt_id": "KT-1708766400000-abcd",
  "signature": "64-char hex Ed25519 signature",
  "artifact_hash": "64-char hex SHA-256",
  "public_key": "64-char hex Ed25519 public key",
  "chain_position": 42,
  "timestamp": "2026-02-24T06:00:00.000Z"
}
```

This compact object is merged into every JSON response body as `_kaitiaki`. The full seal (including all Seven Seals entropy) is computed but not transmitted — it's available in memory for local audit if needed.

---

## 10. Kaitiaki Chain of Custody System

**File:** `kaitiaki/chain.cjs`

The chain module enables **cross-service provenance tracing**. When DD calls AB, or when DrBot calls AB, the receipt from the upstream service is passed to the downstream service. AB chains its local receipt to the parent receipt, creating a linked list of provenance across the entire system.

### chainReceipt(currentReceipt, parentReceiptOrId)

Enriches a local receipt with:
- `parent_receipt_id` — the upstream service's receipt ID
- `chain_depth` — how many hops from the original source (0 = root, 1 = one hop, etc.)
- `chain_root` — the receipt_id of the original source (preserved across the full chain)

Handles two calling conventions:
1. **Full parent receipt object** — chain_depth and chain_root propagated correctly
2. **Bare receipt_id string** — conservative: depth set to 1, root set to the parent ID

### extractParentReceipt(req)

Extracts the parent receipt ID from incoming requests. Checks two locations in order:
1. `req.body.parent_receipt_id` — JSON body (caller passes it explicitly)
2. `req.headers['x-kaitiaki-parent-receipt']` — HTTP header (caller passes it in the request headers)

This dual-channel extraction means upstream services can pass the receipt via either the request body or headers — whichever fits their calling pattern.

### buildChainHeaders(receiptId)

Returns `{ 'X-Kaitiaki-Parent-Receipt': receiptId }` for use in `fetch()` calls to downstream services. A service that wants to chain its receipt to the next downstream service calls this to get the header to attach.

### End-to-end chain example

```
User → DrugDiscovery                         chain_depth: 0, chain_root: KT-DD-1234
          ↓
         DrugDiscovery → ActuaryBot          chain_depth: 1, chain_root: KT-DD-1234
                           ↓
                          ActuaryBot receipt  chain_depth: 2, chain_root: KT-DD-1234
```

An auditor can take the `chain_root` from any AB response and trace it back to the original DD request that triggered the chain. The full lineage is recoverable.

---

## 11. SQLite Persistence Layer

**File:** `storage/actuary-store.js`

Three tables, all created via a single `CREATE TABLE IF NOT EXISTS` schema block on first database access.

### Table: risk_assessments

Immutable ledger of every assessment that passed the constitutional gates. Columns:

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TEXT | SQLite `datetime('now')` — UTC timestamp |
| `consent_record_id` | TEXT NOT NULL | The CR-* hash that anchors consent |
| `cohort` | TEXT NOT NULL | Assessment cohort |
| `scope` | TEXT NOT NULL | Assessment scope |
| `constitutional_score` | REAL NOT NULL | Composite Yamas score (0.0–1.0) |
| `pass` | INTEGER NOT NULL | 1 = passed gates, 0 = blocked |
| `yamas_json` | TEXT NOT NULL | Full per-gate scores JSON |
| `payload_json` | TEXT | Full request body (nullable) |
| `source` | TEXT | Origin system tag (e.g. 'api', 'drug_discovery') |

Note: `pass = 0` rows exist in this table for edge cases where gates pass but something fails downstream. Gate failures are recorded in `constitutional_log` instead.

### Table: consent_records

Audit trail of all consent record generations. Columns:

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TEXT | UTC timestamp |
| `consent_record_id` | TEXT UNIQUE NOT NULL | The CR-* hash |
| `cohort` | TEXT NOT NULL | Cohort (plain text) |
| `scope` | TEXT NOT NULL | Scope (plain text) |
| `clinician_hash` | TEXT NOT NULL | SHA-256(clinician_id) truncated to 16 hex |

The `UNIQUE` constraint on `consent_record_id` combined with `INSERT OR REPLACE` means re-generating the same consent record (same inputs) is idempotent — it updates the timestamp but does not create a duplicate row.

### Table: constitutional_log

Every gate verdict, regardless of outcome. This is the primary audit trail. Every call to `/api/v1/assess`, `/api/v1/drug_discovery_ingest`, and `/api/v1/dr_bot_ingest` writes to this table — even when the gates block the request.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | TEXT | UTC timestamp |
| `endpoint` | TEXT NOT NULL | Which route triggered this verdict |
| `consent_record_id` | TEXT | The CR-* hash (nullable — some requests don't have one) |
| `constitutional_score` | REAL | Composite score (null if gates failed before scoring) |
| `pass` | INTEGER NOT NULL | 1 = all gates passed, 0 = blocked |
| `blocked_by_json` | TEXT | JSON array of blocking reasons |
| `yamas_json` | TEXT | Full per-gate scores JSON |

### WAL mode and foreign keys

```javascript
_db.pragma('journal_mode = WAL');
_db.pragma('foreign_keys = ON');
```

WAL (Write-Ahead Log): Allows readers to proceed while a write is in progress. Critical for low-latency reads of the constitutional_log without blocking concurrent assessment writes.

Foreign keys: SQLite has foreign key enforcement disabled by default. This pragma enables it per-connection. Currently there are no explicit foreign key constraints in the schema, but enabling it ensures any future schema additions that use FK relationships will be enforced.

### Singleton pattern

`getDb()` maintains a module-level `_db` singleton. The database is opened once and reused. This is safe for a single-process Node.js server. The `better-sqlite3` connection object is thread-safe at the module level.

---

## 12. API Routes — Full Reference

### GET /

**Handler:** `express.static('public')` → serves `public/index.html`
**Auth:** None
**Kaitiaki:** Headers only (static file, not JSON)
**Response:** HTML landing page (460 lines)

The landing page documents the service, shows live status badges, explains all five Yamas gates, and lists all five API endpoints with method, path, and description. It uses CSS custom properties for theming, flexbox for layout, and zero JavaScript — fully static.

---

### GET /api/health

**Handler:** `server.js:55–66`
**Auth:** None
**Kaitiaki:** Full body injection + headers
**Response:**

```json
{
  "status": "ok",
  "service": "actuary-bot",
  "version": "0.1.0",
  "port": 3090,
  "constitution": "5/5 Yamas — all gates active",
  "sprint": "Machine Elves — Phase 1 skeleton",
  "timestamp": "2026-02-24T06:00:00.000Z",
  "kaitiaki": { "receipt_id": "KR-ACTUARY-...", "pass": true, ... },
  "_kaitiaki": { "receipt_id": "KT-...", "chain_position": 1, ... }
}
```

Note: `kaitiaki` field in the body is the **application-layer receipt** (SHA-256 based, service-specific). The `_kaitiaki` field injected by middleware is the **transport-layer receipt** (Ed25519 signed, PoSC chained). They serve different purposes — the former is part of the business logic, the latter is structural provenance.

---

### POST /api/consent/generate

**Handler:** `server.js:72–100`
**Auth:** None
**Body:** `{ cohort: string, scope: string, clinician_id: string }`
**Kaitiaki:** Full body injection

**What it does:**
1. Validates all three required fields are present
2. Calls `generateConsentRecordId({ cohort, scope, clinician_id })` → SHA-256 hash → `CR-*` prefix
3. Calls `upsertConsentRecord(...)` → writes to `consent_records` table (clinician stored as hash only)
4. Returns the `consent_record_id` with instructions for use

**Success response:**
```json
{
  "consent_record_id": "CR-a1b2c3d4...",
  "summary": "consent=CR-a1b2c3d4... cohort=nz-smokers scope=population_mortality",
  "instructions": "Include consent_record_id in all /api/v1/assess requests for this cohort+scope.",
  "kaitiaki": { ... }
}
```

**Error response (400):** `{ "error": "cohort, scope, and clinician_id are required", "kaitiaki": {...} }`

---

### POST /api/v1/assess

**Handler:** `server.js:106–188`
**Auth:** None (Phase 2 will add clinician auth)
**Kaitiaki:** Full body injection

**Full request body contract:**

| Field | Type | Default | Required |
|---|---|---|---|
| `consent_record_id` | string | — | Yes (Asteya gate) |
| `cohort` | string | — | Yes |
| `scope` | string | — | Yes (Brahmacharya gate) |
| `clinician_id` | string | — | Yes (Asteya gate) |
| `confidence` | number [0,1] | 0.75 | No |
| `data_quality` | string | 'good' | No |
| `model_version` | string | — | Yes (Satya gate) |
| `model_count` | integer | 2 | No |
| `population_size` | integer | 0 | No |
| `patient_facing` | boolean | false | No |
| `assessment_type` | string | 'population_mortality' | No |
| `regulatory_jurisdiction` | string | — | No (advisory) |
| `dissent_flag` | boolean | false | No |
| `equity_flag` | string | — | No (required if population_size > 10000) |

**Processing sequence:**
1. Destructure all fields from `req.body` with defaults
2. Build gate context `ctx` from fields
3. Call `runAllGates(ctx)` → runs all 5 gates, computes composite score
4. Call `logConstitutionalVerdict(...)` → writes to `constitutional_log` table (always, pass or fail)
5. If `!verdict.pass`: return 403 with blocked_by array and per-gate scores
6. If `verdict.pass`: call `insertRiskAssessment(...)` → writes to `risk_assessments` table
7. Return 200 with constitutional scores and Phase 1 notice

**403 response (gates blocked):**
```json
{
  "error": "CONSTITUTIONAL_BLOCK",
  "blocked_by": ["satya: SATYA_VIOLATION: confidence 0.450 < minimum 0.60"],
  "constitutional_score": 0.0,
  "yamas": {
    "ahimsa":       { "score": 0.95, "pass": true,  "reason": "AHIMSA_PASS" },
    "satya":        { "score": 0.0,  "pass": false, "reason": "SATYA_VIOLATION: ..." },
    "asteya":       { "score": 0.95, "pass": true,  "reason": "ASTEYA_PASS" },
    "brahmacharya": { "score": 0.90, "pass": true,  "reason": "BRAHMACHARYA_PASS" },
    "aparigraha":   { "score": 0.72, "pass": true,  "reason": "APARIGRAHA_PASS" }
  },
  "message": "Assessment blocked by Five Yamas constitutional gates. ...",
  "kaitiaki": { ... }
}
```

**200 response (gates passed):**
```json
{
  "status": "ASSESSMENT_RECORDED",
  "message": "Constitutional gates passed. Risk scoring engine pending SME validation (Phase 2).",
  "constitutional_score": 0.878,
  "yamas": { ... },
  "cohort": "nz-smokers",
  "scope": "population_mortality",
  "consent_record_id": "CR-a1b2...",
  "phase": "1-skeleton",
  "kaitiaki": { ... }
}
```

---

### POST /api/v1/drug_discovery_ingest

**Handler:** `server.js:194–237`
**Purpose:** Receive drug candidates from the Drug Discovery pipeline for actuarial context
**Kaitiaki:** Full body injection + chain receipt linking

**Body:** `{ consent_record_id, cohort, scope, clinician_id, candidates: [] }`

This endpoint runs the full Yamas gates with hardcoded values for drug discovery integration:
- `confidence: 0.80` — DD pipeline outputs carry known confidence
- `data_quality: 'good'`
- `model_version: 'drug-discovery-v1'`
- `model_count: 2` — DD uses at least two models
- `assessment_type: 'population_mortality'`
- `scope: scope ?? 'drug_discovery_integration'`

After gates pass, it attempts to extract the parent receipt ID from the DD service via `extractParentReceipt(req)` and chains the local receipt to it. The `chained_receipt` is returned in the response, enabling end-to-end traceability: DD receipt → AB receipt.

Phase 1 acknowledges the candidates but performs no actuarial computation on them. The `candidate_count` is returned as an acknowledgement.

---

### POST /api/v1/dr_bot_ingest

**Handler:** `server.js:243–291`
**Purpose:** Ingest Dr Bot adversarial/dissent signals for actuarial context
**Kaitiaki:** Full body injection + chain receipt linking

**Body:** `{ consent_record_id, cohort, scope, clinician_id, adversarial_score, dissent_id }`

The Dr Bot integration encodes an important epistemic principle: **adversarial challenge to a diagnosis is valuable actuarial signal.** A Dr Bot signal that contradicts the primary diagnosis lowers the effective confidence of the assessment.

Confidence mapping: `ctx.confidence = Math.max(0, 1 - adversarial_score)`
- If Dr Bot's adversarial score is 0.0 (no challenge): confidence = 1.0
- If Dr Bot's adversarial score is 0.3: confidence = 0.70
- If Dr Bot's adversarial score is 0.5: confidence = 0.50 → would fail Satya gate (< 0.60)

`dissent_flag: true` is always set for Dr Bot signals — a single adversarial signal is treated as the required epistemic diversity check.

**SCAR-053 note** (documented in source): The `correct: boolean` ground-truth field is missing from the current Dr Bot protocol. The "Pour 3" architecture for accuracy calibration waits on Dr Bot adding a `prediction_outcome_resolution` endpoint. When available, the resolved outcome will feed back into the AB confidence calibration model.

---

## 13. Integration Layer — Drug Discovery & Dr Bot

### Why these two integration points exist

Actuary Bot is the **third node** in the Axiom Intelligence pipeline:

```
Drug Discovery (DD)  →  Dr Bot (AB)  →  Actuarial Bot (AB)
     Stage 1-7               diagnostic review            population-level risk
```

The integration design follows a principle of **epistemic accumulation**: each service adds a layer of certainty to a chain of evidence. A molecule identified by DD passes through Dr Bot's clinical reasoning, and the result — including any adversarial challenge — feeds into AB as an actuarial signal.

### Chain-of-custody across services

The Kaitiaki chain module was specifically designed for this three-service architecture. A request from DD to AB carries the DD receipt. AB chains its receipt to the DD receipt. An auditor can:

1. Take an AB response receipt
2. Check `chained_receipt.parent_receipt_id` → find the DD receipt
3. Query DD's logs for that receipt to see which molecule candidates triggered the actuarial review
4. The full evidence chain — from molecule to actuarial record — is recoverable

### Current Phase 1 limitations

The actual actuarial computation on DD candidates and DrBot signals is not yet implemented. Both endpoints currently:
1. Run constitutional gates
2. Chain the receipt
3. Return an acknowledgement (`INGEST_RECEIVED`, `DR_BOT_SIGNAL_RECEIVED`)
4. Do not compute any risk scores or update any models

Phase 2 will add:
- Candidate-to-population-risk mapping (DD candidates → mortality implications)
- Confidence calibration using DrBot adversarial scores
- Ground truth feedback loop when SCAR-053 is resolved

---

## 14. Security Architecture

### Input validation

All business logic endpoints use destructuring with defaults directly from `req.body ?? {}`. The `?? {}` pattern means a missing or null body produces an empty object, which triggers gate failures (missing required fields) rather than crashes. No string interpolation reaches the database — all SQL is via prepared statements with parameterised inputs (`@param` syntax in better-sqlite3).

### PII handling

- `clinician_id` is never stored in the database. Only `SHA-256(clinician_id).slice(0,16)` is persisted.
- `consent_record_id` itself is a hash of the three inputs — it can be shared freely in logs without exposing the underlying data.
- No patient data, health records, or personal identifiers are accepted or processed by the API (Phase 1 only processes structural metadata about assessments, not the assessments themselves).

### Cryptographic provenance

Every response carries an Ed25519 signature over the response payload + domain + timestamp. This means:
- Tampering with a logged response can be detected (signature mismatch)
- Responses cannot be replayed to a different endpoint (domain is included in the signed material)
- The PoSC chain creates a sequential record that prevents silent insertion of fabricated responses

### No authentication in Phase 1

This is a deliberate Phase 1 decision. Authentication requires choosing between JWT, session, or API key schemes — each with different consent and privacy implications. Getting the constitutional gates right first, then layering on authentication, is more aligned with the "consent first, computation second" principle than the reverse.

Phase 2 target: Ed25519 API keys issued per clinician, verified at the transport layer, with the public key included in consent records.

### CORS and rate limiting

Neither is implemented in Phase 1. Render's infrastructure provides some DDoS protection. Phase 2 will add express-rate-limit (10 requests/minute per IP by default) and CORS headers for the specific DD and DrBot service origins.

---

## 15. What Is Offline on Render (Intentional)

The following services are referenced in source code but are not available on the live Render deployment:

| Service | Default port | Status | Impact |
|---|---|---|---|
| Cerebras sidecar | 3333 | OFFLINE | No LLM capability in Phase 1 (none needed — no LLM calls in AB) |
| Scar API | 3041 | OFFLINE | Scar logging is local only — scars written to colony JSONL, not live API |
| Colony State Store | 3060 | OFFLINE | Colony heartbeat not available on Render |
| drand.io beacon | external | NOT CALLED | Seven Seals drand field uses local entropy stub |
| GeoNet entropy | external | NOT CALLED | Seven Seals GeoNet field uses local entropy stub |

Key difference from DD: AB does not make any Cerebras calls at all. There is no LLM in Phase 1 AB. The service is entirely deterministic — given the same inputs, it will always produce the same constitutional verdict. This is intentional: constitutional gates should be reproducible and auditable, not probabilistic.

---

## 16. Deployment Architecture on Render

**Platform:** Render (Singapore region, closest to New Zealand)
**Service ID:** `srv-d6eiudh5pdvs73cvfg10`
**Service URL:** `https://axiom-actuary-bot.onrender.com`
**Plan:** Free tier
**Repository:** `lexziconAI/actuary-bot` (main branch)
**Auto-deploy:** On push to main
**Build command:** `npm install`
**Start command:** `node server.js`
**Node version:** 22 (pinned via `.node-version`)

### ESM/CJS deployment note (SCAR-051)

The `package.json` `"type": "module"` field caused a critical deployment failure. All `.js` files in the project are treated as ESM by Node. The kaitiaki modules (`middleware.js`, `chain.js`) use CommonJS syntax (`require()`, `module.exports`). They were renamed to `.cjs` to force Node to treat them as CommonJS, and `server.js` uses `createRequire(import.meta.url)` to load them.

This pattern must be applied to any future CJS additions to the codebase.

### SQLite on ephemeral filesystem

`data/actuary-bot.db` is created at runtime in the ephemeral Render filesystem. On each deploy, a fresh database is created. This means:
- Constitutional log and consent records reset on deploy
- Acceptable for Phase 1 (the gate logic doesn't depend on previous records)
- Must be addressed in Phase 2 via Render Postgres or a mounted volume

---

## 17. Constitutional Scoring Formula — Full Derivation

```
C = 0.25 * Ahimsa + 0.25 * Satya + 0.15 * Asteya + 0.20 * Brahmacharya + 0.15 * Aparigraha
```

**Weights rationale:**

| Yama | Weight | Rationale |
|---|---|---|
| Ahimsa | 0.25 | Highest weight — non-harm is the primary obligation in health actuarial work |
| Satya | 0.25 | Equal weight — truthfulness is as important as non-harm; a technically non-harmful but dishonest assessment is still unacceptable |
| Brahmacharya | 0.20 | High weight — operating outside validated scope can cause systemic harm; scope creep is a known risk in actuarial systems |
| Asteya | 0.15 | Meaningful but lower — consent is binary (pass/fail on gate 3), so the score contribution is less discriminating |
| Aparigraha | 0.15 | Equal to Asteya — ensemble diversity is important but easier to satisfy (model_count >= 2 is a low bar) |

**Hard rejects:**
- `brahmacharya.pass === false` → `constitutional_score = 0` (regardless of other scores)
- `constitutional_score < 0.60` → overall reject

**Example: minimum passing request**

All defaults, no patient_facing, regulatory_jurisdiction provided, 2 models, confidence=0.75:
- Ahimsa: 0.95 (no patient_facing, no forbidden type, no large population)
- Satya: min(1.0, 0.75 * 1.1) = 0.825
- Asteya: 0.95 (valid consent record)
- Brahmacharya: 0.90 (valid scope + regulatory_jurisdiction)
- Aparigraha: 0.72 (2 models, no dissent flag)

```
C = 0.25*0.95 + 0.25*0.825 + 0.15*0.95 + 0.20*0.90 + 0.15*0.72
  = 0.2375 + 0.20625 + 0.1425 + 0.180 + 0.108
  = 0.874
```

Constitutional score: **0.874** — PASS.

---

## 18. Data Flow — End-to-End Request Trace

### Successful /api/v1/assess request

```
Client POST /api/v1/assess
    │
    ▼
[1] kaitiakiExpressMiddleware shadows res.json
    │
    ▼
[2] express.json() parses request body
    │
    ▼
[3] server.js destructures body with defaults
    │
    ▼
[4] runAllGates(ctx)
    │
    ├─ ahimsaGate(ctx)       → { pass: true, score: 0.95 }
    ├─ satyaGate(ctx)        → { pass: true, score: 0.825 }
    ├─ asteyaGate(ctx)       → calls validateConsentRecord()
    │                          → { pass: true, score: 0.95 }
    ├─ brahmaacharyaGate(ctx)→ { pass: true, score: 0.90 }
    └─ aparigrahaGate(ctx)   → { pass: true, score: 0.72 }
    │
    ▼
[5] logConstitutionalVerdict() → INSERT INTO constitutional_log
    │
    ▼
[6] verdict.pass === true
    │
    ▼
[7] insertRiskAssessment() → INSERT INTO risk_assessments
    │
    ▼
[8] Build response object with ASSESSMENT_RECORDED + scores
    │
    ▼
[9] res.json(response)
    │
    ▼
[10] kaitiakiExpressMiddleware intercepts
    │
    ├─ sealTransport(data, 'POST /api/v1/assess')
    │   ├─ SHA-256(payload) → cotHash
    │   ├─ SHA-256(domain+ts) → parseHash
    │   ├─ SHA-256(cotHash+parseHash) → artifactHash
    │   ├─ Ed25519.sign(artifactHash) → signature
    │   ├─ arnoldTransform(prevPrevState, prevState) → arnold
    │   ├─ SHA-256(artifactHash + arnold) → state
    │   └─ chainPosition++
    │
    ├─ Set headers: X-Kaitiaki-Receipt-Id, X-Kaitiaki-Chain-Position, X-Kaitiaki-Public-Key
    ├─ Merge _kaitiaki: compactReceipt into response body
    └─ Call original res.json with enriched data
    │
    ▼
Client receives signed, chained response
```

---

## 19. Phase 1 vs Phase 2 vs Phase 3 Roadmap

### Phase 1 (Current) — Constitutional Skeleton

- ✅ Five Yamas gates (all blocking, no floors, no advisory-only)
- ✅ Consent protocol with cryptographic ID anchoring
- ✅ Kaitiaki Ed25519 transport signing
- ✅ PoSC chain (Arnold Cat Map second-order linkage)
- ✅ Cross-service receipt chaining
- ✅ SQLite ledger (3 tables, WAL mode, clinician PII hashing)
- ✅ DD and DrBot integration endpoints (acknowledgement only)
- ✅ Landing page with full gate documentation
- ❌ Risk scoring engine (blocked on SME validation)
- ❌ Equity coefficients (blocked on community review)
- ❌ Authentication (blocked on auth scheme selection)
- ❌ Rate limiting
- ❌ CORS headers

### Phase 2 — Risk Engine + Auth + Production Hardening

- SME review and validation of equity coefficients
- Population mortality tables with consent-compliant data sources
- Risk score computation layer (returns actual risk scores, not just gate verdicts)
- Ed25519 API key authentication per clinician
- Render Postgres for persistent storage (replace ephemeral SQLite)
- CORS headers for DD and DrBot origins
- Rate limiting (10 req/min per IP)
- drand.io real-time entropy in Seven Seals
- GeoNet seismic entropy in Seven Seals
- Persistent Kaitiaki keypair (Render secret injection)
- `/api/v1/assess` returns actual risk scores when phase=2

### Phase 3 — Calibration + Pour Feedback Loop

- Accuracy calibration from DrBot `prediction_outcome_resolution` endpoint (SCAR-053)
- "Pour 3" architecture: DD → AB → DrBot → AB calibration loop
- Real-time Bayesian update of confidence priors from resolved outcomes
- API for regulators/auditors to query constitutional_log by date range and scope
- WebSocket subscription for live gate monitoring
- Community review dashboard (accessible to iwi/community representatives referenced in Turangawaewae Protocol)

---

## 20. Ideas for Expanding Utility

### Idea 1: Constitutional Gate Simulator (Zero-Cost Feedback Tool)

**What:** Add a `POST /api/v1/simulate` endpoint that runs all five gates and returns the verdict with detailed human-readable explanations, but does **not** persist anything to the database and is not counted as an assessment.

**Value:** Clinicians and data scientists can prototype requests against the gates before submitting real assessments. They can diagnose exactly which gates block them and why, without burning a constitutional log entry. This removes friction from adoption.

**Effort:** 1 day. The gate logic is already pure functions — the endpoint just calls `runAllGates()` and returns the result with no database writes.

---

### Idea 2: Bulk Consent Batch Endpoint

**What:** Add `POST /api/consent/generate-batch` that accepts an array of `{ cohort, scope, clinician_id }` objects and returns an array of consent_record_ids in a single request.

**Value:** Epidemiological studies often need consent records for dozens of cohort×scope combinations at study setup. Generating them one-by-one is tedious. A batch endpoint generates all of them in a single atomic request.

**Effort:** 2–3 days. The batch loop is trivial; the interesting work is making the SQLite inserts transactional (all succeed or all roll back).

---

### Idea 3: Constitutional Audit Dashboard (Read-Only Frontend)

**What:** A second HTML page at `/audit` that reads from the `constitutional_log` table and displays:
- Gate pass/fail rates over time (bar chart)
- Which gates are blocking most frequently (pie chart)
- Most common `blocked_by` reasons (sorted list)
- Recent assessments table with scores and consent IDs

**Value:** Gives the Sovereign, SMEs, and regulatory reviewers a live window into constitutional compliance. Currently, all this data lives in SQLite but is completely invisible to non-technical stakeholders.

**Effort:** 3–4 days. Requires a read-only `/api/audit/summary` backend endpoint + static HTML chart page (Chart.js CDN). No auth needed if audit data is considered public (no PII — only hashed IDs and scores).

---

### Idea 4: Constitutional Health Score API for External Services

**What:** Add `GET /api/constitutional-health` that returns an aggregated "constitutional health" summary: 7-day rolling pass rate, most violated gate, lowest average score gate, trend direction.

**Value:** DD and DrBot can call this before sending ingest requests to gauge whether AB is currently in a healthy constitutional state. If the pass rate drops dramatically (e.g. someone has been hammering the system with out-of-scope requests), upstream services can throttle their ingest rate.

**Effort:** 1–2 days. Pure SQLite aggregation queries, no new tables needed.

---

### Idea 5: Ed25519 Receipt Verifier (Public Endpoint)

**What:** Add `POST /api/verify-receipt` that accepts a `{ receipt_id, artifact_hash, signature, public_key }` object and returns whether the signature is valid.

**Value:** Any party that receives an AB-signed response can independently verify that the signature is genuine, without needing access to the AB codebase. This is a critical feature for regulatory audit contexts — a regulator can take any historical AB response and verify its provenance end-to-end.

**Effort:** 2 days. TweetNaCl's `nacl.sign.detached.open()` does the verification. The endpoint just validates the inputs and calls it.

---

### Idea 6: Community Oversight Delegation

**What:** Add a `POST /api/consent/delegate` endpoint that allows a `consent_record_id` to be co-signed by a community representative (iwi, patient advocacy group). The co-signed consent record has higher constitutional legitimacy and unlocks higher-risk assessment types.

**Value:** The Turangawaewae Protocol explicitly references community accountability. Giving community representatives a formal role in the consent chain — one that has architectural teeth, not just symbolic acknowledgement — would be a meaningful embodiment of the protocol's intent.

**Effort:** 5–7 days. Requires a delegation schema, a community representative key registry, and a new Yamas gate sub-check for delegated consent.

---

### Idea 7: Regulatory Jurisdiction Registry

**What:** Replace the advisory `regulatory_jurisdiction` string field with a validated registry. Add a `GET /api/jurisdictions` endpoint that returns supported jurisdictions with their applicable constraints (e.g. EU GDPR adds Ahimsa sub-checks; NZ Privacy Act adds Asteya sub-checks; Australian APRA adds Brahmacharya scope restrictions).

**Value:** Different regulatory contexts have genuinely different constitutional requirements. A population mortality study in NZ has different legal and ethical constraints than the same study in the EU. Encoding these in a jurisdiction registry means the gates automatically apply the right rules without the caller needing to know the details.

**Effort:** 3–5 days per jurisdiction added. The registry itself (GET endpoint) is 1 day. The gate sub-checks per jurisdiction are 1–2 days each.

---

### Idea 8: SCAR-053 Pour 3 Calibration Loop

**What:** When Dr Bot adds a `prediction_outcome_resolution` endpoint (planned for Phase 2), implement the "Pour 3" accuracy calibration architecture:
1. AB records the `adversarial_score` from DrBot ingest
2. When the clinical outcome is resolved, Dr Bot sends `POST /api/v1/dr_bot_ingest` with `correct: true/false`
3. AB uses a running Bayesian prior to update its confidence calibration model
4. Future assessments with similar `adversarial_score` values get more accurate derived confidence estimates

**Value:** This closes the feedback loop between adversarial challenge and ground truth. Over time, the system learns whether DrBot's adversarial challenges are accurate predictors of assessment failure — which makes the Aparigraha gate progressively more calibrated.

**Effort:** Full SCAR-053 resolution — 2–3 weeks. Requires DrBot cooperation for the outcome resolution endpoint.

---

*End of Architecture Report — Axiom Actuarial Bot v0.1.0*
*Ko Taniwha ahau. He kaitiaki ahau nō Taranaki. 🇳🇿🐉🔥*
