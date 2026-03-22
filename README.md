# CGH ICU/HD Roster Allocator (Apr 2026)

Google Sheets + Apps Script roster allocator for monthly ICU/HD MO call scheduling.

## Status

This is an active working project for building and refining a practical monthly roster allocator.

Current state:
- parser layer implemented
- candidate-pool layer implemented
- allocator validity layer implemented
- greedy allocator implemented
- random trial allocator implemented
- seeded RNG implemented for reproducible random trials
- scorer implemented, with sheet-driven weight configuration
- explicit compute snapshot contract implemented
- explicit headless trial result contract implemented
- transport-friendly trial result helper implemented
- Apps Script-side transport-result writeback validation implemented
- output writer implemented
- benchmark helpers implemented
- Apps Script `EXTERNAL_HTTP` invocation mode implemented
- Script Properties-based external worker config implemented
- public Cloud Run worker deployment implemented
- external worker compute path implemented and validated
- parity validated across local direct, simulated external, and public external HTTP modes
- Apps Script Drive folder/config boundary implemented
- Apps Script snapshot export to Drive implemented
- local large-benchmark launcher implemented
- local chunked benchmark consolidation implemented
- local checkpoint/resume implemented
- launcher Drive upload via desktop OAuth implemented
- campaign-mode external benchmarking implemented
- `benchmark_campaign_report_v1.json` implemented
- nested per-run campaign artifact layout implemented under `runs/`
- canonical raw per-run benchmark import into `BENCHMARK_TRIALS` implemented
- derived benchmark grouping in `BENCHMARK_SUMMARY` implemented
- imported best benchmark winner writeback to `Sheet1` rows 35–38 implemented
- score-direction consistency fixed so lower scorer totals win end-to-end

The system is usable in Google Sheets today.

Normal in-sheet allocation remains available for practical runs. Very large random-trial counts are better handled through the external benchmarking path, which is now operational end-to-end from snapshot export through campaign import and winner writeback.

## Purpose

This project generates a monthly call roster for:
- MICU Call
- MICU Standby
- MHD Call
- MHD Standby

It is designed to:
- read request codes from Google Sheets
- apply eligibility and blocking rules
- generate only valid candidate rosters
- score rosters for fairness
- write the best roster back to the sheet

## Design goals

The allocator should:
- respect eligibility groups
- respect leave / no-call / training constraints
- generate only valid assignments
- prioritize global fairness across the full roster
- remain understandable, auditable, and maintainable

This is a button-triggered allocator, not a real-time scheduling system.

## Current architecture

Google Sheets is the live user-facing control panel.

Apps Script currently handles:
- reading live sheet data
- parsing doctors, dates, requests, and rule effects
- resolving scorer configuration from code defaults plus optional sheet overrides
- building a normalized compute snapshot
- invoking compute in one of several modes:
  - local direct
  - local simulated external
  - public external HTTP worker
- exporting validated snapshots to Google Drive
- importing benchmark campaign report artifacts from Google Drive
- validating transport-friendly trial results before sheet writeback
- writing the best result back to the sheet
- writing benchmark raw rows to `BENCHMARK_TRIALS`
- writing grouped benchmark summaries to `BENCHMARK_SUMMARY`
- writing imported benchmark winners to `Sheet1` rows 35–38

Headless compute currently handles:
- consuming the normalized compute snapshot
- building candidate pools
- running repeated random trials
- scoring trials
- returning the best result

External worker currently handles:
- accepting a `compute_snapshot_v2` request over HTTP
- validating request structure
- running headless random trials
- returning a `transport_trial_result_v1` response

Local benchmarking launcher currently handles:
- reading exported snapshot artifacts
- planning large trial runs in deterministic chunks
- invoking the Cloud Run worker chunk-by-chunk
- consolidating global best and bounded top-N chunk winners
- checkpoint/resume
- campaign planning across trial counts and repeats
- generating `benchmark_campaign_report_v1.json`
- uploading campaign folders and nested run artifacts back to Google Drive

