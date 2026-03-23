function getBenchmarkTrialsSheetName_() {
  return "BENCHMARK_TRIALS";
}

function getBenchmarkSummarySheetName_() {
  return "BENCHMARK_SUMMARY";
}

function getBenchmarkTrialsHeader_() {
  return [
    "ImportTimestamp",
    "CampaignBatchLabel",
    "CampaignFolderName",
    "SnapshotLabel",
    "SnapshotFileSha256",
    "TrialCount",
    "RepeatIndex",
    "RunId", // Globally unique for new campaign runs; legacy rows may still contain pre-Phase-2 values.
    "Ok",
    "BestScore",
    "BestTrialIndex",
    "RuntimeMs",
    "RuntimeSec",
    "InvocationMode",
    "Seed",
    "RunFolderName",
    "ArtifactFileName",
    "ScorerFingerprint",
    "ScorerFingerprintShort",
    "ScorerFingerprintVersion",
    "ScorerSource",
    "MeanPoints",
    "StandardDeviation",
    "Range",
    "TotalScore",
    "PointBalanceGlobal",
    "PointBalanceWithinSection",
    "SpacingPenalty",
    "CrReward",
    "DualEligibleIcuBonus",
    "StandbyAdjacencyPenalty",
    "StandbyCountFairnessPenalty",
    "PreLeavePenalty",
    "UnfilledPenalty",
    "SummaryMessage",
    "FailureMessage"
  ];
}

function getLegacyBenchmarkTrialsHeader_() {
  return [
    "ImportTimestamp",
    "CampaignBatchLabel",
    "CampaignFolderName",
    "SnapshotLabel",
    "SnapshotFileSha256",
    "TrialCount",
    "RepeatIndex",
    "RunId",
    "Ok",
    "BestScore",
    "BestTrialIndex",
    "RuntimeMs",
    "RuntimeSec",
    "InvocationMode",
    "Seed",
    "RunFolderName",
    "ArtifactFileName",
    "MeanPoints",
    "StandardDeviation",
    "Range",
    "TotalScore",
    "SummaryMessage",
    "FailureMessage"
  ];
}

function getPhase2BenchmarkTrialsHeader_() {
  return [
    "ImportTimestamp",
    "CampaignBatchLabel",
    "CampaignFolderName",
    "SnapshotLabel",
    "SnapshotFileSha256",
    "TrialCount",
    "RepeatIndex",
    "RunId",
    "Ok",
    "BestScore",
    "BestTrialIndex",
    "RuntimeMs",
    "RuntimeSec",
    "InvocationMode",
    "Seed",
    "RunFolderName",
    "ArtifactFileName",
    "MeanPoints",
    "StandardDeviation",
    "Range",
    "TotalScore",
    "PointBalanceGlobal",
    "PointBalanceWithinSection",
    "SpacingPenalty",
    "CrReward",
    "DualEligibleIcuBonus",
    "StandbyAdjacencyPenalty",
    "StandbyCountFairnessPenalty",
    "PreLeavePenalty",
    "UnfilledPenalty",
    "SummaryMessage",
    "FailureMessage"
  ];
}

function getBenchmarkSummaryHeader_() {
  return [
    "BatchLabel",
    "TrialCount",
    "RunCount",
    "MinBestScore",
    "P25BestScore",
    "MedianBestScore",
    "AverageBestScore",
    "P75BestScore",
    "MaxBestScore",
    "ScoreStdDev",
    "AverageRuntimeSec",
    "MinRuntimeSec",
    "MaxRuntimeSec"
  ];
}

function getBenchmarkTrialsColumnMap_() {
  const header = getBenchmarkTrialsHeader_();
  const columnMap = {};

  for (let i = 0; i < header.length; i++) {
    columnMap[header[i]] = i;
  }

  return columnMap;
}

function buildBenchmarkTrialsRowFromObject_(rowObject) {
  const header = getBenchmarkTrialsHeader_();
  const normalized = rowObject || {};

  return header.map(function(columnName) {
    if (!Object.prototype.hasOwnProperty.call(normalized, columnName)) {
      return "";
    }
    return normalized[columnName];
  });
}

function buildHeaderIndexMapFromRow_(headerRow) {
  const map = {};
  const row = Array.isArray(headerRow) ? headerRow : [];

  for (let i = 0; i < row.length; i++) {
    const key = String(row[i] === null || row[i] === undefined ? "" : row[i]).trim();
    if (key) {
      map[key] = i;
    }
  }

  return map;
}

