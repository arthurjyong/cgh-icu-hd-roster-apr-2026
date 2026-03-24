# CGH ICU/HD Roster Allocator

This repository contains a Google Sheets + Apps Script roster allocation system for monthly ICU/HD call planning. It reads the roster month from `Sheet1`, enforces hard eligibility/availability constraints, searches many valid allocations, scores them (lower is better), and writes a chosen roster back to the sheet. For larger runs, the same compute path can be executed through an external HTTP worker and an optional campaign orchestrator.

## What this system does

At a high level:

1. Read monthly roster inputs from the sheet (`Sheet1`).
2. Parse doctor master rows, request codes, and day-level point values.
3. Build per-day candidate pools for four slots:
   - `MICU_CALL`
   - `MICU_STANDBY`
   - `MHD_CALL`
   - `MHD_STANDBY`
4. Generate allocations (single run or many random trials).
5. Score each valid allocation with configured scorer weights.
6. Write selected assignments back to `Sheet1` rows `35`–`38` from column `B` onward.

## Current architecture (boundaries and responsibilities)

### 1) Apps Script controller + sheet I/O

- `Code.js` exposes menu actions and operational entrypoints.
- Parser + writer modules are Apps Script-facing boundaries:
  - Parse sheet: `parser_*.js`
  - Write output: `writer_output.js`
- Benchmark UI/state inside sheet tabs and named ranges:
  - `benchmark_ui.js`
  - `benchmark_trials.js`

### 2) Shared compute runtime (pure logic)

These files contain the allocation/scoring/snapshot contracts reused by Apps Script and worker loading:

- Snapshot contract build/validation: `engine_snapshot.js`
- Headless random trials and transport contract: `engine_runner.js`
- Candidate building and allocation rules: `allocator_*.js`
- Scoring and scorer identity/fingerprint: `scorer_*.js`

### 3) External worker (stateless HTTP compute)

- `worker/server.js` exposes:
  - `GET /healthz`
  - `POST /run-random-trials`
- Worker validates bearer token, validates snapshot request contract, runs headless trials, and returns transport result JSON.
- Worker loads compute modules via `worker/load_pure_compute.js`.

### 4) Orchestrator (campaign runner)

- `orchestrator/server.js` exposes campaign start/status APIs.
- It can download snapshot artifacts from Drive, execute campaign runs through the local launcher path, and track status files (`benchmark_campaign_status_v1`).
- Core loop/state helpers:
  - `orchestrator/run_campaign.js`
  - `orchestrator/campaign_state.js`
  - `orchestrator/drive_snapshot.js`

### 5) Local launcher (large benchmark execution)

- `tools/phase12_large_benchmark/run_phase12_large_benchmark.js`
- Companion `launcher_*.js` modules handle config, chunk planning, HTTP calls, consolidation, checkpointing, and optional Drive upload.
- Supports single-run and campaign execution modes.

## Sheet model and operational contract

Documented here only from current parser/writer code:

- Primary roster sheet is `Sheet1`.
- Calendar header is read from `B1:AC1`; weekday row from `B2:AC2`.
- Doctor blocks are sectioned and row-based:
  - ICU-only names/requests: `A4:A11`, `B4:AC11`
  - ICU/HD names/requests: `A14:A20`, `B14:AC20`
  - HD-only names/requests: `A23:A30`, `B23:AC30`
- Call points rows:
  - MICU points: `B32:AC32`
  - MHD points: `B33:AC33`
- Output writeback rows:
  - `MICU_CALL` -> row `35`
  - `MICU_STANDBY` -> row `36`
  - `MHD_CALL` -> row `37`
  - `MHD_STANDBY` -> row `38`
- Hard constraints are applied before soft fairness/preferences:
  - Slot eligibility by doctor section.
  - Same-day hard blocks from request codes.
  - No same-doctor double-slot on same day.
  - No call-slot assignment on consecutive days for the same doctor.

## Main workflows

### A) Normal in-sheet operation

1. Open sheet-bound Apps Script menu (`Operational Search`).
2. Use benchmark UI/control actions from `Code.js` menu handlers.
3. Inspect candidate winner and apply selected run to `Sheet1`.