The codebase is intentionally structured in layers so the heavy allocation/scoring path can run outside Apps Script without redesigning roster rules or moving sheet read/write into the compute engine.

## Current compute contracts

The contract boundary is explicit.

### Input snapshot contract

Current input contract:
- `compute_snapshot_v2`

Top-level fields:
- `contractVersion`
- `trialSpec`
- `inputs`
- `scorer`
- `metadata`

Current intent:
- Apps Script builds this snapshot from parsed sheet data plus resolved scorer config
- headless compute consumes this snapshot as its normalized input

### Headless compute result contract

Current internal headless result contract:
- `headless_random_trials_result_v2`

This is the full internal result shape returned by the headless trial runner.

### Transport-friendly result contract

Current transport/helper result contract:
- `transport_trial_result_v1`

This is the leaner result shape intended for transport and external handoff.

Current intent:
- external request boundary = `compute_snapshot_v2`
- external response boundary = `transport_trial_result_v1`

Current operational note:
- sheet writeback still requires `bestAllocation` to be included in the transport result
- this is intentional for now to preserve the existing writer and keep diffs small

## Phase 10 status — external compute deployed

Completed:
- public Cloud Run worker deployed successfully
- Artifact Registry image build/push working
- Apps Script `EXTERNAL_HTTP` mode working end-to-end
- Script Properties used:
  - `TRIAL_COMPUTE_EXTERNAL_URL`
  - `TRIAL_COMPUTE_EXTERNAL_TOKEN`
- public worker accepts `compute_snapshot_v2`
- public worker returns `transport_trial_result_v1`
- `runWriteBestRandomTrialToSheetExternalHttp()` successfully writes best allocation back to `Sheet1` rows 35–38

Validated:
- parity confirmed across:
  - `LOCAL_DIRECT`
  - `LOCAL_SIMULATED_EXTERNAL`
  - public `EXTERNAL_HTTP`
- matching validated case:
  - `trialCount = 200`
  - `seed = 12345`
  - `bestTrial.index = 137`
  - `bestTrial.score = 3420.8473893633545`
  - `emptySlotCount = 0`

Operational notes:
- Cloud Run image must be built for `linux/amd64`
- Apple Silicon default image build was rejected by Cloud Run until rebuilt with `docker buildx build --platform linux/amd64 --push`
- `GET /healthz` is currently non-blocking and not required for the production path
- Google Sheets + Apps Script remain the live UI/controller
- external worker remains compute-only

## Phase 12 status — large external benchmarking via Drive + local launcher

Completed:
- Apps Script Drive root/config boundary implemented
- Drive root folder:
  - `cgh-icu-hd-roster-apr-2026`
- Drive subfolders:
  - `snapshots`
  - `benchmark_runs`
- Script Properties persistence of Drive folder IDs implemented
- Apps Script snapshot export to Drive implemented
- local large-benchmark launcher implemented under:
  - `tools/phase12_large_benchmark/`
- deterministic chunk planning implemented
- chunked worker invocation implemented
- local artifact consolidation implemented
- local checkpoint/resume implemented
- launcher upload to Drive via desktop OAuth implemented
- Apps Script import of benchmark result from Drive implemented
- Apps Script summary print to benchmark sheets implemented
- Apps Script writeback of imported winning allocation to `Sheet1` rows 35–38 implemented

Current Drive artifact layout:
- `cgh-icu-hd-roster-apr-2026/`
  - `snapshots/`
  - `benchmark_runs/`

Each benchmark run folder under `benchmark_runs/` may contain:
- `run_manifest.json`
- `global_best.transport_trial_result_v1.json`
- `top_chunks_summary.json`
- `top_chunks/`

Validated live:
- snapshot export to Drive works
- local launcher chunk planning works
- worker execution and consolidation work
- checkpoint/resume works
- Drive upload works
- latest benchmark import from Drive works
- benchmark summary sheet write works
- imported allocation writeback to rows 35–38 works

