# Roster Monster v2 Blueprint

## 1. Project definition
Roster Monster v2 is a planning and execution architecture for roster allocation that combines:
- a reusable allocation core,
- department-specific templates,
- and Google Sheets as the operational front end.

It is for internal builders/operators creating and maintaining roster workflows for clinical departments, beginning with CGH ICU/HD.

It solves the problem of producing valid, explainable, repeatable rosters from spreadsheet inputs while keeping departmental rules explicit and maintainable.

What it is not:
- not a universal self-serve builder for any department,
- not a “one template fits all” product,
- not “ICU/HD only forever,” but ICU/HD is the first implementation, not the entire product.

**Core framing:**
- **Roster Monster v2 = reusable allocation core + department-specific templates + Google Sheets front end.**
- **CGH ICU/HD = first department implementation.**

## 2. Why v2 exists
v2 exists because v1 has structural limits that now block reliable scaling and ownership:
- Parser is too rigid and brittle to layout/rule variation.
- Search/solver quality is not good enough for consistent outcomes.
- Worker/cloud execution path is too brittle operationally.
- Debugging and re-examination are too difficult and slow.
- Boundaries between modules are not clean enough.
- v1 contains too much rushed AI-generated glue with insufficient human-owned architecture.

## 3. Goals
### Functional goals
- Generate valid rosters that obey hard constraints.
- Support reuse across departments via templates.
- Preserve an operationally familiar Sheets-based workflow.

### Engineering goals
- Clear module boundaries and explicit contracts.
- Deterministic/reproducible runs with seed control.
- Safer writeback and stronger failure handling.

### Operational goals
- Better observability of progress, score, and failures.
- Easier troubleshooting via artifacts and structured logs.
- Practical local + cloud execution with parity.

## 4. Non-goals
v2 is not:
- a universal self-serve builder,
- a real-time live scheduling system,
- a day-1 solution for every department,
- a replacement for Google Sheets as the main UI.

## 5. Core invariants
These must never be violated:
- Hard constraints override everything.
- “Blocked” means blocked.
- One doctor cannot hold more than one slot on the same date.
- Invalid candidates must never be assigned.
- Lower score is better (within valid rosters).
- If no valid candidate exists, the system must report it clearly (not silently degrade).

## 6. Product model
v2 uses a layered model:
- **Department Template** captures department-specific policy and mapping.
- **Sheet Adapter** handles Google Sheets I/O only.
- **Core Engine** parses/normalizes, validates, searches, and scores.
- **Support layers** handle writing outputs, execution modes, and observability.

The model is intentionally modular so ICU/HD can be first while enabling controlled reuse for future departments.

## 7. Boundary definitions
### 1) Department Template layer
**Responsibilities**
- Define slot types, doctor groups, eligibility mapping.
- Define request codes, blocking and preceding-day rules.
- Define sheet layout mapping, output mapping, and scoring knobs.

**Must not do**
- Must not perform sheet reads/writes.
- Must not run search logic.

**Inputs / outputs**
- Input: department policy intent.
- Output: machine-readable template config used by downstream layers.

### 2) Sheet Adapter layer
**Responsibilities**
- Read required ranges/metadata from Google Sheets.
- Write approved results/status back to Google Sheets.

**Must not do**
- Must not embed department rule logic.
- Must not decide candidate validity.

**Inputs / outputs**
- Input: sheet IDs/ranges + writeback payloads.
- Output: raw sheet snapshot and writeback operations.

### 3) Parser + Normalizer layer
**Responsibilities**
- Convert raw sheet snapshot + template into a normalized internal model.
- Emit explicit parse/normalization issues.

**Must not do**
- Must not run optimization/search.
- Must not silently coerce ambiguous invalid data.

**Inputs / outputs**
- Input: raw sheet snapshot + department template.
- Output: normalized domain model + issue list.

### 4) Rule Engine layer
**Responsibilities**
- Be the single source of truth for hard validity checks.
- Evaluate candidate/date/slot feasibility deterministically.

**Must not do**
- Must not rank preferences or optimize score.

**Inputs / outputs**
- Input: normalized model + partial/full assignment state.
- Output: valid/invalid decisions with machine-readable reasons.

### 5) Solver / Search layer
**Responsibilities**
- Explore candidate assignments to find valid rosters.
- Use strategy/heuristics while preserving hard validity.

**Must not do**
- Must not override hard-rule outcomes.
- Must not own writeback or logging transport concerns.

