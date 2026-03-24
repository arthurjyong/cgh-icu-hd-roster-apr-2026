function getBenchmarkTrialsSheetName_() {
  return "SEARCH_LOG";
}

function getBenchmarkReviewSheetName_() {
  return "SEARCH_PROGRESS";
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
    "ComparisonGroupKey",
    "ComparisonStatus",
    "ComparisonStatusReason",
    "BatchLabel",
    "TrialCount",
    "RunCount",
    "CampaignCount",
    "SnapshotLabel",
    "SnapshotFileSha256",
    "ScorerFingerprint",
    "ScorerFingerprintShort",
    "ScorerFingerprintVersion",
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

function getBenchmarkReviewHeader_() {
  return [
    "OperationalState",
    "StatusSource",
    "Freshness",
    "ReconciliationState",
    "Warning",
    "ChunkCompletedAt",
    "RunId",
    "TrialCount",
    "ChunkIndex",
    "BestScore",
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
    "RuntimeSec",
    "FailureMessage",
    "ScorerFingerprintShort"
  ];
}

function readBenchmarkReviewOperationalProjection_() {
  const fallback = {
    OperationalState: "",
    StatusSource: "",
    Freshness: "",
    ReconciliationState: "",
    Warning: ""
  };

  try {
    fallback.OperationalState = normalizeBenchmarkSummaryString_(resolveBenchmarkUiControlRange_("status").getValue());
    fallback.StatusSource = normalizeBenchmarkSummaryString_(resolveBenchmarkUiControlRange_("statusSource").getValue());
    fallback.Freshness = normalizeBenchmarkSummaryString_(resolveBenchmarkUiControlRange_("freshness").getValue());
    fallback.ReconciliationState = normalizeBenchmarkSummaryString_(resolveBenchmarkUiControlRange_("reconciliationState").getValue());
    fallback.Warning = normalizeBenchmarkSummaryString_(resolveBenchmarkUiControlRange_("warning").getValue());
  } catch (_err) {
    // Keep SEARCH_PROGRESS refresh resilient even when UI controls are not installed yet.
  }

  return fallback;
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

  applyBenchmarkSheetFormatting_(sheet);

  return sheet;
}

function applyBenchmarkHeaderFormatting_(sheet, columnCount) {
  if (!sheet || !columnCount || columnCount < 1) {
    return;
  }

  sheet.getRange(1, 1, 1, columnCount)
    .setVerticalAlignment("top")
    .setWrap(true);
}

function applyBenchmarkReviewNumberFormatting_(sheet) {
  if (!sheet) {
    return;
  }

  // SEARCH_PROGRESS schema:
  // A:E operational projection text columns,
  // F timestamp, G text runId, H:I integer counters,
  // J score, K:M decimal stats, N:W score/component integers, X runtime decimal.
  sheet.getRange("F:F").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange("H:I").setNumberFormat("0");
  sheet.getRange("J:J").setNumberFormat("0");
  sheet.getRange("K:K").setNumberFormat("0.00");
  sheet.getRange("L:L").setNumberFormat("0.00");
  sheet.getRange("M:M").setNumberFormat("0.00");
  sheet.getRange("N:W").setNumberFormat("0");
  sheet.getRange("X:X").setNumberFormat("0.00");
}

function applyBenchmarkSheetFormatting_(sheet) {
  if (!sheet) {
    return;
  }

  const sheetName = sheet.getName();

  if (sheetName === getBenchmarkTrialsSheetName_()) {
    applyBenchmarkHeaderFormatting_(sheet, getBenchmarkTrialsHeader_().length);
    return;
  }

  if (sheetName === getBenchmarkReviewSheetName_()) {
    applyBenchmarkHeaderFormatting_(sheet, getBenchmarkReviewHeader_().length);
    applyBenchmarkReviewNumberFormatting_(sheet);
  }
}

function ensureBenchmarkTrialsSheet_() {
  const sheet = ensureBenchmarkSheet_(getBenchmarkTrialsSheetName_(), getBenchmarkTrialsHeader_());
  moveBenchmarkSheetToPosition_(sheet, SpreadsheetApp.getActive().getSheets().length);
  return sheet;
}

function ensureBenchmarkReviewSheet_() {
  const sheet = ensureBenchmarkSheet_(getBenchmarkReviewSheetName_(), getBenchmarkReviewHeader_());
  moveBenchmarkSheetToPosition_(sheet, 3);
  return sheet;
}

function moveBenchmarkSheetToPosition_(sheet, position) {
  if (!sheet || typeof position !== "number") {
    return;
  }
  const ss = SpreadsheetApp.getActive();
  const sheetCount = ss.getSheets().length;
  const targetIndex = Math.min(Math.max(1, position), Math.max(1, sheetCount));
  if (typeof sheet.setIndex === "function") {
    sheet.setIndex(targetIndex);
    return;
  }
  const previousActive = ss.getActiveSheet();
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(targetIndex);
  if (previousActive && previousActive.getSheetId() !== sheet.getSheetId()) {
    ss.setActiveSheet(previousActive);
  }
}

function safeReviewCellValue_(value) {
  return value === null || value === undefined ? "" : value;
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
  applyBenchmarkSheetFormatting_(sheet);
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
  const reviewSheet = ensureBenchmarkReviewSheet_();

  trialsSheet.clearContents();
  reviewSheet.clearContents();

  const trialsHeader = getBenchmarkTrialsHeader_();
  const reviewHeader = getBenchmarkReviewHeader_();

  trialsSheet.getRange(1, 1, 1, trialsHeader.length).setValues([trialsHeader]);
  reviewSheet.getRange(1, 1, 1, reviewHeader.length).setValues([reviewHeader]);

  trialsSheet.setFrozenRows(1);
  reviewSheet.setFrozenRows(1);

  trialsSheet.getRange(1, 1, 1, trialsHeader.length).setFontWeight("bold");
  reviewSheet.getRange(1, 1, 1, reviewHeader.length).setFontWeight("bold");
  applyBenchmarkSheetFormatting_(trialsSheet);
  applyBenchmarkSheetFormatting_(reviewSheet);

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

function normalizeBenchmarkSummaryString_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function getBenchmarkSummaryStatusSortRank_(status) {
  const normalized = normalizeBenchmarkSummaryString_(status);
  if (normalized === "STRICT") {
    return 0;
  }
  if (normalized === "FALLBACK_BATCH_SCORER") {
    return 1;
  }
  if (normalized === "INCOMPLETE_METADATA_SINGLETON") {
    return 2;
  }
  return 3;
}

function isBenchmarkHelperSummaryFallbackRow_(rowObject) {
  const row = rowObject || {};
  const batchLabel = normalizeBenchmarkSummaryString_(row.CampaignBatchLabel);
  const campaignFolderName = normalizeBenchmarkSummaryString_(row.CampaignFolderName);
  const runFolderName = normalizeBenchmarkSummaryString_(row.RunFolderName);
  const artifactFileName = normalizeBenchmarkSummaryString_(row.ArtifactFileName);
  const runId = normalizeBenchmarkSummaryString_(row.RunId);

  return !!(
    batchLabel
    && !campaignFolderName
    && !runFolderName
    && !artifactFileName
    && !runId
  );
}

function buildBenchmarkSummaryRowIdentity_(rowObject, rowIndex) {
  const row = rowObject || {};
  const batchLabel = normalizeBenchmarkSummaryString_(row.CampaignBatchLabel);
  const snapshotFileSha256 = normalizeBenchmarkSummaryString_(row.SnapshotFileSha256);
  const scorerFingerprint = normalizeBenchmarkSummaryString_(row.ScorerFingerprint);
  const invocationMode = normalizeBenchmarkSummaryString_(row.InvocationMode);
  const runId = normalizeBenchmarkSummaryString_(row.RunId);
  const rowNumber = row && row._rowNumber ? Number(row._rowNumber) : Number(rowIndex) + 2;
  const missingFields = [];

  if (!snapshotFileSha256) {
    missingFields.push("SnapshotFileSha256");
  }

  if (!scorerFingerprint) {
    missingFields.push("ScorerFingerprint");
  }

  if (missingFields.length === 0) {
    return {
      comparisonGroupKey: "cg:v1|snapshot:" + snapshotFileSha256 + "|scorer:" + scorerFingerprint,
      comparisonStatus: "STRICT",
      comparisonStatusReason: "Comparable only within identical SnapshotFileSha256 + ScorerFingerprint.",
      snapshotFileSha256: snapshotFileSha256,
      scorerFingerprint: scorerFingerprint,
      rowNumber: rowNumber
    };
  }

  if (
    !snapshotFileSha256
    && scorerFingerprint
    && isBenchmarkHelperSummaryFallbackRow_(row)
  ) {
    return {
      comparisonGroupKey: "cg:v1|helperBatch:" + batchLabel + "|mode:" + invocationMode + "|scorer:" + scorerFingerprint,
      comparisonStatus: "FALLBACK_BATCH_SCORER",
      comparisonStatusReason: "SnapshotFileSha256 is missing, so built-in benchmark helper rows are grouped by CampaignBatchLabel + InvocationMode + ScorerFingerprint.",
      snapshotFileSha256: snapshotFileSha256,
      scorerFingerprint: scorerFingerprint,
      rowNumber: rowNumber
    };
  }

  return {
    comparisonGroupKey: "cg:v1|singleton:" + (runId || "row-" + rowNumber),
    comparisonStatus: "INCOMPLETE_METADATA_SINGLETON",
    comparisonStatusReason: "Missing required comparison metadata: " + missingFields.join(", ") + ". Row isolated to avoid misleading aggregation.",
    snapshotFileSha256: snapshotFileSha256,
    scorerFingerprint: scorerFingerprint,
    rowNumber: rowNumber
  };
}

function buildBenchmarkSummaryGroupsFromTrialRowObjects_(rowObjects) {
  const groups = {};
  const rows = Array.isArray(rowObjects) ? rowObjects : [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const ok = row.Ok;
    const bestScore = row.BestScore;
    const runtimeSec = row.RuntimeSec;

    if (!ok || typeof bestScore !== "number") {
      continue;
    }

    const identity = buildBenchmarkSummaryRowIdentity_(row, i);
    const trialCount = row.TrialCount;
    const groupKey = identity.comparisonGroupKey + "|trialCount:" + String(trialCount);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        comparisonGroupKey: identity.comparisonGroupKey,
        comparisonStatus: identity.comparisonStatus,
        comparisonStatusReason: identity.comparisonStatusReason,
        batchLabels: {},
        trialCount: trialCount,
        snapshotLabels: {},
        snapshotFileSha256: identity.snapshotFileSha256,
        scorerFingerprint: identity.scorerFingerprint,
        scorerFingerprintShort: normalizeBenchmarkSummaryString_(row.ScorerFingerprintShort),
        scorerFingerprintVersion: normalizeBenchmarkSummaryString_(row.ScorerFingerprintVersion),
        scores: [],
        runtimes: [],
        campaignFolderNames: {}
      };
    }

    groups[groupKey].scores.push(bestScore);

    if (typeof runtimeSec === "number") {
      groups[groupKey].runtimes.push(runtimeSec);
    }

    const campaignFolderName = normalizeBenchmarkSummaryString_(row.CampaignFolderName);
    if (campaignFolderName) {
      groups[groupKey].campaignFolderNames[campaignFolderName] = true;
    }

    const batchLabel = normalizeBenchmarkSummaryString_(row.CampaignBatchLabel);
    if (batchLabel) {
      groups[groupKey].batchLabels[batchLabel] = true;
    }

    const snapshotLabel = normalizeBenchmarkSummaryString_(row.SnapshotLabel);
    if (snapshotLabel) {
      groups[groupKey].snapshotLabels[snapshotLabel] = true;
    }
  }

  return groups;
}