Current operational reality:
- Apps Script remains the UI/controller
- Cloud Run remains compute-only
- local launcher owns long chunked benchmark runs
- imported benchmark results reuse the existing writer path rather than replacing it

## Phase 13 status — campaign benchmarking, raw run import, and benchmark winner writeback

### Phase 13A — campaign mode

Completed:
- launcher campaign mode implemented
- one campaign can run multiple trial counts across multiple repeats against one fixed exported snapshot
- campaign planning and run identity made explicit

### Phase 13B — enriched campaign reporting and nested upload

Completed:
- launcher writes `benchmark_campaign_report_v1.json`
- launcher writes local nested per-run artifacts under `runs/`
- launcher can upload campaign folders and nested run artifacts to Drive
- top-level `winner` in campaign report kept as a lean pointer
- rich per-run metrics stored in matching `runs[]` entries

Enriched per-run metrics now include:
- `invocationMode`
- `meanPoints`
- `standardDeviation`
- `range`

### Phase 13C — campaign raw-run import into benchmark sheets

Completed:
- Apps Script can read one `benchmark_campaign_report_v1.json` from Drive
- report contract validation implemented
- `runs[]` converted into one raw row per actual run
- canonical raw per-run import into `BENCHMARK_TRIALS` implemented
- grouped derived summary refresh into `BENCHMARK_SUMMARY` implemented
- latest and selected campaign import modes implemented
- append and replace write modes implemented

Current `BENCHMARK_TRIALS` raw row schema includes:
- `ImportTimestamp`
- `CampaignBatchLabel`
- `CampaignFolderName`
- `SnapshotLabel`
- `SnapshotFileSha256`
- `TrialCount`
- `RepeatIndex`
- `RunId`
- `Ok`
- `BestScore`
- `BestTrialIndex`
- `RuntimeMs`
- `RuntimeSec`
- `InvocationMode`
- `Seed`
- `RunFolderName`
- `ArtifactFileName`
- `MeanPoints`
- `StandardDeviation`
- `Range`
- `TotalScore`
- `SummaryMessage`
- `FailureMessage`

### Phase 13D — write back best imported benchmark winner

Completed:
- Apps Script can read `BENCHMARK_TRIALS` as the operational raw-run surface
- writeback no longer depends on brittle active-row UI selection
- valid imported run rows are filtered from `BENCHMARK_TRIALS`
- exactly one campaign must be in scope for writeback
- best imported winner is selected by minimum `BestScore`
- linked nested run artifact is resolved from Drive using:
  - `CampaignFolderName`
  - `RunFolderName`
  - `ArtifactFileName`
- linked `transport_trial_result_v1` artifact is validated
- best imported benchmark winner can be written to `Sheet1` rows 35–38

Important consistency fix completed during this phase:
- scorer semantics are lower-is-better
- per-run engine selection is lower-is-better
- launcher campaign winner selection was corrected so lower `bestScore` now wins end-to-end

Current operational note:
- older campaign reports generated before the score-direction fix may still contain stale top-level winner pointers
- Phase 13D does not rely on that top-level winner pointer
- it recomputes the best imported winner directly from `BENCHMARK_TRIALS` by minimum `BestScore`

## Project structure

Current source files are organized roughly as follows:

