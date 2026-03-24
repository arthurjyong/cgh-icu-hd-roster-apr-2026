# Operational Search design brief (implementation-tight, design-only)

Date: 2026-03-24  
Project: CGH ICU/HD roster allocator  
Scope: Prevent duplicate/overlapping starts and make status truthful/robust without changing compute architecture.

## 1. Confirmed current behavior

### Confirmed from current repo
- **Launch request keying today:** Apps Script does not send an idempotency key or active-scope key; it builds start payload from snapshot export + UI values, then POSTs `/campaigns/start`. The orchestrator defaults `campaignId` to `campaign-${Date.now()}` when none is provided. This means each click tends to create a new campaign identity.  
- **Active campaign identity storage today:** Apps Script stores active campaign fields in Script Properties (`ACTIVE_CAMPAIGN_ID`, folder, status, startedAt, pollTriggerUniqueId, lastPollAtIso, seed).  
- **Polling start/stop today:** after start succeeds, Apps Script installs a single time trigger by first deleting existing `pollActiveBenchmarkCampaign` triggers, then creating a new one. Terminal status removes trigger; manual stop also removes trigger.  
- **How COMPLETE is inferred today:** polling computes `effectiveStatusUpper`; if backend status is non-terminal but import-side counts/best evidence look complete, Apps Script promotes to COMPLETE and writes `COMPLETE` to SCORER_CONFIG status.  
- **SEARCH_LOG / SEARCH_PROGRESS refresh today:** each poll calls `refreshBenchmarkTablesFromCampaignFolder_()`, which appends selected campaign report rows to SEARCH_LOG and refreshes SEARCH_PROGRESS summary sheet; winner inspection is also attempted for best-run projection.
- **Orchestrator active-campaign handling today:** orchestrator keeps `activeCampaigns` in memory (Map by campaignId); no scope-level overlap lock exists. `/campaigns/status` returns persisted campaign status file when available, else in-memory entry.
- **Campaign folder artifact writing today:** orchestrator runner writes `benchmark_campaign_status_v1.json` repeatedly during lifecycle and finalizes status after launcher exit.

### Hypothesis (not directly provable from code only)
- The real incident likely combined re-click + no authoritative overlap lock + UI-side COMPLETE promotion + import/poll desync.

## 2. Resolve the 5 design decisions

### A) Active-scope key (duplicate-start rejection)
**Decision:** active-scope key = `spreadsheetId + ":OPERATIONAL_SEARCH"`.

**Why this key for this codebase:**
- The red button controls one operational-search lane per spreadsheet (SCORER_CONFIG + SEARCH_* tabs). Using sheet name/snapshot hash would allow accidental concurrent starts in the same operational lane.
- Current payload already includes spreadsheet identity from Apps Script; we can extend start contract with explicit `scopeKey` derived from spreadsheetId and fixed mode label.

**What counts as duplicate vs distinct run:**
- **Duplicate accidental relaunch:** same `scopeKey`, existing non-terminal lock, and new `launchRequestId` within active lock window → reject (`409 ACTIVE_CAMPAIGN_EXISTS`).
- **Idempotent replay:** same `scopeKey` + same `launchRequestId` → return same accepted campaign (no new run).
- **Distinct intentional run:** same `scopeKey` only allowed after previous scope lock is terminal/released; then new `launchRequestId` starts next campaign.

### B) Authoritative lock
**Decision:** authoritative lock lives in orchestrator-managed durable lock artifact under orchestrator output root, keyed by scope key.  
**Path pattern:** `<outputRootDir>/_locks/operational_scope_<sha(scopeKey)>.json`.

**Secondary mirrors (non-authoritative):**
- Apps Script Script Properties active state (cache/projection only).
- Orchestrator in-memory map (runtime cache only).

**Lock lifecycle:**
- **Acquire:** in `/campaigns/start`, before campaign creation; write lock atomically with fields `{scopeKey, campaignId, launchRequestId, acquiredAt, expiresAt, heartbeatAt, status}`.
- **Release:** when authoritative campaign status transitions terminal (`COMPLETE|FAILED|CANCELLED`) and post-terminal lock update is persisted.
- **Crash/restart survival:** durable lock file survives process restart; start path reads lock file first.
- **Expiry & stale-lock recovery:** lock has TTL (e.g., 15 min) and heartbeatAt refreshed by orchestrator status updates. If expired and no running campaign heartbeat, mark stale and allow controlled takeover (recording takeover event).
- **Manual admin recovery:** explicit admin action sets `forceUnlock=true` (or manual lock file edit/removal) with mandatory reason recorded in events.

