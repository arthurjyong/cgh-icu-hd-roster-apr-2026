# CGH ICU/HD Roster Allocator (Apr 2026)

Apps Script source code for a Google Sheets–based ICU/HD MO call roster allocator.

## Status

This is an active working project for building and refining a monthly roster allocator.
It is intended to be transparent, reviewable, and incrementally improved.

## Purpose

This project generates a monthly call roster for:
- MICU Call
- MICU Standby
- MHD Call
- MHD Standby

It is designed to:
- read request codes from Google Sheets
- apply eligibility and blocking rules
- generate valid candidate rosters
- score rosters for fairness
- write the best roster back to the sheet

## Design goals

The allocator should:
- respect eligibility groups
- respect leave / no-call / training constraints
- generate only valid assignments
- prioritize global fairness across the full roster
- remain understandable, auditable, and maintainable

## Project structure

- `parser_*.js` — read sheet data and parse doctors, calendar, requests, and rule effects
- `allocator_*.js` — build candidate pools and generate valid allocations
- `scorer_main.js` — score candidate rosters
- `scorer_config.js` — resolve scorer weights from code defaults plus optional sheet overrides
- `writer_output.js` — write output back to Google Sheets
- `Code.js` — top-level Apps Script entry points
- `appsscript.json` — Apps Script manifest

## Workflow

This repository is the local source-control copy of the Apps Script project.

Typical workflow:
1. Edit code locally
2. Commit and push to GitHub
3. Run `clasp push` to update Google Apps Script
4. Run `clasp pull` first if the Apps Script project was changed remotely

## Scorer configuration

The scorer uses a sheet-driven configuration layer so non-coders can adjust weightages without editing code.

### Source of truth

Scorer weights are resolved in this order:
1. Code defaults in `scorer_main.js`
2. Optional overrides from the `SCORER_CONFIG` sheet tab

If the `SCORER_CONFIG` tab does not exist, the scorer uses code defaults.

If the `SCORER_CONFIG` tab exists, it must be valid. Invalid config is treated as an error and scoring will fail clearly rather than silently falling back.

### SCORER_CONFIG tab

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
- `MAX_SOFT_GAP_DAYS` must be an integer and must be at least 2
- penalties and weights that are not intended to be negative must be non-negative
- core required weights such as global point balance must remain positive

### Operational fallback policy

- No `SCORER_CONFIG` tab -> use code defaults
- Valid `SCORER_CONFIG` tab -> use sheet values
- Invalid `SCORER_CONFIG` tab -> fail loudly and require correction

Deleting the `SCORER_CONFIG` tab reverts the system to code defaults.

### Debug helpers

Useful Apps Script functions:
- `setupScorerConfigSheet()` — create or refresh the config tab
- `debugReadResolvedScorerWeights()` — inspect the currently resolved scorer weights
- `debugRunRandomTrials()` — run trial allocation and scoring without writing output
- `runWriteBestRandomTrialToSheet()` — run allocation and write the best result back to the sheet

### Performance note

Scorer config is resolved once per trial batch, not once per trial.
This avoids repeated sheet reads inside the hot loop and keeps runtime close to the pre-config baseline.

## Notes

- This repository contains local Apps Script source files only.
- `.clasp.json` is intentionally not committed.
- The live spreadsheet and Apps Script deployment are managed separately.
- This repository is shared publicly for review and discussion.
- No open-source license is granted at this time.
- This project should be reviewed and validated before any real operational use.

## Future direction

Planned improvements include:
- clearer reporting of allocation failures
- better transparency for non-coder reviewers
- further scorer tuning based on operational feedback
- possible additional sheet-driven configuration where safe and justified