function headerRowsMatchExactly_(actualHeader, expectedHeader) {
  const actual = Array.isArray(actualHeader) ? actualHeader : [];
  const expected = Array.isArray(expectedHeader) ? expectedHeader : [];

  if (actual.length < expected.length) {
    return false;
  }

  for (let i = 0; i < expected.length; i++) {
    const actualValue = String(actual[i] === null || actual[i] === undefined ? "" : actual[i]).trim();
    if (actualValue !== expected[i]) {
      return false;
    }
  }

  for (let j = expected.length; j < actual.length; j++) {
    const trailingValue = String(actual[j] === null || actual[j] === undefined ? "" : actual[j]).trim();
    if (trailingValue) {
      return false;
    }
  }

  return true;
}

function ensureBenchmarkSheet_(sheetName, headerRow) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold");
  }

  return sheet;
}

function ensureBenchmarkTrialsSheet_() {
  return ensureBenchmarkSheet_(getBenchmarkTrialsSheetName_(), getBenchmarkTrialsHeader_());
}

function ensureBenchmarkSummarySheet_() {
  return ensureBenchmarkSheet_(getBenchmarkSummarySheetName_(), getBenchmarkSummaryHeader_());
}


function writeBenchmarkSheetHeaderRow_(sheet, headerRow) {
  if (!sheet) {
    throw new Error("sheet is required.");
  }

  if (!headerRow || headerRow.length === 0) {
    throw new Error("headerRow is required.");
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold");
}

function migrateLegacyBenchmarkTrialsSheetForAppend_(sheet) {
  if (!sheet) {
    throw new Error("sheet is required.");
  }

  const expectedHeader = getBenchmarkTrialsHeader_();
  const legacyHeader = getLegacyBenchmarkTrialsHeader_();
  const phase2Header = getPhase2BenchmarkTrialsHeader_();
  const lastRow = sheet.getLastRow();
  const actualHeader = sheet.getRange(1, 1, 1, expectedHeader.length).getValues()[0];

  if (headerRowsMatchExactly_(actualHeader, expectedHeader)) {
    return;
  }

  let sourceHeader = null;

  if (headerRowsMatchExactly_(actualHeader, phase2Header)) {
    sourceHeader = phase2Header;
  } else if (headerRowsMatchExactly_(actualHeader, legacyHeader)) {
    sourceHeader = legacyHeader;
  }

  if (!sourceHeader) {
    throw new Error(
      "BENCHMARK_TRIALS header does not match the current schema or the supported legacy schema. " +
      "Run resetBenchmarkSheets() or a REPLACE campaign import before APPEND."
    );
  }

  const migratedRows = [];
  const dataRowCount = Math.max(0, lastRow - 1);
  const legacyHeaderMap = buildHeaderIndexMapFromRow_(sourceHeader);
  const addedColumnCount = expectedHeader.length - sourceHeader.length;

  if (dataRowCount > 0) {
    const addedColumnValues = addedColumnCount > 0
      ? sheet.getRange(2, sourceHeader.length + 1, dataRowCount, addedColumnCount).getValues()
      : [];

    for (let rowIndex = 0; rowIndex < addedColumnValues.length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < addedColumnValues[rowIndex].length; columnIndex++) {
        const cellValue = addedColumnValues[rowIndex][columnIndex];
        if (cellValue !== "" && cellValue !== null) {
          throw new Error(
            "BENCHMARK_TRIALS contains populated columns beyond the supported legacy header width. " +
            "Run resetBenchmarkSheets() or a REPLACE campaign import before APPEND."
          );
        }
      }
    }

    const legacyRows = sheet.getRange(2, 1, dataRowCount, sourceHeader.length).getValues();
    for (let i = 0; i < legacyRows.length; i++) {
      const legacyRow = legacyRows[i];
      migratedRows.push(expectedHeader.map(function(columnName) {
        const legacyIndex = legacyHeaderMap[columnName];
        return typeof legacyIndex === "number" ? legacyRow[legacyIndex] : "";
      }));
    }
  }

  writeBenchmarkSheetHeaderRow_(sheet, expectedHeader);

  if (migratedRows.length > 0) {
    sheet.getRange(2, 1, migratedRows.length, expectedHeader.length).setValues(migratedRows);
  }
}


