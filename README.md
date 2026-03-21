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

## Notes

- This repository contains local Apps Script source files only.
- `.clasp.json` is intentionally not committed.
- The live spreadsheet and Apps Script deployment are managed separately.
- This repository is shared publicly for review and discussion.
- No open-source license is granted at this time.
- This project should be reviewed and validated before any real operational use.

## Future direction

Planned improvements include:
- stronger fairness scoring
- clearer reporting of allocation failures
- configurable scorer weights from the Google Sheet
- better transparency for non-coder reviewers
