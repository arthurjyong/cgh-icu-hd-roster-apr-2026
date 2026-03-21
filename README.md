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

The system is usable in Google Sheets today, but very large random-trial counts are increasingly limited by Apps Script runtime.

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

Google Sheets is the user-facing control panel.

Apps Script currently handles:
- reading live sheet data
- parsing doctors, dates, requests, and rule effects
- resolving scorer configuration from code defaults plus optional sheet overrides
- building a normalized compute snapshot
- invoking headless compute locally inside Apps Script today
- validating transport-friendly trial results before sheet writeback
- writing the best result back to the sheet

Headless compute currently handles:
- consuming the normalized compute snapshot
- building candidate pools
- running repeated random trials
- scoring trials
- returning the best result

The codebase is intentionally structured in layers so the heavy allocation/scoring path can later be executed outside Apps Script without redesigning roster rules or moving sheet read/write into the compute engine.

## Current compute contracts

The current contract boundary is already explicit.

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

This is the leaner result shape intended for future external handoff.

Current intent:
- future external request boundary = `compute_snapshot_v2`
- future external response boundary = `transport_trial_result_v1`

Current operational note:
- sheet writeback still requires `bestAllocation` to be included in the transport result
- this is intentional for now to preserve the existing writer and keep diffs small

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
- `writer_output.js` — write output back to Google Sheets and validate transport results before writeback
- `benchmark_trials.js` — benchmark repeated trial counts
- `Code.js` — top-level Apps Script entry points
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
- Google Sheets + Apps Script remain the live UI/controller unless explicitly changed

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
- `runWriteBestRandomTrialToSheet()` — run allocation and write the best result back to the sheet

## Current scaling reality

The current random-trial approach continues to improve best scores with larger trial counts.

That is operationally useful, but Apps Script runtime becomes the bottleneck once trial counts get large enough.

So the current position is:
- Apps Script is good enough for practical in-sheet runs
- deeper brute-force search likely needs external batch compute
- the current codebase is already being prepared for future external execution through explicit snapshot and result contracts

## Planned compute-separation direction

The intended migration path is incremental, not a rewrite.

Likely direction:
- Google Sheets remains the UI
- Apps Script remains the sheet-side controller/orchestrator
- Apps Script continues to read the sheet, parse input, resolve scorer config, build snapshots, validate results, and write output
- heavy random-trial computation moves to a headless worker only when needed
- the compute engine remains reusable pure JavaScript with minimal or no `SpreadsheetApp` dependency in the hot path
- future cloud execution may use a batch-worker pattern such as Cloud Run Jobs

This is a planned direction, not yet a full migration.

## Repository and deployment notes

- this repository currently tracks the local source of the Apps Script project
- `.clasp.json` is intentionally not committed
- the live spreadsheet and Apps Script deployment are managed separately
- this repository may later also include shared pure-compute code and external worker code
- no open-source license is granted at this time
- this project should be reviewed and validated before real operational use

## Near-term priorities

Planned next improvements include:
- tighter local validation of the future external request/response seam
- clearer reporting of allocation failures and trial outcomes
- further scorer tuning based on operational feedback
- optional external batch compute for very large trial counts
- keeping migration steps incremental and compatible with the current GitHub + clasp workflow