function resetBenchmarkSheets() {
  const trialsSheet = ensureBenchmarkTrialsSheet_();
  const summarySheet = ensureBenchmarkSummarySheet_();

  trialsSheet.clearContents();
  summarySheet.clearContents();

  const trialsHeader = getBenchmarkTrialsHeader_();
  const summaryHeader = getBenchmarkSummaryHeader_();

  trialsSheet.getRange(1, 1, 1, trialsHeader.length).setValues([trialsHeader]);
  summarySheet.getRange(1, 1, 1, summaryHeader.length).setValues([summaryHeader]);

  trialsSheet.setFrozenRows(1);
  summarySheet.setFrozenRows(1);

  trialsSheet.getRange(1, 1, 1, trialsHeader.length).setFontWeight("bold");
  summarySheet.getRange(1, 1, 1, summaryHeader.length).setFontWeight("bold");

  Logger.log("Benchmark sheets reset.");
}

function appendBenchmarkRows_(rows) {
  if (!rows || rows.length === 0) return;

  const sheet = ensureBenchmarkTrialsSheet_();
  migrateLegacyBenchmarkTrialsSheetForAppend_(sheet);
  const startRow = sheet.getLastRow() + 1;
  const columnCount = getBenchmarkTrialsHeader_().length;

  sheet.getRange(startRow, 1, rows.length, columnCount).setValues(rows);
}

function safeComponentScore_(bestScoring, componentKey) {
  if (!bestScoring || !bestScoring.components || !bestScoring.components[componentKey]) {
    return "";
  }

  const component = bestScoring.components[componentKey];
  return typeof component.score === "number" ? component.score : "";
}

function buildBenchmarkRow_(batchLabel, trialCount, repeatIndex, runtimeMs, trialResult) {
  const timestamp = new Date();
  const bestScoring = trialResult && trialResult.bestScoring ? trialResult.bestScoring : null;
  const ok = !!(trialResult && trialResult.ok === true);
  const bestScore = ok && typeof trialResult.bestScore === "number" ? trialResult.bestScore : "";
  const runtimeMsValue = typeof runtimeMs === "number" ? runtimeMs : "";
  const runtimeSecValue = typeof runtimeMsValue === "number" ? runtimeMsValue / 1000 : "";
  const failureMessage = ok
    ? ""
    : (trialResult && trialResult.message ? trialResult.message : "Unknown failure");

  return buildBenchmarkTrialsRowFromObject_({
    ImportTimestamp: timestamp,
    CampaignBatchLabel: batchLabel || "",
    CampaignFolderName: "",
    SnapshotLabel: "",
    SnapshotFileSha256: "",
    TrialCount: trialCount,
    RepeatIndex: repeatIndex,
    RunId: "",
    Ok: ok,
    BestScore: bestScore,
    BestTrialIndex: "",
    RuntimeMs: runtimeMsValue,
    RuntimeSec: runtimeSecValue,
    InvocationMode: "LOCAL_DIRECT",
    Seed: "",
    RunFolderName: "",
    ArtifactFileName: "",
    ScorerFingerprint: safeScorerFingerprintFieldFromObjects_("scorerFingerprint", bestScoring, null, null),
    ScorerFingerprintShort: safeScorerFingerprintFieldFromObjects_("scorerFingerprintShort", bestScoring, null, null),
    ScorerFingerprintVersion: safeScorerFingerprintFieldFromObjects_("scorerFingerprintVersion", bestScoring, null, null),
    ScorerSource: safeScorerConfigSourceFromBestScoring_(bestScoring),
    MeanPoints: bestScoring && typeof bestScoring.meanPoints === "number" ? bestScoring.meanPoints : "",
    StandardDeviation: bestScoring && typeof bestScoring.standardDeviation === "number" ? bestScoring.standardDeviation : "",
    Range: bestScoring && typeof bestScoring.range === "number" ? bestScoring.range : "",
    TotalScore: bestScore,
    PointBalanceGlobal: safeComponentScore_(bestScoring, "pointBalanceGlobal"),
    PointBalanceWithinSection: safeComponentScore_(bestScoring, "pointBalanceWithinSection"),
    SpacingPenalty: safeComponentScore_(bestScoring, "spacingPenalty"),
    CrReward: safeComponentScore_(bestScoring, "crReward"),
    DualEligibleIcuBonus: safeComponentScore_(bestScoring, "dualEligibleIcuBonus"),
    StandbyAdjacencyPenalty: safeComponentScore_(bestScoring, "standbyAdjacencyPenalty"),
    StandbyCountFairnessPenalty: safeComponentScore_(bestScoring, "standbyCountFairnessPenalty"),
    PreLeavePenalty: safeComponentScore_(bestScoring, "preLeavePenalty"),
    UnfilledPenalty: safeComponentScore_(bestScoring, "unfilledPenalty"),
    SummaryMessage: ok ? "" : "",
    FailureMessage: failureMessage
  });
}

