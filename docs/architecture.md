# Architecture (checkpoint: current implementation)

This document describes the architecture **as implemented in the current repo**, separating confirmed behavior from lightweight inference.

## 1) System purpose and boundary

Confirmed:
- The system allocates monthly ICU/HD roster slots from sheet data and writes chosen assignments back to `Sheet1`.
- Core slots are `MICU_CALL`, `MICU_STANDBY`, `MHD_CALL`, `MHD_STANDBY`.
- Scoring direction is lower-is-better.

Primary in-repo boundaries:

1. **Sheet/app boundary (Apps Script)**
   - input parsing (`parser_*.js`)
   - scorer config ingestion (`scorer_config.js`)
   - benchmark UI/table operations (`benchmark_ui.js`, `benchmark_trials.js`, `benchmark_result_import.js`)
   - writeback (`writer_output.js`)

2. **Pure compute boundary (shared logic)**
   - snapshot contract (`engine_snapshot.js`)
   - candidate/allocator/scorer runtime (`allocator_*.js`, `scorer_main.js`)
   - random trial runner + transport contract (`engine_runner.js`)

3. **External compute boundary**
   - stateless worker (`worker/server.js`) exposes `/run-random-trials` and validates request/response contracts
   - Apps Script invokes worker via `engine_invoke.js` in `EXTERNAL_HTTP` mode

4. **Campaign orchestration boundary**
   - orchestrator service (`orchestrator/server.js`) manages multi-run campaigns and status files
   - campaign state contract in `orchestrator/campaign_state.js`
   - orchestration invoked from Apps Script (`benchmark_orchestration.js`) or local launcher tooling

## 2) End-to-end compute chain

Confirmed chain:

1. Parse sheet into parse result (`parseRosterSheet`).
2. Build compute snapshot (`compute_snapshot_v2`) with:
   - trial spec,
   - parsed inputs,
   - scorer weights/fingerprint,
   - metadata.
3. Execute random trials (`runRandomTrialsHeadless_`).
4. Convert to transport payload (`transport_trial_result_v1`).
5. Validate transport payload before writeback/import usage.

Invocation modes are:
- `LOCAL_DIRECT`
- `LOCAL_SIMULATED_EXTERNAL`
- `EXTERNAL_HTTP`

## 3) Allocation and scoring responsibilities

### Allocation responsibilities

- Candidate eligibility per slot/date from doctor section + hard blocks.
- In-day exclusivity: one doctor cannot occupy two slots on same date.
- Inter-day hard rule: a doctor assigned to call cannot be assigned to call on the next day.
- Random allocator is used for trial search; greedy allocator exists mostly for debug/manual paths.

### Scoring responsibilities (high level)

Scoring contract is versioned (`contractVersion` 2) and componentized. Current component keys include:
- unfilled penalty
- within-section point balance
- global point balance
- spacing penalty
- pre-leave penalty
- CR reward (with diminishing returns)
- dual-eligible ICU bonus
- standby adjacency penalty
- standby count fairness penalty

Confirmed intent in code/comments:
- hard validity is enforced before scoring;
- scoring compares valid outcomes, preferring lower total score.

## 4) Status concepts and where they live

There are several status layers:

1. **Parse/candidate/allocation/scoring/result `ok` flags**
   - local function-level success/failure contract.

2. **Benchmark UI operational status fields**
   - cells/named ranges in `SCORER_CONFIG` (status, source, freshness, reconciliation, warning).

3. **Apps Script orchestrator active state**
   - Script Properties with `BENCHMARK_ORCHESTRATION_*` keys.

4. **Orchestrator campaign status contract**
   - `benchmark_campaign_status_v1`
   - states include `PENDING`, `RUNNING`, `COMPLETE`, `FAILED`.

Inference (explicit):
- The system intentionally keeps UI and backend status separate, then reconciles them for operator visibility.

## 5) Architecture rough edges / complexity hotspots

Confirmed from current code organization:

- **Many operational entrypoints** in `Code.js` and benchmark modules increase discoverability cost.
- **Multiple contracts and compatibility aliases** (legacy headers, alias fields) raise cognitive load.
- **Status multiplexing** across sheet cells, properties, and campaign files can be confusing.
- **Hybrid runtime model** (Apps Script + Node worker + Node orchestrator + launcher scripts) is powerful but operationally dense.
- **Legacy/debug helpers mixed with production actions** can blur “golden path” vs diagnostics.

## 6) File groups (quick responsibility map)

- `Code.js`: menu and high-level operator actions
- `parser_*.js`: sheet-to-parse-result contract
- `allocator_*.js`: candidate pools + assignment rules
- `scorer_*.js`: scoring logic, weights, fingerprints
- `engine_snapshot.js`: build/validate `compute_snapshot_v2`
- `engine_runner.js`: headless trial loop + transport shaping
- `engine_invoke.js`: local vs simulated vs external dispatch
- `writer_output.js`: writeback validation and row writes
- `benchmark_*`: snapshot export, import, UI state, sheet tables, orchestration glue
- `worker/*`: HTTP compute service for snapshot -> transport
- `orchestrator/*`: campaign lifecycle and status tracking
- `tools/phase12_large_benchmark/*`: local benchmark/campaign execution utilities
