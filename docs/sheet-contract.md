# Sheet contract (checkpoint: current implementation)

This contract is derived from parser/writeback code and current benchmark modules.

## 1) Primary roster sheet (`Sheet1`)

Configured in `parser_config.js`:

- Date header: `B1:AC1`
- Weekday header: `B2:AC2`

Doctor name blocks:
- ICU-only names: `A4:A11`
- ICU/HD names: `A14:A20`
- HD-only names: `A23:A30`

Request grids:
- ICU-only requests: `B4:AC11`
- ICU/HD requests: `B14:AC20`
- HD-only requests: `B23:AC30`

Call points:
- MICU points: `B32:AC32`
- MHD points: `B33:AC33`

Writeback output rows:
- `MICU_CALL` → row `35`
- `MICU_STANDBY` → row `36`
- `MHD_CALL` → row `37`
- `MHD_STANDBY` → row `38`

Writeback starts at column `B`, one cell per day.

## 2) Doctor section semantics

Sections define eligibility:

- `ICU_ONLY`: MICU call/standby slots only
- `ICU_HD`: all four slots
- `HD_ONLY`: MHD call/standby slots only

Doctor identity is internally keyed by generated `doctorId` based on section + source row.

## 3) Request code contract

Allowed codes:
- `CR`, `NC`, `AL`, `TL`, `SL`, `MC`, `HL`, `NSL`, `OPL`, `EMCC`, `EXAM`

Behavior:
- unknown tokens are parse errors;
- duplicate codes are warnings;
- hard-block codes remove same-day eligibility;
- `CR` is a soft preference signal;
- leave/training-style codes trigger previous-day soft-penalty marking.

## 4) Structural validation expectations

Parser checks include:
- sheet exists;
- date/weekday/points widths align;
- request grid widths align with date count;
- date header values are valid and non-duplicate;
- point values are numeric;
- doctor names are present and unique.

Parse failures remain in `issues` and propagate via `ok`/summary fields.

## 5) Benchmark/control sheet surfaces

Known operational tabs and their roles:

- `SCORER_CONFIG`
  - scorer weights/config source;
  - benchmark UI control panel/status fields.
- `SEARCH_LOG`
  - imported run-level benchmark rows.
- `SEARCH_PROGRESS`
  - operator-facing progress/status projection.

## 6) Important practical notes

- Contract assumes month layout fits the configured width (`B:AC`).
- Writeback uses names (`fullName`) from allocation records.
- Any schema/layout drift in these ranges can surface as parser structure errors.