function sortNumberListAscending_(values) {
  return values.slice().sort(function(a, b) {
    return a - b;
  });
}

function computeAverage_(values) {
  if (!values || values.length === 0) return "";
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

function computeMedian_(values) {
  if (!values || values.length === 0) return "";
  const sorted = sortNumberListAscending_(values);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }

  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function computePercentile_(values, percentile) {
  if (!values || values.length === 0) return "";
  const sorted = sortNumberListAscending_(values);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computeStandardDeviation_(values) {
  if (!values || values.length === 0) return "";
  const mean = computeAverage_(values);
  let sumSquaredDeviation = 0;

  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    sumSquaredDeviation += diff * diff;
  }

  return Math.sqrt(sumSquaredDeviation / values.length);
}

function buildBenchmarkSummaryRows_() {
  const trialsSheet = ensureBenchmarkTrialsSheet_();
  const lastRow = trialsSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const data = trialsSheet.getRange(2, 1, lastRow - 1, getBenchmarkTrialsHeader_().length).getValues();
  const groups = {};
  const col = getBenchmarkTrialsColumnMap_();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const batchLabel = row[col.CampaignBatchLabel];
    const trialCount = row[col.TrialCount];
    const ok = row[col.Ok];
    const bestScore = row[col.BestScore];
    const runtimeSec = row[col.RuntimeSec];

    if (!ok || typeof bestScore !== "number") {
      continue;
    }

    const key = String(batchLabel) + "||" + String(trialCount);
    if (!groups[key]) {
      groups[key] = {
        batchLabel: batchLabel,
        trialCount: trialCount,
        scores: [],
        runtimes: []
      };
    }

    groups[key].scores.push(bestScore);
    if (typeof runtimeSec === "number") {
      groups[key].runtimes.push(runtimeSec);
    }
  }

  const keys = Object.keys(groups);
  keys.sort(function(a, b) {
    const aGroup = groups[a];
    const bGroup = groups[b];

    if (aGroup.batchLabel !== bGroup.batchLabel) {
      return String(aGroup.batchLabel).localeCompare(String(bGroup.batchLabel));
    }

    return Number(aGroup.trialCount) - Number(bGroup.trialCount);
  });

  const summaryRows = [];

  for (let i = 0; i < keys.length; i++) {
    const group = groups[keys[i]];
    const sortedScores = sortNumberListAscending_(group.scores);
    const sortedRuntimes = sortNumberListAscending_(group.runtimes);

    summaryRows.push([
      group.batchLabel,
      group.trialCount,
      group.scores.length,
      sortedScores.length ? sortedScores[0] : "",
      computePercentile_(sortedScores, 0.25),
      computeMedian_(sortedScores),
      computeAverage_(sortedScores),
      computePercentile_(sortedScores, 0.75),
      sortedScores.length ? sortedScores[sortedScores.length - 1] : "",
      computeStandardDeviation_(sortedScores),
      computeAverage_(sortedRuntimes),
      sortedRuntimes.length ? sortedRuntimes[0] : "",
      sortedRuntimes.length ? sortedRuntimes[sortedRuntimes.length - 1] : ""
    ]);
  }

  return summaryRows;
}

function refreshBenchmarkSummarySheet() {
  const summarySheet = ensureBenchmarkSummarySheet_();
  const header = getBenchmarkSummaryHeader_();
  const rows = buildBenchmarkSummaryRows_();

  summarySheet.clearContents();
  summarySheet.getRange(1, 1, 1, header.length).setValues([header]);
  summarySheet.setFrozenRows(1);
  summarySheet.getRange(1, 1, 1, header.length).setFontWeight("bold");

  if (rows.length > 0) {
    summarySheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  Logger.log(JSON.stringify({
    ok: true,
    summaryRowCount: rows.length,
    sheetName: getBenchmarkSummarySheetName_()
  }, null, 2));
}

function benchmarkTrialCounts_(trialCounts, repeats, batchLabel) {
  if (!trialCounts || trialCounts.length === 0) {
    throw new Error("trialCounts is required.");
  }

  if (!repeats || repeats < 1) {
    throw new Error("repeats must be at least 1.");
  }

  const label = batchLabel || "BENCH";

  for (let i = 0; i < trialCounts.length; i++) {
    const trialCount = trialCounts[i];

    for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex++) {
      const startedAt = Date.now();
      const trialResult = runRandomTrials_(trialCount);
      const runtimeMs = Date.now() - startedAt;

      const row = buildBenchmarkRow_(label, trialCount, repeatIndex, runtimeMs, trialResult);
      appendBenchmarkRows_([row]);

      Logger.log(JSON.stringify({
        batchLabel: label,
        trialCount: trialCount,
        repeatIndex: repeatIndex,
        ok: trialResult.ok === true,
        bestScore: trialResult.ok ? trialResult.bestScore : null,
        runtimeMs: runtimeMs,
        message: trialResult.ok ? "" : (trialResult.message || "Unknown failure")
      }, null, 2));
    }

    // Refresh summary after each trial-count block, not only at the very end.
    refreshBenchmarkSummarySheet();
  }

  Logger.log(JSON.stringify({
    ok: true,
    batchLabel: label,
    trialCounts: trialCounts,
    repeats: repeats
  }, null, 2));
}

