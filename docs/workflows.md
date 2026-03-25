# Workflows (checkpoint: current implementation)

## 1) In-sheet operational workflow (current default)

1. Operator uses `Operational Search` menu (`onOpen` in `Code.js`).
2. Benchmark controls are initialized/read on `SCORER_CONFIG`.
3. Benchmark results are imported into sheet tables (`SEARCH_LOG`, `SEARCH_PROGRESS`).
4. Winner is inspected via benchmark helper functions.
5. Winner is applied to `Sheet1` by writeback routines (default strategy: `FAST_ASC_VALIDATE` + `LEAN_OPERATIONAL` validation; scoped `SEARCH_LOG` rows are sorted by lowest `BestScore`, validated on-demand, and selection stops at first writeback-safe winner).
6. Before winner selection, duplicate cleanup runs against `SEARCH_LOG` and `SEARCH_PROGRESS`:
   - exact duplicates (`RunId` + `BestScore` [+ same artifact fields]) are auto-deleted bottom-up;
   - conflict duplicates (same `RunId` with differing key fields) are resolved via targeted Drive checks (`SEARCH_PROGRESS` cleanup follows RunId-level canonical outcome).
   - when Drive checks are inconclusive/transient for a conflict group, cleanup skips destructive pruning for that RunId.
7. Operational default guardrails:
   - `maxAttempts=15` and `maxFailureSamples=5` (overrideable via options),
   - concise failure summaries include attempted `RunId` values and sampled reasons.

Common entrypoints:
- `initializeBenchmarkControlPanel`
- `importLatestBenchmarkCampaignToTables`
- `importSelectedBenchmarkCampaignToTables`
- `inspectCurrentBestBenchmarkWinner`
- `applyCurrentBestBenchmarkRoster`

## 2) Parse → snapshot → compute → writeback workflow

1. Parse inputs from `Sheet1` (`parseRosterSheet`).
2. Build snapshot (`prepareRandomTrialsSnapshot_` / `buildComputeSnapshotFromParseResult_`).
3. Invoke compute (`invokeTrialCompute_`) using selected mode.
4. Validate transport result (`validateTransportTrialResult_`).
5. Validate writeback contract (`validateTransportTrialResultForWriteback_`).
6. Write output names to rows 35–38 from column B onward.

## 3) Invocation modes workflow

### `LOCAL_DIRECT`

- Snapshot validated.
- Compute runs in-process directly.
- Transport validation applied before returning.

### `LOCAL_SIMULATED_EXTERNAL`

- Snapshot cloned as request body.
- Local worker-style compute function runs.
- Response cloned and validated as inbound transport.

### `EXTERNAL_HTTP`

- Snapshot validated.
- Apps Script sends authenticated POST to worker endpoint.
- HTTP and JSON response validated.
- Transport contract validated before downstream usage.

## 4) Benchmark export/import workflow

### Export

- `exportPhase12BenchmarkSnapshotToDrive_` builds and validates snapshot.
- Snapshot JSON saved to Drive snapshots folder with metadata-rich filename.

### Run (outside Apps Script)

- Local launcher and/or orchestrator runs trials against worker.
- Artifacts are produced per run/campaign (including transport result/report/status JSON).

### Import

- `benchmark_result_import.js` resolves artifact selection mode:
  - `LATEST` (default) or
  - `SELECTED` (specific run folder).
- Imported rows populate `SEARCH_LOG`; projection writes to `SEARCH_PROGRESS`.
- Winner is then eligible for writeback.

## 5) Orchestrator campaign workflow

1. Apps Script exports snapshot and builds campaign start payload.
2. Orchestrator `/campaigns/start` validates input and starts campaign.
3. Orchestrator runs local launcher subprocess (`run_campaign.js`).
4. Campaign status file (`benchmark_campaign_status_v1.json`) is updated over time.
5. Apps Script polls `/campaigns/status`, updates UI/state, and later imports final report.

## 6) Writeback workflow and guards

Writeback depends on a valid `transport_trial_result_v1` that includes `bestAllocation`:

- each day must include assignment keys for all 4 slots;
- assigned values must be `null` or objects with `fullName`;
- rows are written slot-by-slot (`MICU_CALL` row 35, etc.).

If validation fails, writeback throws and does not partially apply output.

Mode split:

- **Operational button flow (`applyCurrentBestBenchmarkRoster`)** uses lean transport/writeback safety checks only (no `run_manifest.json` reads).
- **Strict audit/manual mode (`STRICT_FULL_SCAN` / `STRICT_AUDIT`)** additionally enforces manifest/provenance checks.
