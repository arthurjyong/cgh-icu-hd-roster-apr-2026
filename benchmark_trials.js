function getBenchmarkTrialsSheetName_() {
  return "BENCHMARK_TRIALS";
}

function getBenchmarkSummarySheetName_() {
  return "BENCHMARK_SUMMARY";
}

function getBenchmarkTrialsHeader_() {
  return [
    "Timestamp",
    "BatchLabel",
    "TrialCount",
    "RepeatIndex",
    "Ok",
    "BestScore",
    "RuntimeMs",
    "RuntimeSec",
    "UnfilledPenalty",
    "SpacingPenalty",
    "PreLeavePenalty",
    "CrReward",
    "DualEligibleIcuBonus",
    "StandbyAdjacencyPenalty",
    "StandbyCountFairnessPenalty",
    "PointBalanceWithinSection",
    "PointBalanceGlobal",
    "MeanPoints",
    "StandardDeviation",
    "MinPoints",
    "MaxPoints",
    "Range",
    "ScorerConfigSource",
    "Note"
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

  return [
    timestamp,
    batchLabel,
    trialCount,
    repeatIndex,
    ok,
    ok ? trialResult.bestScore : "",
    runtimeMs,
    runtimeMs / 1000,
    safeComponentScore_(bestScoring, "unfilledPenalty"),
    safeComponentScore_(bestScoring, "spacingPenalty"),
    safeComponentScore_(bestScoring, "preLeavePenalty"),
    safeComponentScore_(bestScoring, "crReward"),
    safeComponentScore_(bestScoring, "dualEligibleIcuBonus"),
    safeComponentScore_(bestScoring, "standbyAdjacencyPenalty"),
    safeComponentScore_(bestScoring, "standbyCountFairnessPenalty"),
    safeComponentScore_(bestScoring, "pointBalanceWithinSection"),
    safeComponentScore_(bestScoring, "pointBalanceGlobal"),
    bestScoring && typeof bestScoring.meanPoints === "number" ? bestScoring.meanPoints : "",
    bestScoring && typeof bestScoring.standardDeviation === "number" ? bestScoring.standardDeviation : "",
    bestScoring && typeof bestScoring.minPoints === "number" ? bestScoring.minPoints : "",
    bestScoring && typeof bestScoring.maxPoints === "number" ? bestScoring.maxPoints : "",
    bestScoring && typeof bestScoring.range === "number" ? bestScoring.range : "",
    bestScoring && bestScoring.scorerConfig && bestScoring.scorerConfig.source
      ? bestScoring.scorerConfig.source
      : "",
    ok ? "" : (trialResult && trialResult.message ? trialResult.message : "Unknown failure")
  ];
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

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const batchLabel = row[1];
    const trialCount = row[2];
    const ok = row[4];
    const bestScore = row[5];
    const runtimeSec = row[7];

    if (!ok || typeof bestScore !== "number") {
      continue;
    }

    const key = batchLabel + "||" + trialCount;
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

    return aGroup.trialCount - bGroup.trialCount;
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

  const rowsToAppend = [];
  const label = batchLabel || "BENCH";

  for (let i = 0; i < trialCounts.length; i++) {
    const trialCount = trialCounts[i];

    for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex++) {
      const startedAt = Date.now();
      const trialResult = runRandomTrials_(trialCount);
      const runtimeMs = Date.now() - startedAt;

      rowsToAppend.push(
        buildBenchmarkRow_(label, trialCount, repeatIndex, runtimeMs, trialResult)
      );

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
  }

  appendBenchmarkRows_(rowsToAppend);
  refreshBenchmarkSummarySheet();

  Logger.log(JSON.stringify({
    ok: true,
    batchLabel: label,
    rowsWritten: rowsToAppend.length,
    trialCounts: trialCounts,
    repeats: repeats
  }, null, 2));
}

function benchmarkTrialCountsAll() {
  benchmarkTrialCounts_([1, 10, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000], 3, "ALL");
}