function benchmarkTrialCountsFocused() {
  benchmarkTrialCounts_([500, 1000, 2000, 5000, 10000], 10, "FOCUSED");
}

function benchmarkTrialCountsHighSingle() {
  benchmarkTrialCounts_([20000, 50000], 5, "HIGH_SINGLE");
}

function benchmarkTrialCountsVeryHigh100k() {
  benchmarkTrialCounts_([100000], 3, "VERY_HIGH_100K");
}

function benchmarkTrialCountsUltra500kSingle() {
  benchmarkTrialCounts_([500000], 1, "ULTRA_500K");
}

function getDefaultExternalBenchmarkInvocationOptions_() {
  return {
    mode: "EXTERNAL_HTTP",
    includeBestAllocation: false,
    includeCandidatePoolsSummary: true,
    includeBestScoring: true
  };
}

function getDefaultExternalBenchmarkElapsedBudgetMs_() {
  return 240000;
}

function getDefaultExternalBenchmarkPerCallSoftLimitMs_() {
  return 120000;
}

function getDefaultExternalBenchmarkSeedBase_() {
  return 12345;
}

function mergeSimpleObjects_(baseObject, overrideObject) {
  const result = {};
  const first = baseObject || {};
  const second = overrideObject || {};
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);

  for (let i = 0; i < firstKeys.length; i++) {
    result[firstKeys[i]] = first[firstKeys[i]];
  }

  for (let j = 0; j < secondKeys.length; j++) {
    result[secondKeys[j]] = second[secondKeys[j]];
  }

  return result;
}

function normalizeExternalBenchmarkOptions_(options) {
  const source = options || {};
  const invocationOverrides = source.invocationOptions || {};
  const normalized = mergeSimpleObjects_(source, {
    elapsedBudgetMs: getDefaultExternalBenchmarkElapsedBudgetMs_(),
    perCallSoftLimitMs: getDefaultExternalBenchmarkPerCallSoftLimitMs_(),
    seedBase: getDefaultExternalBenchmarkSeedBase_(),
    refreshSummaryAfterEachTrialCount: true,
    stopOnFailure: true,
    stopOnPerCallSoftLimit: true,
    invocationOptions: mergeSimpleObjects_(
      getDefaultExternalBenchmarkInvocationOptions_(),
      invocationOverrides
    )
  });

  normalized.invocationOptions = mergeSimpleObjects_(
    getDefaultExternalBenchmarkInvocationOptions_(),
    invocationOverrides
  );

  if (typeof normalized.elapsedBudgetMs !== "number" || !isFinite(normalized.elapsedBudgetMs) || normalized.elapsedBudgetMs < 1000) {
    normalized.elapsedBudgetMs = getDefaultExternalBenchmarkElapsedBudgetMs_();
  }

  if (typeof normalized.perCallSoftLimitMs !== "number" || !isFinite(normalized.perCallSoftLimitMs) || normalized.perCallSoftLimitMs < 1000) {
    normalized.perCallSoftLimitMs = getDefaultExternalBenchmarkPerCallSoftLimitMs_();
  }

  return normalized;
}

function deriveExternalBenchmarkSeed_(seedBase, repeatIndex) {
  if (seedBase === null || seedBase === undefined || seedBase === "") {
    return null;
  }

  if (typeof seedBase === "number" && isFinite(seedBase)) {
    return seedBase + repeatIndex - 1;
  }

  return String(seedBase) + "_r" + repeatIndex;
}