- `parser_*.js` — read and parse sheet data, doctors, calendar, requests, effects, config, debug, and issues
- `allocator_candidates.js` — build candidate pools
- `allocator_rules.js` — enforce allocation validity rules
- `allocator_greedy.js` — greedy allocation path
- `allocator_random.js` — random allocation path
- `allocator_main.js` — allocator orchestration helpers
- `scorer_main.js` — score candidate rosters
- `scorer_config.js` — resolve scorer weights from code defaults plus optional sheet overrides
- `rng_seeded.js` — seeded RNG utilities for reproducible random trials
- `engine_snapshot.js` — build and validate normalized compute snapshots
- `engine_runner.js` — headless random-trial runner and transport-result helpers
- `engine_http_config.js` — external HTTP config lookup and validation
- `engine_invoke.js` — invocation-mode wiring for local and external compute
- `writer_output.js` — write output back to Google Sheets and validate transport results before writeback
- `benchmark_trials.js` — benchmark sheet schemas, raw rows, and derived summary helpers
- `benchmark_drive_config.js` — Apps Script Drive folder/config helpers
- `benchmark_snapshot_export.js` — Apps Script snapshot export to Drive
- `benchmark_result_import.js` — Apps Script campaign/raw-result import and benchmark winner writeback helpers
- `Code.js` — top-level Apps Script entry points
- `tools/phase12_large_benchmark/` — local large-benchmark launcher and related tooling
- `worker/server.js` — external HTTP worker server
- `worker/load_pure_compute.js` — worker bootstrap for pure compute runtime
- `worker/package.json` — worker package definition
- `worker/Dockerfile` — worker container build file
- `appsscript.json` — Apps Script manifest

## Workflow

This repository is the version-controlled local source for the live Apps Script project.

Typical current workflow:
1. Edit code locally
2. Commit and push to GitHub
3. Run `clasp push` to update Google Apps Script
4. Run `clasp pull` first if the Apps Script project was changed remotely

Important notes:
- GitHub is source control
- `clasp` is the Apps Script sync path
- there is no native direct GitHub-to-Apps Script live sync
- Google Sheets + Apps Script remain the live UI/controller
- local tooling and non-Apps-Script folders must be excluded from Apps Script push via `.claspignore`

Current `.claspignore` pattern should effectively allow only root-level Apps Script source files and the manifest, so local launcher folders and `node_modules` are not pushed into Apps Script.

## Allocation model

For each date, the allocator builds candidate pools for:
- MICU Call
- MICU Standby
- MHD Call
- MHD Standby

A doctor can only enter a slot pool if they are:
- eligible for that slot
- not blocked on that day
- not blocked on the preceding day where required by rule
- not already assigned another slot on the same date
- otherwise valid under all hard constraints

## Request codes

Supported request codes include:
- `CR` — Call Request
- `NC` — No Call / Call Block
- `AL` — Annual Leave
- `TL` — Training Leave
- `SL` or `MC` — Sick Leave / Medical Leave
- `HL` — Hospitalisation Leave
- `NSL` — National Service Leave
- `OPL` — Other Planned Leave
- `EMCC` — ED PM Training
- `EXAM` — Exam day

Cells may contain multiple codes, for example:
- `NC, AL`
- `CR, EMCC`

Parser behavior is expected to:
- split and normalize tokens robustly
- support multiple codes in one cell
- combine effects logically
- flag invalid or contradictory input where useful

## Hard constraints

These must never be violated:
- no assignment to an ineligible slot
- no assignment if blocked on that day
- no assignment if blocked on the preceding day by rule
- no more than one slot per doctor per date
- ICU-only doctors cannot do HD-only roles
- HD-only doctors cannot do ICU-only roles
- ICU/HD doctors may do either, subject to all other rules
- if a required slot has no valid candidate pool, this should be reported clearly

Hard constraints override preferences and fairness scoring.

## Scoring philosophy

Among valid rosters, prefer the fairer roster.

Current priorities are:
1. global call-point balance across the full roster
2. spacing between calls
3. softer preference handling such as `CR` satisfaction

In general:
- global fairness matters more than local preference satisfaction
- soft scoring must never override hard validity rules
- lower total scorer value is better
- invalid allocations are treated as worst and should never win

## Scorer configuration

The scorer uses a sheet-driven configuration layer so non-coders can adjust weightages without editing code.

### Source of truth

Scorer weights are resolved in this order:
1. code defaults
2. optional overrides from the `SCORER_CONFIG` sheet tab

If the `SCORER_CONFIG` tab does not exist, the scorer uses code defaults.