Primary writeback flows are:
- `runWriteBestBenchmarkTrialsWinnerToSheet`
- `runWriteBenchmarkRunIdToSheet`
- `runWriteBestRandomTrialToSheetWithInvocationOptions_` (direct/simulated/external modes)

### B) External large-run benchmark flow

1. Export snapshot from Apps Script (`benchmark_snapshot_export.js`).
2. Run local launcher and/or orchestrator campaign execution.
3. Produce campaign artifacts (including transport results/report JSON).
4. Import selected/latest campaign report into sheet benchmark tables (`benchmark_result_import.js`).
5. Review winner and apply to `Sheet1`.

### C) Developer workflow

1. Edit locally and validate behavior.
2. Commit/push via git.
3. Deploy Apps Script files with `clasp` only when Apps Script sources changed.
4. Deploy worker/orchestrator separately for external compute changes.

### D) Cloud deployment workflow (high level)

1. Configure env files (`.env.shared` + `.env.local`).
2. Source canonical loader:
   - `source scripts/load_env.sh`
3. Deploy Cloud Run services via:
   - `scripts/deploy_cloud_run.sh worker|orchestrator|both`

## Environment and configuration

### Env file roles

- `.env.shared`: checked-in non-sensitive defaults and variable names.
- `.env.example`: template for local machine-specific values (copy to `.env.local`).
- `.env.local`: local overrides + sensitive pointers (not committed).

### Secrets and file indirection

- Keep secret values/files outside the repo.
- `scripts/load_env.sh` is the canonical loader and compatibility layer.
- It supports `*_FILE` indirection (e.g., worker/orchestrator token files) and exports compatibility aliases for launcher/orchestrator flows.

### Key external config domains

- Worker endpoint/token.
- Orchestrator endpoint/token.
- Drive OAuth credential/token file paths.
- Drive folder IDs (`root`, `benchmark_runs`, optional names).
- Cloud Run deploy knobs (service name, image, region, resources).

## Contracts and terminology

Current versioned payload/contracts in active code paths:

- `compute_snapshot_v2`
  - Snapshot payload sent to compute runtime/worker.
- `headless_random_trials_result_v2`
  - Internal headless compute result.
- `transport_trial_result_v1`
  - Response/transport payload used for validation and writeback.
- `benchmark_campaign_status_v1`
  - Orchestrator campaign status file contract.

## Repository map (quick navigation)

### Apps Script entrypoints and I/O
- `Code.js`
- `appsscript.json`
- `writer_output.js`

### Parse / allocate / score / engine
- `parser_*.js`
- `allocator_*.js`
- `scorer_*.js`
- `engine_snapshot.js`
- `engine_invoke.js`
- `engine_runner.js`

### Benchmark export/import/orchestration inside Apps Script
- `benchmark_snapshot_export.js`
- `benchmark_result_import.js`
- `benchmark_orchestration.js`
- `benchmark_ui.js`
- `benchmark_trials.js`
- `benchmark_drive_config.js`

### External services
- `worker/*`
- `orchestrator/*`

### Local campaign tooling
- `tools/phase12_large_benchmark/*`

### Scripts
- `scripts/load_env.sh`
- `scripts/deploy_cloud_run.sh`

## Operational guardrails

- Score direction is **lower is better**.
- Hard validity rules take priority over soft preference/fairness scoring.
- External mode requires valid auth tokens and configured endpoints.
- Writeback requires a valid `transport_trial_result_v1` with `bestAllocation` present.
- For execution tracing, start from controller entrypoints and follow engine boundaries (below).

## Getting oriented quickly

Recommended trace path for first read:

1. `Code.js` (menu actions and high-level flow)
2. `engine_snapshot.js` (build snapshot contract)
3. `engine_invoke.js` (local direct/simulated/external dispatch)
4. `engine_runner.js` (headless random trials + transport contract)
5. `writer_output.js` (writeback validation and sheet output)
6. Benchmark path:
   - export: `benchmark_snapshot_export.js`
   - run: `tools/phase12_large_benchmark/*` and/or `orchestrator/*`
   - import/apply: `benchmark_result_import.js` + benchmark UI actions in `Code.js`