function safeComponentScoreFromBestScoringLike_(bestScoringLike, componentKey) {
  if (!bestScoringLike || typeof bestScoringLike !== "object") {
    return "";
  }

  const componentScores = bestScoringLike.componentScores;
  if (componentScores && typeof componentScores === "object") {
    if (typeof componentScores[componentKey] === "number") {
      return componentScores[componentKey];
    }

    if (
      componentScores[componentKey]
      && typeof componentScores[componentKey] === "object"
      && typeof componentScores[componentKey].score === "number"
    ) {
      return componentScores[componentKey].score;
    }
  }

  const components = bestScoringLike.components;
  if (
    components
    && typeof components === "object"
    && components[componentKey]
    && typeof components[componentKey] === "object"
    && typeof components[componentKey].score === "number"
  ) {
    return components[componentKey].score;
  }

  return "";
}

function safeNumberFieldFromObjects_(fieldName, firstObject, secondObject) {
  if (firstObject && typeof firstObject[fieldName] === "number") {
    return firstObject[fieldName];
  }

  if (secondObject && typeof secondObject[fieldName] === "number") {
    return secondObject[fieldName];
  }

  return "";
}

function safeComponentScoreFromObjects_(componentKey, firstObject, secondObject) {
  const firstValue = safeComponentScoreFromBestScoringLike_(firstObject, componentKey);
  if (firstValue !== "") {
    return firstValue;
  }

  return safeComponentScoreFromBestScoringLike_(secondObject, componentKey);
}

function safeScorerConfigSourceFromBestScoring_(bestScoring) {
  if (!bestScoring || typeof bestScoring !== "object") {
    return "";
  }

  if (bestScoring.scorerSource) {
    return bestScoring.scorerSource;
  }

  if (bestScoring.scorerConfig && bestScoring.scorerConfig.source) {
    return bestScoring.scorerConfig.source;
  }

  if (bestScoring.source) {
    return bestScoring.source;
  }

  return "";
}

function safeScorerFingerprintFieldFromObjects_(fieldName, firstObject, secondObject, thirdObject) {
  const objects = [firstObject, secondObject, thirdObject];

  for (let i = 0; i < objects.length; i++) {
    const candidate = objects[i];
    if (candidate && typeof candidate === "object" && candidate[fieldName]) {
      return String(candidate[fieldName]);
    }
  }

  return "";
}