function compareBenchmarkSummaryGroups_(left, right) {
  const leftGroup = left || {};
  const rightGroup = right || {};

  const leftStatus = normalizeBenchmarkSummaryString_(leftGroup.comparisonStatus);
  const rightStatus = normalizeBenchmarkSummaryString_(rightGroup.comparisonStatus);
  const leftStatusRank = getBenchmarkSummaryStatusSortRank_(leftStatus);
  const rightStatusRank = getBenchmarkSummaryStatusSortRank_(rightStatus);
  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank;
  }
  if (leftStatus !== rightStatus) {
    return leftStatus.localeCompare(rightStatus);
  }

  const leftSnapshot = normalizeBenchmarkSummaryString_(leftGroup.snapshotFileSha256);
  const rightSnapshot = normalizeBenchmarkSummaryString_(rightGroup.snapshotFileSha256);
  if (leftSnapshot !== rightSnapshot) {
    return leftSnapshot.localeCompare(rightSnapshot);
  }

  const leftScorer = normalizeBenchmarkSummaryString_(leftGroup.scorerFingerprint);
  const rightScorer = normalizeBenchmarkSummaryString_(rightGroup.scorerFingerprint);
  if (leftScorer !== rightScorer) {
    return leftScorer.localeCompare(rightScorer);
  }

  const leftBatch = normalizeBenchmarkSummaryString_(Object.keys(leftGroup.batchLabels || {}).sort()[0]);
  const rightBatch = normalizeBenchmarkSummaryString_(Object.keys(rightGroup.batchLabels || {}).sort()[0]);
  if (leftBatch !== rightBatch) {
    return leftBatch.localeCompare(rightBatch);
  }

  const leftTrialCount = typeof leftGroup.trialCount === "number" ? leftGroup.trialCount : Number(leftGroup.trialCount);
  const rightTrialCount = typeof rightGroup.trialCount === "number" ? rightGroup.trialCount : Number(rightGroup.trialCount);
  if (leftTrialCount !== rightTrialCount) {
    return leftTrialCount - rightTrialCount;
  }

  return normalizeBenchmarkSummaryString_(leftGroup.comparisonGroupKey)
    .localeCompare(normalizeBenchmarkSummaryString_(rightGroup.comparisonGroupKey));
}