If the `SCORER_CONFIG` tab exists, it must be valid. Invalid config is treated as an error and scoring fails clearly rather than silently falling back.

### `SCORER_CONFIG` tab

The `SCORER_CONFIG` tab is created or refreshed by running:
- `setupScorerConfigSheet()`

This tab is designed to be both machine-readable and human-readable.

Columns:
- `Key`
- `Value`
- `Description`
- `Effect`
- `Suggested Range`
- `Notes`

In normal use, non-coders should edit only the `Value` column.

### Validation behavior

The config reader validates at least:
- missing required key
- duplicate key
- unknown key
- blank value
- non-numeric value
- invalid numeric range
- invalid integer requirement where applicable

Examples:
- `MAX_SOFT_GAP_DAYS` must be an integer and at least 2
- penalties and weights not intended to be negative must remain non-negative
- core required weights such as global point balance must remain positive

### Operational fallback policy

- no `SCORER_CONFIG` tab -> use code defaults
- valid `SCORER_CONFIG` tab -> use sheet values
- invalid `SCORER_CONFIG` tab -> fail loudly and require correction

Deleting the `SCORER_CONFIG` tab reverts the system to code defaults.

### Performance note

Scorer config is resolved once per trial batch, not once per trial.
This avoids repeated sheet reads inside the hot loop and keeps runtime close to the pre-config baseline.

## Useful Apps Script functions

Useful entry points and helpers include:
- `setupScorerConfigSheet()` — create or refresh the config tab
- `debugReadResolvedScorerWeights()` — inspect the currently resolved scorer weights
- `debugRunRandomTrials()` — run allocation and scoring without writing output
- `debugTransportTrialResult()` — inspect the transport-friendly result shape
- `debugReadTrialComputeExternalHttpConfig()` — inspect external HTTP worker config
- `debugLocalDirectTransportTrialResult()` — inspect local direct transport result
- `debugSimulatedExternalTransportTrialResult()` — inspect simulated external transport result
- `debugExternalHttpTransportTrialResult()` — inspect public external HTTP transport result
- `runWriteBestRandomTrialToSheet()` — run allocation and write the best result back to the sheet
- `runWriteBestRandomTrialToSheetExternalHttp()` — run allocation via public external worker and write the best result back to the sheet

Drive/export/import helpers include:
- `debugEnsurePhase12BenchmarkDriveLayout()` — ensure Drive root and subfolders exist
- `debugExportComputeSnapshotToDrive()` — export `compute_snapshot_v2` snapshot to Drive
- `debugInspectLatestBenchmarkResultFromDrive()` — inspect latest uploaded benchmark result artifact
- `runPrintLatestBenchmarkResultSummaryToSheet()` — import latest benchmark result and print summary sheet
- `runWriteLatestBenchmarkResultToSheet()` — import latest benchmark result and write winning allocation to rows 35–38
- `debugInspectSelectedBenchmarkResultFromDrive()` — inspect selected benchmark result artifact
- `runPrintSelectedBenchmarkResultSummaryToSheet()` — print summary for selected benchmark result
- `runWriteSelectedBenchmarkResultToSheet()` — write selected benchmark result allocation to rows 35–38
- `debugGetPhase12BenchmarkImportSelection()` — inspect current selected-run Script Properties
- `setPhase12BenchmarkImportSelectedRunFolder(runFolderName)` — set selected benchmark run folder name
- `setPhase12BenchmarkImportSelectedArtifactFileName(artifactFileName)` — set selected artifact file name
- `clearPhase12BenchmarkImportSelectedRunFolder()` — clear selected run folder property
- `setPhase12BenchmarkImportLatestSelection()` — reset to latest-import mode