**Inputs / outputs**
- Input: normalized model + rule engine API + seed/strategy settings.
- Output: candidate valid roster set (or explicit no-solution result).

### 6) Scorer layer
**Responsibilities**
- Score and rank valid rosters only.
- Apply template-defined scoring knobs consistently.

**Must not do**
- Must not validate hard constraints (delegated to rule engine).
- Must not mutate roster feasibility.

**Inputs / outputs**
- Input: valid roster candidates + scoring config.
- Output: scored/ranked roster results.

### 7) Writer / Result layer
**Responsibilities**
- Convert chosen solution into output artifacts and writeback-ready payloads.
- Preserve traceability from result to source snapshot/run.

**Must not do**
- Must not recalculate validity or run search.

**Inputs / outputs**
- Input: selected scored solution + metadata.
- Output: roster artifact bundle + writeback contract payload.

### 8) Execution / Worker layer
**Responsibilities**
- Run orchestration in local and external worker/cloud modes.
- Handle transport, retries, chunking, and runtime envelopes.

**Must not do**
- Must not implement domain rules.

**Inputs / outputs**
- Input: run request + snapshot pointer/config.
- Output: execution status + produced artifacts/results.

### 9) Observability layer
**Responsibilities**
- Emit structured logs/events/metrics for each run.
- Track progress, failures, score distribution, and performance.

**Must not do**
- Must not alter solver decisions.

**Inputs / outputs**
- Input: runtime events across layers.
- Output: queryable telemetry and incident/debug traces.

## 8. Contracts that must exist
The architecture requires explicit contracts (to be separately specified):
- Department template contract.
- Normalized domain model contract.
- Snapshot/input contract.
- Result/output contract.
- Log/event contract.
- Writeback contract.

This blueprint establishes these as mandatory artifacts, not fully defined schemas.

## 9. Features to retain from v1
Keep and formalize proven concepts:
- Google Sheets as front end.
- Snapshot-driven compute.
- Explicit scorer stage.
- Benchmarking concept.
- Artifact-based debugging.
- External worker execution option.
- Seed-based reproducibility.

## 10. Features to redesign
Likely redesign targets:
- Parser architecture.
- Normalization and issue reporting.
- Search strategy and quality/performance trade-offs.
- Worker/cloud hardening.
- Observability depth and consistency.
- Writeback safety model.
- Repo/module structure and ownership boundaries.

## 11. Execution modes
Intended run modes:
- **Local mode** for developer iteration and diagnosis.
- **External worker/cloud mode** for scalable/non-local execution.
- **Benchmark campaign mode** for controlled comparative runs.

## 12. Observability philosophy
Observability is first-class, not an afterthought.
- Structured JSON logs as default.
- Stable identifiers: `runId`, `campaignId`, `chunkIndex`.
- Progress visibility across long-running jobs.
- Score and quality metrics for result evaluation.
- Failure taxonomy for triage and trend analysis.
- Artifact trail linking inputs, execution, and outputs.

## 13. Validation philosophy
v2 should be proven with layered validation, not single-point testing:
- Parser fixtures covering known layout variants.
- Edge-case snapshots for difficult real scenarios.
- Rule validation against explicit invariants.
- Scorer consistency checks.
- Reproducibility checks using fixed seeds.
- Local vs cloud parity checks.
- Shadow comparison against v1 on selected historical cases.

## 14. Build order
Planned implementation sequence:
1. Docs.
2. Contracts.
3. Parser/normalizer.
4. Rule engine.
5. Scorer.
6. Solver.
7. Local execution.
8. Writer/artifacts.
9. Cloud worker.
10. Sheet integration.
11. Observability hardening.

## 15. Migration strategy
- Keep v1 live during development.
- Build v2 in parallel.
- Use ICU/HD template as the first proof case.
- Avoid early cutover; migrate only after validation confidence is sufficient.

## 16. Open design questions
Unresolved items for focused follow-up:
- How flexible should department templates be in first release?
- What exact normalized domain model shape should be adopted?
- What first search strategy should v2 standardize on?
- How much of current ICU sheet format should be preserved vs simplified?

## 17. Assumptions / scope limits
Current planning assumptions:
- Current ICU sheet is the initial reference point.
- Future ICU/HD templates will likely remain highly similar (mostly dates/doctors updates).
- Department onboarding remains curated/customized, not self-serve.
- v2 architecture should optimize clarity and reliability before broader generalization.