function buildBenchmarkRowFromTransportTrialResult_(batchLabel, trialCount, repeatIndex, runtimeMs, transportResult, note) {
  const timestamp = new Date();
  const ok = !!(transportResult && transportResult.ok === true);
  const bestTrial = transportResult && transportResult.bestTrial ? transportResult.bestTrial : null;
  const bestScoring = transportResult && transportResult.bestScoring ? transportResult.bestScoring : null;
  const scoringSummary = bestTrial && bestTrial.scoringSummary ? bestTrial.scoringSummary : null;
  const runtimeMsValue = getFiniteNumberOrBlank_(runtimeMs);
  const bestScore = getBestScoreFromTransportResult_(transportResult);
  const summaryMessage = ok
    ? (transportResult && transportResult.message ? transportResult.message : (note || ""))
    : "";
  const failureMessage = ok
    ? ""
    : (transportResult && transportResult.message ? transportResult.message : (note || "Unknown failure"));
  const invocationMode = (
    transportResult
    && typeof transportResult.invocationMode === "string"
    && transportResult.invocationMode
  )
    ? transportResult.invocationMode
    : getBenchmarkNoteValue_(note, "mode");
  const normalizedSeed = (
    transportResult
    && transportResult.rng
    && transportResult.rng.normalizedSeed !== undefined
    && transportResult.rng.normalizedSeed !== null
  )
    ? transportResult.rng.normalizedSeed
    : getBenchmarkNoteValue_(note, "seed");

  return buildBenchmarkTrialsRowFromObject_({
    ImportTimestamp: timestamp,
    CampaignBatchLabel: batchLabel || "",
    CampaignFolderName: "",
    SnapshotLabel: "",
    SnapshotFileSha256: "",
    TrialCount: trialCount,
    RepeatIndex: repeatIndex,
    RunId: "",
    Ok: ok,
    BestScore: bestScore,
    BestTrialIndex: getBestTrialIndexFromTransportResult_(transportResult),
    RuntimeMs: runtimeMsValue,
    RuntimeSec: typeof runtimeMsValue === "number" ? runtimeMsValue / 1000 : "",
    InvocationMode: invocationMode || "",
    Seed: normalizedSeed,
    RunFolderName: "",
    ArtifactFileName: "",
    ScorerFingerprint: safeScorerFingerprintFieldFromObjects_("scorerFingerprint", bestScoring, scoringSummary, transportResult),
    ScorerFingerprintShort: safeScorerFingerprintFieldFromObjects_("scorerFingerprintShort", bestScoring, scoringSummary, transportResult),
    ScorerFingerprintVersion: safeScorerFingerprintFieldFromObjects_("scorerFingerprintVersion", bestScoring, scoringSummary, transportResult),
    ScorerSource: safeScorerConfigSourceFromBestScoring_(bestScoring)
      || safeScorerFingerprintFieldFromObjects_("scorerSource", scoringSummary, transportResult, null),
    MeanPoints: safeNumberFieldFromObjects_("meanPoints", bestScoring, scoringSummary),
    StandardDeviation: safeNumberFieldFromObjects_("standardDeviation", bestScoring, scoringSummary),
    Range: safeNumberFieldFromObjects_("range", bestScoring, scoringSummary),
    TotalScore: getFiniteNumberOrFallbackBlank_(
      safeNumberFieldFromObjects_("totalScore", bestScoring, scoringSummary),
      bestScore
    ),
    PointBalanceGlobal: safeComponentScoreFromObjects_("pointBalanceGlobal", bestScoring, scoringSummary),
    PointBalanceWithinSection: safeComponentScoreFromObjects_("pointBalanceWithinSection", bestScoring, scoringSummary),
    SpacingPenalty: safeComponentScoreFromObjects_("spacingPenalty", bestScoring, scoringSummary),
    CrReward: safeComponentScoreFromObjects_("crReward", bestScoring, scoringSummary),
    DualEligibleIcuBonus: safeComponentScoreFromObjects_("dualEligibleIcuBonus", bestScoring, scoringSummary),
    StandbyAdjacencyPenalty: safeComponentScoreFromObjects_("standbyAdjacencyPenalty", bestScoring, scoringSummary),
    StandbyCountFairnessPenalty: safeComponentScoreFromObjects_("standbyCountFairnessPenalty", bestScoring, scoringSummary),
    PreLeavePenalty: safeComponentScoreFromObjects_("preLeavePenalty", bestScoring, scoringSummary),
    UnfilledPenalty: safeComponentScoreFromObjects_("unfilledPenalty", bestScoring, scoringSummary),
    SummaryMessage: summaryMessage,
    FailureMessage: failureMessage
  });
}

function buildExternalBenchmarkNote_(seed, invocationOptions, extraMessage) {
  const parts = [];

  if (invocationOptions && invocationOptions.mode) {
    parts.push("mode=" + invocationOptions.mode);
  }

  if (seed !== undefined) {
    parts.push("seed=" + seed);
  }

  if (extraMessage) {
    parts.push(extraMessage);
  }

  return parts.join("; ");
}

function buildExternalBenchmarkFailureTransportResult_(message, details) {
  const result = {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    message: message || "Unknown external benchmark failure."
  };

  if (details && typeof details === "object") {
    const keys = Object.keys(details);
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = details[keys[i]];
    }
  }

  return result;
}

function prepareRandomTrialsSnapshotForBenchmark_(trialCount, seed) {
  try {
    if (seed === null || seed === undefined || seed === "") {
      return prepareRandomTrialsSnapshot_(trialCount);
    }

    return prepareRandomTrialsSnapshot_(trialCount, { seed: seed });
  } catch (error) {
    return {
      ok: false,
      message: "prepareRandomTrialsSnapshot_ failed: " + (error && error.message ? error.message : String(error))
    };
  }
}

