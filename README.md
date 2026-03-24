# CGH ICU/HD Roster Allocator

Google Sheets + Apps Script system for monthly ICU/HD call roster allocation.

This checkpoint README is intentionally a **front door**: it gives the operating model and where to read next, while deeper details live under `docs/`.

## Project purpose

The project reads roster input data from `Sheet1`, builds valid per-day candidate pools for four slots (`MICU_CALL`, `MICU_STANDBY`, `MHD_CALL`, `MHD_STANDBY`), runs randomized allocation trials, scores results (**lower is better**), and writes a selected winner back to `Sheet1` rows 35–38.

For large searches, the same compute pipeline can run outside Apps Script via:
- a stateless worker (`worker/server.js`) and
- an optional campaign orchestrator (`orchestrator/server.js`).

## Core principles

- **Hard constraints first, soft scoring second.**
- **Single compute contract across local and external execution** (`compute_snapshot_v2` → `headless_random_trials_result_v2` → `transport_trial_result_v1`).
- **Writeback guarded by contract validation** (must include valid `bestAllocation`).
- **Operational search is benchmark-driven** (import campaign artifacts, inspect winner, then apply roster).

## High-level architecture

1. **Sheet/App Script boundary**
   - parse sheet inputs (`parser_*.js`)
   - read scorer config (`scorer_config.js`)
   - write roster output (`writer_output.js`)
2. **Pure compute runtime**
   - candidate building/allocation (`allocator_*.js`)
   - scoring (`scorer_main.js`)
   - snapshot/runner/invocation contracts (`engine_snapshot.js`, `engine_runner.js`, `engine_invoke.js`)
3. **External execution path**
   - worker HTTP compute (`worker/`)
   - campaign orchestration + status tracking (`orchestrator/`)
   - local large-run launcher tooling (`tools/phase12_large_benchmark/`)

See: [`docs/architecture.md`](docs/architecture.md)

## Operational workflow (current)

1. Prepare inputs/scorer config in spreadsheet.
2. Initialize benchmark controls (`Operational Search` menu).
3. Run/import benchmark results (latest or selected campaign artifact).
4. Inspect current best winner in sheet tables.
5. Apply winner to `Sheet1` writeback rows.

See: [`docs/workflows.md`](docs/workflows.md)

## Key sheet/tab contract

Primary sheet contract centers on `Sheet1` ranges:
- headers `B1:AC1`, `B2:AC2`
- doctor blocks `A4:A11` / `A14:A20` / `A23:A30` + matching request grids
- points rows `B32:AC32`, `B33:AC33`
- writeback rows `35`–`38`

Benchmark and control surfaces use:
- `SCORER_CONFIG`
- `SEARCH_LOG`
- `SEARCH_PROGRESS`

See: [`docs/sheet-contract.md`](docs/sheet-contract.md)

## Request code / constraint philosophy

- Request codes are parsed per cell (comma-separated, validated against allowed code list).
- Same-day hard blocks remove candidates from all slots.
- `CR` is a soft preference/reward signal (not a hard guarantee).
- Leave/training-style codes can trigger **previous-day soft penalty**.
- Back-to-back call prohibition is enforced during assignment (same doctor cannot hold call slots on consecutive dates).

## Repo structure (grouped)

- Apps Script entrypoints/UI: `Code.js`, `benchmark_ui.js`, `benchmark_trials.js`
- Parse/availability: `parser_*.js`
- Allocate/score/engine contracts: `allocator_*.js`, `scorer_*.js`, `engine_*.js`
- Writeback: `writer_output.js`
- Benchmark export/import/orchestration (Apps Script): `benchmark_snapshot_export.js`, `benchmark_result_import.js`, `benchmark_orchestration.js`
- External services: `worker/`, `orchestrator/`
- Local launcher tooling: `tools/phase12_large_benchmark/`
- Deployment/env scripts: `scripts/load_env.sh`, `scripts/deploy_cloud_run.sh`

## Local dev / Git / clasp workflow

1. Make and test changes locally.
2. Commit/push via git.
3. If Apps Script sources changed, deploy via `clasp`.
4. If worker/orchestrator changed, deploy Cloud Run services separately.
5. Use `scripts/load_env.sh` before launcher/deploy commands.

## Validation / debugging entry points

- Menu-driven operational actions in `Code.js` (`onOpen`, inspect/apply actions).
- Snapshot and transport debug helpers:
  - `debugBuildComputeSnapshotForExternalHttp`
  - `debugLocalDirectTransportTrialResult`
  - `debugExternalHttpTransportTrialResult`
- Allocation/candidate debug helpers:
  - `debugBuildCandidatePoolsForFirstDate_`
  - `debugAllocateAllDaysRandom`
  - `debugAllocateAllDaysGreedy`

## Current limitations / status

- Large benchmark/campaign flow introduces multiple status layers (UI state, Script Properties, orchestrator status file).
- There is compatibility/legacy handling in headers and result aliases, which increases cognitive load.
- `Code.js` still contains old/dummy utilities (`generateRoster`) alongside production menu flows.
- Behavior is highly contract-driven; version mismatches fail fast by design.

---

If you are re-orienting, start with:
1. [`docs/architecture.md`](docs/architecture.md)
2. [`docs/workflows.md`](docs/workflows.md)
3. [`docs/sheet-contract.md`](docs/sheet-contract.md)