function buildBenchmarkSummaryRowsFromTrialRowObjects_(rowObjects) {
  const groups = buildBenchmarkSummaryGroupsFromTrialRowObjects_(rowObjects);
  const keys = Object.keys(groups);

  keys.sort(function(a, b) {
    return compareBenchmarkSummaryGroups_(groups[a], groups[b]);
  });

  return keys.map(function(key) {
    const group = groups[key];
    const sortedScores = sortNumberListAscending_(group.scores);
    const sortedRuntimes = sortNumberListAscending_(group.runtimes);
    const batchLabels = Object.keys(group.batchLabels);
    const snapshotLabels = Object.keys(group.snapshotLabels);

    group.batchLabel = batchLabels.length <= 1 ? (batchLabels[0] || "") : "(multiple)";
    group.snapshotLabel = snapshotLabels.length <= 1 ? (snapshotLabels[0] || "") : "(multiple)";

    return [
      group.comparisonGroupKey,
      group.comparisonStatus,
      group.comparisonStatusReason,
      group.batchLabel,
      group.trialCount,
      group.scores.length,
      Object.keys(group.campaignFolderNames).length,
      group.snapshotLabel,
      group.snapshotFileSha256,
      group.scorerFingerprint,
      group.scorerFingerprintShort,
      group.scorerFingerprintVersion,
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
    ];
  });
}