Phase 13 campaign helpers include:
- `debugInspectLatestBenchmarkCampaignReportFromDrive()` — inspect latest uploaded campaign report
- `runReplaceBenchmarkTrialsWithLatestCampaignReport()` — replace `BENCHMARK_TRIALS` with latest campaign raw rows and refresh summary
- `runAppendLatestBenchmarkCampaignReportToTrialsSheet()` — append latest campaign raw rows to `BENCHMARK_TRIALS` and refresh summary
- `debugInspectSelectedBenchmarkCampaignReportFromDrive()` — inspect selected campaign report
- `runReplaceBenchmarkTrialsWithSelectedCampaignReport()` — replace trials sheet from selected campaign report
- `runAppendSelectedBenchmarkCampaignReportToTrialsSheet()` — append trials sheet from selected campaign report
- `debugGetPhase13CampaignImportSelection()` — inspect current campaign import selection
- `setPhase13CampaignImportSelectedCampaignFolder(campaignFolderName)` — set selected campaign folder name
- `setPhase13CampaignImportSelectedArtifactFileName(artifactFileName)` — set selected campaign report file name
- `clearPhase13CampaignImportSelectedCampaignFolder()` — clear selected campaign folder property
- `setPhase13CampaignImportLatestSelection()` — reset to latest campaign import mode
- `debugInspectBestBenchmarkTrialsWinnerForWriteback()` — inspect the minimum-score valid imported run and its linked artifact
- `runWriteBestBenchmarkTrialsWinnerToSheet()` — write the minimum-score valid imported benchmark winner to `Sheet1` rows 35–38

## Current scaling reality

The current random-trial approach continues to improve best scores with larger trial counts.

That is operationally useful, but Apps Script runtime becomes the bottleneck once trial counts get large enough.

Current position:
- Apps Script is good enough for practical in-sheet runs
- the external compute path is operational for offloading heavy trial batches
- the external launcher path is operational for much larger chunked trial runs
- deeper brute-force search is better suited to external compute
- the current codebase has already been prepared for external execution through explicit snapshot and result contracts

## Large benchmark operational flow

Current intended large-run workflow:
1. in Apps Script, export live-sheet snapshot to Drive
2. locally, run the large-benchmark launcher against the Cloud Run worker
3. let the launcher checkpoint/resume as needed
4. upload final run or campaign artifacts to Drive
5. in Apps Script, inspect latest or selected benchmark artifacts
6. import raw campaign runs into `BENCHMARK_TRIALS`
7. review grouped results in `BENCHMARK_SUMMARY`
8. write imported best benchmark winner back to `Sheet1` rows 35–38 when desired

This preserves Google Sheets + Apps Script as the live operational front end while allowing much larger search volumes outside Apps Script runtime limits.

## Planned compute-separation direction

The migration path remains incremental, not a rewrite.

Current direction:
- Google Sheets remains the UI
- Apps Script remains the sheet-side controller/orchestrator
- Apps Script continues to read the sheet, parse input, resolve scorer config, build snapshots, validate results, and write output
- heavy random-trial computation can run locally or externally depending on invocation mode
- large chunked benchmarking can run through the launcher path
- the compute engine remains reusable pure JavaScript with minimal or no `SpreadsheetApp` dependency in the hot path
- future cloud execution can continue to build on the current Cloud Run-based external worker path

This is now a working incremental migration, not just a future concept.

## Repository and deployment notes

- this repository tracks the local source of the Apps Script project and related worker/local-tooling files
- `.claspignore` must exclude non-Apps-Script folders from Apps Script push
- the live spreadsheet and Apps Script deployment are managed separately
- the external worker is deployed separately from Apps Script
- local launcher OAuth tokens and local environment files are not part of Apps Script
- no open-source license is granted at this time
- this project should be reviewed and validated before real operational use

## Near-term priorities

Planned next improvements include:
- clearer reporting of allocation failures and trial outcomes
- further scorer tuning based on operational feedback
- practical optimization of external compute trial volumes
- optional operational cleanup around non-blocking routes such as `/healthz`
- clearer post-campaign operational reporting now that raw import and winner writeback are working
- keeping migration steps incremental and compatible with the current GitHub + clasp workflow
