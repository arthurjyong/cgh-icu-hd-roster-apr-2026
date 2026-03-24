# CGH ICU/HD Roster Allocator

This repository contains a **Google Sheets + Apps Script monthly roster allocator** for ICU/HD call scheduling, plus optional external compute services for large trial runs.

## What this code does

At a high level:

1. Reads a roster month from Google Sheets.
2. Parses doctor eligibility, requests, and constraints.
3. Builds valid candidate pools for each date and slot.
4. Runs allocation (greedy or random trials).
5. Scores allocations for fairness/cost.
6. Writes the selected allocation back to the sheet.

Primary slots:
- `MICU_CALL`
- `MICU_STANDBY`
- `MHD_CALL`
- `MHD_STANDBY`

Sheet writeback target:
- `Sheet1` rows `35`–`38`, columns from `B` onward.

## Core principles and assumptions

The engine is built around a few assumptions:

- **Validity first**: only candidates that pass eligibility/blocking constraints are considered.
- **Cost minimization**: scoring is treated as a penalty score where **lower is better**.
- **Determinism when seeded**: random-trial runs are reproducible with the same seed + snapshot.
- **Separation of concerns**:
  - Apps Script handles sheet I/O and orchestration.
  - Pure compute modules handle candidate generation, allocation, and scoring.
- **Contracted boundaries**: request/response payloads between orchestrators/workers are explicit versioned JSON contracts.

## Runtime modes

The same compute path can be invoked in three ways:

- `LOCAL_DIRECT`
  - Apps Script invokes headless compute directly.
- `LOCAL_SIMULATED_EXTERNAL`
  - Apps Script performs JSON clone-in/clone-out to simulate HTTP boundaries.
- `EXTERNAL_HTTP`
  - Apps Script posts snapshot JSON to the worker (`/run-random-trials`) and validates transport response.

## Repository map

### Apps Script / shared compute modules

- `Code.js` — user-facing menu actions and entrypoints.
- `parser_*.js` — sheet parsing and normalization.
- `allocator_*.js` — candidate pool building and allocation logic.
- `scorer_*.js` — scoring logic + weights/fingerprint behavior.
- `engine_snapshot.js` — `compute_snapshot_v2` build/validation path.
- `engine_runner.js` — headless random-trial execution + transport result building.
- `engine_invoke.js` — invocation mode switching and external HTTP handling.
- `writer_output.js` — validation + writeback to sheet rows 35–38.
- `benchmark_*.js` — benchmark export/import and sheet reporting flows.

### Worker service

- `worker/server.js` — authenticated HTTP compute endpoint.
- `worker/load_pure_compute.js` — dynamic load of pure compute runtime.
- `worker/Dockerfile` — worker image build.

### Orchestrator service

- `orchestrator/server.js` — campaign lifecycle API for long benchmark campaigns.
- `orchestrator/run_campaign.js` — campaign execution loop and state updates.
- `orchestrator/drive_snapshot.js` — Drive snapshot retrieval helpers.
- `orchestrator/campaign_state.js` — status/state persistence.
- `orchestrator/Dockerfile` — orchestrator image build.

### Local benchmark launcher

- `tools/phase12_large_benchmark/run_phase12_large_benchmark.js` — local CLI launcher.
- `tools/phase12_large_benchmark/launcher_*.js` — planning, chunking, HTTP invoke, consolidation, checkpointing, artifact upload.

### Deployment/environment scripts

- `scripts/load_env.sh` — canonical env loading + alias compatibility.
- `scripts/deploy_cloud_run.sh` — deploy worker/orchestrator images to Cloud Run.

## Data contracts

### Input

- `compute_snapshot_v2`
  - top-level shape includes:
    - `contractVersion`
    - `trialSpec`
    - `inputs`
    - `scorer`
    - `metadata`

### Headless internal result

- `headless_random_trials_result_v2`

### Transport result

- `transport_trial_result_v1`

Notes:
- Worker response validation is strict before writeback.
- Writeback currently requires `bestAllocation` in transport payload.

## Typical workflows

### In-sheet allocation (normal use)

Use Apps Script menu/actions in `Code.js`:
- run best random trial and write to sheet
- inspect/import benchmark winners
- apply current/specific winner to `Sheet1`

### Large external benchmarking

Recommended for very high trial counts:

1. Export snapshot from Apps Script.
2. Run local launcher to execute chunked campaign against worker.
3. Upload campaign artifacts to Drive.
4. Import campaign report back into benchmark tables.
5. Apply winning roster back to sheet.

### UI-driven external campaign smoke test

1. Open the benchmark controls in the bound Google Sheet and set a valid target max trial count.
2. Click **Generate Rosters** to start the external campaign flow from the UI.
3. If `BENCHMARK_TRIALS` / `BENCHMARK_SUMMARY` / `BENCHMARK_REVIEW` are missing, the UI start flow auto-runs `resetBenchmarkSheets()` before launch.
4. Confirm campaign status transitions to running and that campaign metadata is populated in the UI status cells.

## Optimization review (clear opportunities)

After reviewing the repository, the highest-value optimizations are:

1. **Batch writeback in `writer_output.js`**
   - Current implementation performs one `setValues` call per slot row.
   - Can be reduced to one contiguous `setValues` call for rows 35–38 to reduce Apps Script round-trips.

2. **Cache loaded runtime in `worker/server.js`**
   - Worker currently reloads pure compute runtime on each request path.
   - In-process memoization of the loaded runtime can cut per-request overhead.

3. **Avoid pretty-print JSON in hot HTTP responses**
   - `sendJson` currently uses `JSON.stringify(..., null, 2)` in worker/orchestrator.
   - Switching to compact JSON in non-debug paths reduces payload size and CPU.

4. **Reduce repeated deep cloning in simulated mode**
   - `LOCAL_SIMULATED_EXTERNAL` intentionally clones request/response boundaries.
   - Keep for contract testing, but avoid for performance-sensitive paths where not needed.

These are engineering refinements; current behavior and functional flow are already coherent.

## Minimal operational prerequisites

- Google Sheet configured with expected structure and named ranges.
- Apps Script project bound to the sheet with these files deployed.
- For external mode:
  - Cloud Run worker URL and token configured in Script Properties.
- For campaign/orchestrator flows:
  - Drive OAuth credentials/tokens available.
  - Drive root + benchmark run folder IDs configured.

## Security and operational notes

- Worker and orchestrator both expect Bearer token auth.
- Snapshot/transport contract validation is enforced before compute/writeback.
- Keep secret material in env/secret files (see `scripts/load_env.sh`) rather than hardcoding in script files.

---

If you are onboarding: start at `Code.js` (menu entrypoints), then follow `engine_snapshot.js` → `engine_invoke.js` → `engine_runner.js` → `writer_output.js`.