function buildBenchmarkSummaryRows_() {
  const trialsSheet = ensureBenchmarkTrialsSheet_();
  const lastRow = trialsSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const header = getBenchmarkTrialsHeader_();
  const data = trialsSheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  const rowObjects = [];

  for (let i = 0; i < data.length; i++) {
    const sourceRow = data[i];
    const rowObject = {
      _rowNumber: i + 2
    };

    for (let j = 0; j < header.length; j++) {
      rowObject[header[j]] = sourceRow[j];
    }

    rowObjects.push(rowObject);
  }

  return buildBenchmarkSummaryRowsFromTrialRowObjects_(rowObjects);
}

function isGlobalCampaignRunId_(runId) {
  return /^cmp_/i.test(normalizeBenchmarkSummaryString_(runId));
}

function getBenchmarkRunIdStatus_(runId) {
  const normalizedRunId = normalizeBenchmarkSummaryString_(runId);

  if (!normalizedRunId) {
    return "";
  }

  return isGlobalCampaignRunId_(normalizedRunId) ? "GLOBAL_CAMPAIGN_ID" : "DEPRECATED_LEGACY_ID";
}

function buildBenchmarkReviewRows_() {
  const trialsSheet = ensureBenchmarkTrialsSheet_();
  const reviewHeader = getBenchmarkReviewHeader_();
  const lastRow = trialsSheet.getLastRow();
  const lastColumn = trialsSheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const actualHeader = trialsSheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const headerMap = buildHeaderIndexMapFromRow_(actualHeader);
  const trialValues = trialsSheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const operationalProjection = readBenchmarkReviewOperationalProjection_();

  return trialValues.map(function(sourceRow) {
    const rowObject = {};

    for (let i = 0; i < actualHeader.length; i++) {
      const columnName = normalizeBenchmarkSummaryString_(actualHeader[i]);
      if (!columnName || typeof headerMap[columnName] !== "number") {
        continue;
      }
      rowObject[columnName] = sourceRow[i];
    }

    return {
      OperationalState: safeReviewCellValue_(operationalProjection.OperationalState),
      StatusSource: safeReviewCellValue_(operationalProjection.StatusSource),
      Freshness: safeReviewCellValue_(operationalProjection.Freshness),
      ReconciliationState: safeReviewCellValue_(operationalProjection.ReconciliationState),
      Warning: safeReviewCellValue_(operationalProjection.Warning),
      ChunkCompletedAt: safeReviewCellValue_(rowObject.ImportTimestamp),
      RunId: safeReviewCellValue_(rowObject.RunId),
      TrialCount: safeReviewCellValue_(rowObject.TrialCount),
      ChunkIndex: safeReviewCellValue_(rowObject.RepeatIndex),
      BestScore: safeReviewCellValue_(rowObject.BestScore),
      MeanPoints: safeReviewCellValue_(rowObject.MeanPoints),
      StandardDeviation: safeReviewCellValue_(rowObject.StandardDeviation),
      Range: safeReviewCellValue_(rowObject.Range),
      TotalScore: safeReviewCellValue_(rowObject.TotalScore),
      PointBalanceGlobal: safeReviewCellValue_(rowObject.PointBalanceGlobal),
      PointBalanceWithinSection: safeReviewCellValue_(rowObject.PointBalanceWithinSection),
      SpacingPenalty: safeReviewCellValue_(rowObject.SpacingPenalty),
      CrReward: safeReviewCellValue_(rowObject.CrReward),
      DualEligibleIcuBonus: safeReviewCellValue_(rowObject.DualEligibleIcuBonus),
      StandbyAdjacencyPenalty: safeReviewCellValue_(rowObject.StandbyAdjacencyPenalty),
      StandbyCountFairnessPenalty: safeReviewCellValue_(rowObject.StandbyCountFairnessPenalty),
      PreLeavePenalty: safeReviewCellValue_(rowObject.PreLeavePenalty),
      UnfilledPenalty: safeReviewCellValue_(rowObject.UnfilledPenalty),
      RuntimeSec: safeReviewCellValue_(rowObject.RuntimeSec),
      FailureMessage: safeReviewCellValue_(rowObject.FailureMessage),
      ScorerFingerprintShort: safeReviewCellValue_(rowObject.ScorerFingerprintShort)
    };
  }).map(function(rowObject) {
    return reviewHeader.map(function(columnName) {
      return Object.prototype.hasOwnProperty.call(rowObject, columnName) ? rowObject[columnName] : "";
    });
  });
}

function refreshBenchmarkSummarySheet() {
  Logger.log(JSON.stringify({
    ok: true,
    skipped: true,
    message: "BENCHMARK_SUMMARY is retired from operational red-button flow."
  }, null, 2));
}

function refreshBenchmarkReviewSheet() {
  const reviewSheet = ensureBenchmarkReviewSheet_();
  const header = getBenchmarkReviewHeader_();
  const rows = buildBenchmarkReviewRows_();

  reviewSheet.clearContents();
  reviewSheet.getRange(1, 1, 1, header.length).setValues([header]);
  reviewSheet.setFrozenRows(1);
  reviewSheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
  applyBenchmarkSheetFormatting_(reviewSheet);

  if (rows.length > 0) {
    reviewSheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  Logger.log(JSON.stringify({
    ok: true,
    reviewRowCount: rows.length,
    sheetName: getBenchmarkReviewSheetName_()
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
    refreshBenchmarkReviewSheet();
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
      refreshBenchmarkReviewSheet();
    }

    if (stopRequested) {
      break;
    }
  }

  if (!settings.refreshSummaryAfterEachTrialCount) {
    refreshBenchmarkSummarySheet();
    refreshBenchmarkReviewSheet();
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