### C) Poll trigger lifecycle
**Decision:** exactly one poll trigger (`pollActiveBenchmarkCampaign`) per script project.

**Rules:**
- **Create trigger:** only after start ACK accepted and active state saved.
- **Max count:** 1.
- **Duplicate detection:** every trigger install begins with full delete sweep for same handler (already present behavior); retain this as required invariant.
- **Remove trigger:** on terminal states, on explicit stop, and when no active campaignId exists.
- **Apps Script crash mid-run:** stale trigger may remain; on next poll execution, compare Script Properties active state + backend status. If no active campaign or terminal reached, self-delete.
- **Periodic stale cleanup:** every poll cycle performs lightweight hygiene: if trigger exists but active state absent/terminal > grace window, remove trigger and set status `IDLE`/`STALE_CLEANED` note.

### D) Status artifact ownership (single writer per artifact)
| Artifact | Purpose | Canonical writer | Update moments | Readers |
|---|---|---|---|---|
| `benchmark_campaign_status_v1.json` (campaign folder) | Authoritative current campaign snapshot | **Orchestrator runner** (`run_campaign`) | start accepted, progress refreshes, terminal transition | orchestrator status API, Apps Script poller, recovery tools |
| `campaign_events_v1.jsonl` (campaign folder) | Append-only audit timeline | **Orchestrator server** (and orchestrator-runner for run-progress events only) | start requested/accepted/rejected, status heartbeat, terminal, recovery actions | operators, reconciliation tooling |
| `benchmark_campaign_report_v1.json` | Run-level summary/detail artifact | **Launcher pipeline** (existing) | mid/final report writes | importer + reconciliation |
| Sheet status fields (SCORER_CONFIG named ranges) | UI projection only | **Apps Script poll/start controller** | user start click, each poll tick, import/reconcile outcome | human operators |
| SEARCH_LOG rows | Imported historical run rows | **Apps Script importer path** | import append/replace | writeback selection + audit in sheet |
| SEARCH_PROGRESS rows | Sheet-derived progress/review summary | **Apps Script summary refresh** | after SEARCH_LOG import refresh | human operators |

**Important ownership rule:** no artifact gets multi-writer semantics unless unavoidable; if unavoidable (events), event types are partitioned by writer namespace.

### E) Backend-complete but import-incomplete semantics
**Decision:** never show `COMPLETE` until backend-complete + import-complete + reconciliation-in-sync.

Use explicit states:
- `BACKEND_COMPLETE_UNIMPORTED`: backend status terminal COMPLETE, but import not yet successful for this campaign.
- `IMPORT_FAILED`: import attempt failed for current campaign.
- `RECONCILIATION_FAILED`: import succeeded but counts/identity parity checks failed.
- `DESYNC_DETECTED`: persistent disagreement across status/report/sheet projections.

Transitions:
- `RUNNING -> BACKEND_COMPLETE_UNIMPORTED` when backend COMPLETE first observed.
- `BACKEND_COMPLETE_UNIMPORTED -> IMPORTING` on import attempt.
- `IMPORTING -> COMPLETE` only if strict complete gate passes.
- `IMPORTING -> IMPORT_FAILED` on import error.
- `IMPORTING -> RECONCILIATION_FAILED` when imported data mismatches authoritative status/report.
- `RECONCILIATION_FAILED -> DESYNC_DETECTED` after retry threshold/time window.

## 3. Refined state machine