function benchmarkTrialCountsExternalHttp_(trialCounts, repeats, batchLabel, options) {
  if (!trialCounts || trialCounts.length === 0) {
    throw new Error("trialCounts is required.");
  }

  if (!repeats || repeats < 1) {
    throw new Error("repeats must be at least 1.");
  }

  const label = batchLabel || "EXTERNAL_HTTP_BENCH";
  const settings = normalizeExternalBenchmarkOptions_(options);
  const overallStartedAt = Date.now();
  let stopRequested = false;
  let stopReason = "";
  let completedRunCount = 0;

  for (let i = 0; i < trialCounts.length; i++) {
    const trialCount = trialCounts[i];

    for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex++) {
      const elapsedBeforeRunMs = Date.now() - overallStartedAt;
      if (elapsedBeforeRunMs >= settings.elapsedBudgetMs) {
        stopRequested = true;
        stopReason = "Elapsed budget reached before starting next run.";
        break;
      }

      const seed = deriveExternalBenchmarkSeed_(settings.seedBase, repeatIndex);
      const invocationOptions = settings.invocationOptions;
      const startedAt = Date.now();
      let transportResult;
      let note = buildExternalBenchmarkNote_(seed, invocationOptions, null);

      const prepared = prepareRandomTrialsSnapshotForBenchmark_(trialCount, seed);
      if (prepared.ok !== true) {
        transportResult = buildExternalBenchmarkFailureTransportResult_(prepared.message || "Snapshot preparation failed.", {
          trialSpec: {
            trialCount: trialCount,
            seed: seed
          }
        });
      } else {
        try {
          transportResult = invokeTrialCompute_(prepared.snapshot, invocationOptions);
        } catch (error) {
          transportResult = buildExternalBenchmarkFailureTransportResult_(
            "invokeTrialCompute_ threw: " + (error && error.message ? error.message : String(error)),
            {
              trialSpec: {
                trialCount: trialCount,
                seed: seed
              }
            }
          );
        }
      }

      const runtimeMs = Date.now() - startedAt;
      if (runtimeMs >= settings.perCallSoftLimitMs) {
        note = buildExternalBenchmarkNote_(seed, invocationOptions, "per-call soft limit reached");
      }

      if (!transportResult || transportResult.ok !== true) {
        const failureMessage = transportResult && transportResult.message
          ? transportResult.message
          : "Unknown failure";
        note = buildExternalBenchmarkNote_(seed, invocationOptions, failureMessage);
      }

      const row = buildBenchmarkRowFromTransportTrialResult_(
        label,
        trialCount,
        repeatIndex,
        runtimeMs,
        transportResult,
        note
      );
      appendBenchmarkRows_([row]);
      completedRunCount += 1;

      Logger.log(JSON.stringify({
        batchLabel: label,
        trialCount: trialCount,
        repeatIndex: repeatIndex,
        seed: seed,
        invocationMode: invocationOptions.mode,
        ok: transportResult && transportResult.ok === true,
        bestScore: transportResult && transportResult.bestTrial ? transportResult.bestTrial.score : null,
        runtimeMs: runtimeMs,
        message: transportResult && transportResult.ok === true
          ? ""
          : (transportResult && transportResult.message ? transportResult.message : "Unknown failure")
      }, null, 2));

      if ((!transportResult || transportResult.ok !== true) && settings.stopOnFailure) {
        stopRequested = true;
        stopReason = "Stopped after failed run at trialCount=" + trialCount + ", repeatIndex=" + repeatIndex + ".";
        break;
      }

      if (runtimeMs >= settings.perCallSoftLimitMs && settings.stopOnPerCallSoftLimit) {
        stopRequested = true;
        stopReason = "Stopped after per-call soft limit was reached at trialCount=" + trialCount + ", repeatIndex=" + repeatIndex + ".";
        break;
      }
    }

    if (settings.refreshSummaryAfterEachTrialCount) {
      refreshBenchmarkSummarySheet();
    }

    if (stopRequested) {
      break;
    }
  }

  if (!settings.refreshSummaryAfterEachTrialCount) {
    refreshBenchmarkSummarySheet();
  }

  const result = {
    ok: true,
    batchLabel: label,
    trialCounts: trialCounts,
    repeats: repeats,
    invocationMode: settings.invocationOptions.mode,
    completedRunCount: completedRunCount,
    elapsedMs: Date.now() - overallStartedAt,
    stoppedEarly: stopRequested,
    stopReason: stopReason || null
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function benchmarkTrialCountsExternalHttpValidation() {
  return benchmarkTrialCountsExternalHttp_([200, 500, 1000], 2, "EXTERNAL_HTTP_VALIDATION");
}

function benchmarkTrialCountsExternalHttpModerate() {
  return benchmarkTrialCountsExternalHttp_([2000, 5000, 10000], 3, "EXTERNAL_HTTP_MODERATE");
}

function benchmarkTrialCountsExternalHttpHighSingle() {
  return benchmarkTrialCountsExternalHttp_([20000, 50000], 2, "EXTERNAL_HTTP_HIGH_SINGLE");
}

function benchmarkTrialCountsExternalHttpVeryHigh100kSingle() {
  return benchmarkTrialCountsExternalHttp_([100000], 1, "EXTERNAL_HTTP_100K_SINGLE");
}
