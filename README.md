# CGH ICU/HD Roster Allocator (Apr 2026)

Apps Script source code for a Google Sheets based ICU/HD MO call roster allocator.

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

## Project structure

- `parser_*.js` — read sheet data and parse doctors, calendar, requests, and rule effects
- `allocator_*.js` — build candidate pools and generate valid allocations
- `scorer_main.js` — score candidate rosters
- `writer_output.js` — write output back to Google Sheets
- `Code.js` — top-level Apps Script entry points
- `appsscript.json` — Apps Script manifest

## Notes

- This repository contains the local Apps Script source files only.
- `.clasp.json` is intentionally not committed.
- The live spreadsheet and Apps Script deployment are managed separately.