| State | Meaning | Source of truth | Display label | Allowed transitions | Terminal |
|---|---|---|---|---|---|
| `IDLE` | No active scope lock/campaign | Lock artifact absent + no active campaign | `IDLE` | -> `STARTING` | No |
| `STARTING` | Start requested; awaiting accepted campaign identity | Orchestrator start response + local pending marker | `STARTING (requesting backend)` | -> `RUNNING`, `FAILED` | No |
| `RUNNING` | Backend actively executing | `benchmark_campaign_status_v1.json` status RUNNING/PENDING | `RUNNING` | -> `BACKEND_COMPLETE_UNIMPORTED`, `FAILED`, `CANCELLED`, `STALE_STATUS` | No |
| `BACKEND_COMPLETE_UNIMPORTED` | Backend complete; sheet import not done yet | backend status COMPLETE + import flag false | `BACKEND COMPLETE / IMPORT PENDING` | -> `IMPORTING`, `IMPORT_FAILED` | No |
| `IMPORTING` | Import/reconcile in progress | importer attempt + reconciliation step | `IMPORTING` | -> `COMPLETE`, `IMPORT_FAILED`, `RECONCILIATION_FAILED` | No |
| `IMPORT_FAILED` | Import failed for active campaign | importer result | `IMPORT FAILED` | -> `IMPORTING`, `DESYNC_DETECTED` | No |
| `RECONCILIATION_FAILED` | Import done but parity check failed | reconciliation result | `RECONCILIATION FAILED` | -> `IMPORTING`, `DESYNC_DETECTED` | No |
| `DESYNC_DETECTED` | Persistent disagreement among artifacts/projections | reconciliation supervisor | `DESYNC DETECTED` | -> `IMPORTING`, `RECOVERED_FROM_DRIVE`, `FAILED` | No |
| `RECOVERED_FROM_DRIVE` | Active status reconstructed from Drive artifacts | recovery procedure output | `RECOVERED (VERIFYING)` | -> `RUNNING`, `IMPORTING`, `FAILED` | No |
| `STALE_STATUS` | No backend confirmation within SLA | freshness evaluator | `STALE STATUS` | -> `RUNNING`, `DESYNC_DETECTED`, `FAILED` | No |
| `COMPLETE` | Backend complete + import/reconcile complete and in sync | strict gate across backend+import+reconcile | `COMPLETE (SYNCED)` | (none except admin recovery flows) | **Yes** |
| `FAILED` | Campaign terminal failure | backend status/error | `FAILED` | (none except admin recovery flows) | **Yes** |
| `CANCELLED` | Campaign terminal cancellation | backend status | `CANCELLED` | (none except admin recovery flows) | **Yes** |

**Strict COMPLETE entry conditions (all required):**
1) backend status artifact exists and says `COMPLETE` for same campaignId,  
2) `completedRunCount == plannedRunCount` in backend status artifact,  
3) campaign report validates and agrees on campaign identity and counts,  
4) importer has succeeded for this campaign after backend completion timestamp,  
5) reconciliation verdict is `IN_SYNC`,  
6) freshness not stale at decision moment.

## 4. Source-of-truth hierarchy

Priority order:
1. **Authoritative execution truth:** `benchmark_campaign_status_v1.json` (campaign folder).  
2. **Authoritative timeline truth:** `campaign_events_v1.jsonl`.  
3. **Derived run-detail truth:** `benchmark_campaign_report_v1.json`.  
4. **Derived corroboration:** runs/ enumeration + manifests/artifacts.  
5. **Cached projection only:** orchestrator status endpoint payload (a transport view), Apps Script properties, SCORER_CONFIG cells, SEARCH_* tabs.

Concrete disagreement rules:
- If status artifact vs report disagree on terminality/counts: **trust status artifact**, set `RECONCILIATION_FAILED` and warning text referencing report mismatch.
- If status artifact says COMPLETE but sheet shows fewer imported rows: **trust status artifact**, show `BACKEND_COMPLETE_UNIMPORTED` or `IMPORT_FAILED` until resolved.
- If sheet says COMPLETE but backend not COMPLETE: **trust backend**, force non-terminal UI state and write desync warning.

## 5. SCORER_CONFIG redesign

### Minimal required fields (implementation-ready)
| Field | Source | Live-confirmed or cached |
|---|---|---|
| `OperationalState` | state machine evaluator in Apps Script (from backend+import) | live-confirmed each poll |
| `StatusSource` | Apps Script (enum: `backend_status`, `backend_status+import`, `cache_only`) | live-confirmed |
| `ActiveCampaignId` | backend status or start ACK | live-confirmed |
| `ActiveCampaignFolder` | backend status or start ACK | live-confirmed |
| `ScopeKey` | deterministic from spreadsheetId | cached deterministic |
| `LaunchRequestId` | start request metadata | cached |
| `PlannedRuns` | backend status | live-confirmed |
| `BackendCompletedRuns` | backend status | live-confirmed |
| `ImportedRuns` | SEARCH_LOG filtered by active campaign | derived live |
| `LastBackendConfirmedAt` | backend status `lastUpdated` | live-confirmed |
| `LastPollAttemptAt` | Apps Script poll tick | cached runtime |
| `Freshness` | Apps Script computed (FRESH/AGING/STALE) | derived live |
| `ReconciliationState` | Apps Script reconciliation check | derived live |
| `Warning` | Apps Script synthesized concise message | derived live |

### Optional nice-to-have
- `CurrentBestRunId`, `CurrentBestScore`, `CurrentBestScorerFingerprintShort`, `LastImportAttemptAt`, `LastImportResultCode`.

### Freshness presentation
- `FRESH`: backend confirmed <= 2 poll intervals.
- `AGING`: >2 and <=5 intervals.
- `STALE`: >5 intervals.
- If stale, displayed status prefix: `STALE · <state>`.

### Warning text for desync
- Example fixed text template:  
  `DESYNC: backend completed={X}/{Y}, imported={Z}, reportRuns={R}. Showing non-terminal state until reconciled.`

## 6. SEARCH_PROGRESS / SEARCH_LOG contract implications

### SEARCH_LOG should represent
- Imported confirmed campaign report rows (historical run records).
- Must include campaign identity (`CampaignId` add), import provenance (`ImportMode`, `ImportAt`, `RecoveryFlag`).
- Should **not** declare campaign terminal truth on its own.

### SEARCH_PROGRESS should represent
- Live projection/reconciliation rows (current campaign status lens), including freshness and desync fields.
- Should include state label (`RUNNING`, `IMPORT_FAILED`, etc.) and source label.

### Labeling requirements
- Recovered campaigns: `RecoveryFlag=true`, `RecoveryReason`, `RecoveredAt`.
- Desynced campaigns: explicit `ReconciliationState=DESYNC` + mismatch details.
- Partially imported backend-complete campaigns must display as `BACKEND_COMPLETE_UNIMPORTED` (not COMPLETE).

## 7. File-by-file implementation target

### Minimum files likely to change
1) **Apps Script controller**
- `benchmark_orchestration.js`  
  - Why: start idempotency payload (`scopeKey`, `launchRequestId`), strict COMPLETE gating, backend-complete/import-incomplete states, trigger hygiene checks.  
  - Patch surface: start payload builder; start handler guard; poll state evaluator; terminal transition logic.
- `benchmark_ui.js`  
  - Why: SCORER_CONFIG status field writes + warning/freshness labels.  
  - Patch surface: control map additions, status write helpers.

2) **Shared pure compute / import projection**
- `benchmark_result_import.js`  
  - Why: import result codes, campaign identity parity checks, reconciliation outputs consumable by poller.  
  - Patch surface: import return payload shape + reconciliation helpers.
- `benchmark_trials.js`  
  - Why: SEARCH_LOG/SEARCH_PROGRESS schema extensions for provenance/recovery/desync fields.  
  - Patch surface: headers, row builders, summary refresh logic.

3) **External orchestrator**
- `orchestrator/server.js`  
  - Why: authoritative scope lock + idempotent start semantics + 409 conflict contract + lock recovery handling.  
  - Patch surface: start request validation, lock acquire/release/check, status response fields.
- `orchestrator/run_campaign.js`  
  - Why: status artifact enrichment and heartbeat fields used by lock freshness + strict terminal metadata.  
  - Patch surface: status write payload fields and terminal metadata updates.
- `orchestrator/campaign_state.js`  
  - Why: contract/schema extension for new status fields.  
  - Patch surface: validation + summary serialization.

4) **Local launcher (minimal, optional)**
- `tools/phase12_large_benchmark/run_phase12_large_benchmark.js`  
  - Why only if needed to expose additional report metadata for reconciliation parity.

5) **Sheet contract/output writing**
- Mainly within `benchmark_ui.js` + `benchmark_trials.js`; no need to touch allocator/scorer core.

### Files/layers likely should NOT change
- `allocator_*`, `parser_*`, `scorer_main.js`, `engine_*`, `worker/server.js` (unless reconciliation needs currently unavailable fields; default plan avoids this).

## 8. Recommended implementation sequence

1. **Make false COMPLETE impossible (first)**
- Remove import-inferred COMPLETE promotion path; enforce strict COMPLETE gate in poller.
- Add explicit intermediate states (`BACKEND_COMPLETE_UNIMPORTED`, `IMPORT_FAILED`, `RECONCILIATION_FAILED`).

2. **Duplicate-start prevention**
- Add `scopeKey` + `launchRequestId` in Apps Script start payload.
- Implement orchestrator lock + idempotent replay + 409 conflict.

3. **Trigger hygiene**
- Enforce one-trigger invariant with startup/poll cleanup logic and stale-trigger self-removal.

4. **Truthful desync/import states**
- Add reconciliation evaluator and mismatch warnings in Apps Script status projection.

5. **Campaign event/status artifacts**
- Extend `benchmark_campaign_status_v1.json` fields and add `campaign_events_v1.jsonl` append flow.

6. **SCORER_CONFIG redesign**
- Add minimal required fields + source/freshness/reconciliation visibility.

7. **Responsiveness polish (after truthfulness)**
- Fast `STARTING`/`START ACCEPTED` acknowledgements and clearer operator wording; keep semantics truthful.

This ordering allows the next checkpoint to be coding-focused with minimal ambiguity on lock semantics, trigger lifecycle, artifact ownership, and terminal-state behavior.
