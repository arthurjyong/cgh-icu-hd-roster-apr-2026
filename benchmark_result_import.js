function getPhase12BenchmarkImportPropertyKeys_() {
  return {
    selectionMode: "PHASE12_BENCHMARK_IMPORT_SELECTION_MODE",
    selectedRunFolderName: "PHASE12_BENCHMARK_IMPORT_SELECTED_RUN_FOLDER_NAME",
    selectedArtifactFileName: "PHASE12_BENCHMARK_IMPORT_SELECTED_ARTIFACT_FILE_NAME"
  };
}

function getPhase12BenchmarkImportDefaults_() {
  return {
    selectionMode: "LATEST",
    artifactFileName: "global_best.transport_trial_result_v1.json",
    summarySheetName: "Phase12_Benchmark_Import"
  };
}

function normalizePhase12BenchmarkImportSelectionMode_(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SELECTED") {
    return "SELECTED";
  }
  return "LATEST";
}

function getStoredPhase12BenchmarkImportSelection_() {
  const keys = getPhase12BenchmarkImportPropertyKeys_();
  const defaults = getPhase12BenchmarkImportDefaults_();
  const properties = PropertiesService.getScriptProperties();

  return {
    selectionMode: normalizePhase12BenchmarkImportSelectionMode_(
      properties.getProperty(keys.selectionMode) || defaults.selectionMode
    ),
    selectedRunFolderName: String(
      properties.getProperty(keys.selectedRunFolderName) || ""
    ).trim(),
    selectedArtifactFileName: String(
      properties.getProperty(keys.selectedArtifactFileName) || defaults.artifactFileName
    ).trim() || defaults.artifactFileName
  };
}

function persistPhase12BenchmarkImportSelection_(selection) {
  const keys = getPhase12BenchmarkImportPropertyKeys_();
  const defaults = getPhase12BenchmarkImportDefaults_();
  const properties = PropertiesService.getScriptProperties();

  const values = {};
  values[keys.selectionMode] = normalizePhase12BenchmarkImportSelectionMode_(
    selection && selection.selectionMode
  );
  values[keys.selectedRunFolderName] = selection && selection.selectedRunFolderName
    ? String(selection.selectedRunFolderName).trim()
    : "";
  values[keys.selectedArtifactFileName] = selection && selection.selectedArtifactFileName
    ? String(selection.selectedArtifactFileName).trim()
    : defaults.artifactFileName;

  properties.setProperties(values, false);
}

function setPhase12BenchmarkImportLatestSelection() {
  persistPhase12BenchmarkImportSelection_({
    selectionMode: "LATEST"
  });

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 12 benchmark import selection set to LATEST.",
    selection: getStoredPhase12BenchmarkImportSelection_()
  }, null, 2));
}

function setPhase12BenchmarkImportSelectedRunFolder(runFolderName) {
  const trimmed = String(runFolderName || "").trim();
  if (!trimmed) {
    throw new Error("runFolderName is required.");
  }

  persistPhase12BenchmarkImportSelection_({
    selectionMode: "SELECTED",
    selectedRunFolderName: trimmed
  });

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 12 benchmark import selection set to SELECTED.",
    selection: getStoredPhase12BenchmarkImportSelection_()
  }, null, 2));
}

function setPhase12BenchmarkImportSelectedArtifactFileName(artifactFileName) {
  const trimmed = String(artifactFileName || "").trim();
  if (!trimmed) {
    throw new Error("artifactFileName is required.");
  }

  const current = getStoredPhase12BenchmarkImportSelection_();
  current.selectedArtifactFileName = trimmed;
  persistPhase12BenchmarkImportSelection_(current);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 12 benchmark import artifact filename updated.",
    selection: getStoredPhase12BenchmarkImportSelection_()
  }, null, 2));
}

function clearPhase12BenchmarkImportSelectedRunFolder() {
  const current = getStoredPhase12BenchmarkImportSelection_();
  current.selectedRunFolderName = "";
  persistPhase12BenchmarkImportSelection_(current);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 12 benchmark import selected run folder cleared.",
    selection: getStoredPhase12BenchmarkImportSelection_()
  }, null, 2));
}

function debugGetPhase12BenchmarkImportSelection() {
  Logger.log(JSON.stringify({
    ok: true,
    selection: getStoredPhase12BenchmarkImportSelection_()
  }, null, 2));
}

function buildPhase12BenchmarkImportOptions_(overrides) {
  const defaults = getPhase12BenchmarkImportDefaults_();
  const stored = getStoredPhase12BenchmarkImportSelection_();
  const options = {
    selectionMode: stored.selectionMode,
    selectedRunFolderName: stored.selectedRunFolderName,
    selectedArtifactFileName: stored.selectedArtifactFileName,
    summarySheetName: defaults.summarySheetName,
    writeSummarySheet: true
  };

  const extra = overrides || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    options[keys[i]] = extra[keys[i]];
  }

  options.selectionMode = normalizePhase12BenchmarkImportSelectionMode_(options.selectionMode);
  options.selectedRunFolderName = String(options.selectedRunFolderName || "").trim();
  options.selectedArtifactFileName = String(
    options.selectedArtifactFileName || defaults.artifactFileName
  ).trim() || defaults.artifactFileName;
  options.summarySheetName = String(
    options.summarySheetName || defaults.summarySheetName
  ).trim() || defaults.summarySheetName;
  options.writeSummarySheet = options.writeSummarySheet !== false;

  return options;
}

function findSingleRunFolderByNameOrNull_(benchmarkRunsFolder, runFolderName) {
  const iterator = benchmarkRunsFolder.getFoldersByName(runFolderName);
  const matches = [];

  while (iterator.hasNext() && matches.length < 2) {
    matches.push(iterator.next());
  }

  if (matches.length === 0) {
    return {
      ok: true,
      folder: null,
      matchCount: 0
    };
  }

  if (matches.length > 1 || iterator.hasNext()) {
    return {
      ok: false,
      message:
        'Multiple benchmark run folders named "' + runFolderName + '" were found under benchmark_runs.'
    };
  }

  return {
    ok: true,
    folder: matches[0],
    matchCount: 1
  };
}

function findArtifactFilesInRunFolder_(runFolder, artifactFileName) {
  const iterator = runFolder.getFilesByName(artifactFileName);
  const files = [];

  while (iterator.hasNext()) {
    files.push(iterator.next());
  }

  return files;
}

function chooseLatestBenchmarkArtifactFile_(artifactCandidates) {
  if (!Array.isArray(artifactCandidates) || artifactCandidates.length === 0) {
    return null;
  }

  let latest = artifactCandidates[0];
  let latestTime = latest.file.getLastUpdated().getTime();

  for (let i = 1; i < artifactCandidates.length; i++) {
    const candidate = artifactCandidates[i];
    const candidateTime = candidate.file.getLastUpdated().getTime();

    if (candidateTime > latestTime) {
      latest = candidate;
      latestTime = candidateTime;
      continue;
    }

    if (candidateTime === latestTime) {
      const latestName = String(latest.runFolderName || "");
      const candidateName = String(candidate.runFolderName || "");
      if (candidateName > latestName) {
        latest = candidate;
        latestTime = candidateTime;
      }
    }
  }

  return latest;
}

function resolveSelectedBenchmarkArtifactFile_(options) {
  const benchmarkRunsFolder = getPhase12BenchmarkRunsFolder_();
  const runFolderName = options.selectedRunFolderName;
  const artifactFileName = options.selectedArtifactFileName;

  if (!runFolderName) {
    throw new Error(
      "SELECTED mode requires Script Property PHASE12_BENCHMARK_IMPORT_SELECTED_RUN_FOLDER_NAME."
    );
  }

  const folderMatch = findSingleRunFolderByNameOrNull_(benchmarkRunsFolder, runFolderName);
  if (folderMatch.ok !== true) {
    throw new Error(folderMatch.message || "Failed to resolve selected benchmark run folder.");
  }

  if (!folderMatch.folder) {
    throw new Error('Benchmark run folder not found: "' + runFolderName + '".');
  }

  const files = findArtifactFilesInRunFolder_(folderMatch.folder, artifactFileName);

  if (files.length === 0) {
    throw new Error(
      'Artifact file "' + artifactFileName + '" not found in benchmark run folder "' + runFolderName + '".'
    );
  }

  if (files.length > 1) {
    throw new Error(
      'Multiple artifact files named "' + artifactFileName + '" were found in benchmark run folder "' + runFolderName + '".'
    );
  }

  return {
    selectionMode: "SELECTED",
    benchmarkRunsFolderId: benchmarkRunsFolder.getId(),
    runFolder: folderMatch.folder,
    runFolderName: folderMatch.folder.getName(),
    file: files[0],
    fileName: files[0].getName()
  };
}

function resolveLatestBenchmarkArtifactFile_(options) {
  const benchmarkRunsFolder = getPhase12BenchmarkRunsFolder_();
  const artifactFileName = options.selectedArtifactFileName;
  const runFolders = benchmarkRunsFolder.getFolders();
  const candidates = [];

  while (runFolders.hasNext()) {
    const runFolder = runFolders.next();
    const files = findArtifactFilesInRunFolder_(runFolder, artifactFileName);

    if (files.length > 1) {
      throw new Error(
        'Multiple artifact files named "' + artifactFileName + '" were found in benchmark run folder "' + runFolder.getName() + '".'
      );
    }

    if (files.length === 1) {
      candidates.push({
        runFolder: runFolder,
        runFolderName: runFolder.getName(),
        file: files[0],
        fileName: files[0].getName()
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'No benchmark artifact file named "' + artifactFileName + '" was found under benchmark_runs.'
    );
  }

  const latest = chooseLatestBenchmarkArtifactFile_(candidates);

  return {
    selectionMode: "LATEST",
    benchmarkRunsFolderId: benchmarkRunsFolder.getId(),
    runFolder: latest.runFolder,
    runFolderName: latest.runFolderName,
    file: latest.file,
    fileName: latest.fileName
  };
}

function resolveBenchmarkArtifactFile_(options) {
  if (options.selectionMode === "SELECTED") {
    return resolveSelectedBenchmarkArtifactFile_(options);
  }

  return resolveLatestBenchmarkArtifactFile_(options);
}

function readUtf8TextFromDriveFile_(file) {
  if (!file) {
    throw new Error("Drive file is required.");
  }

  return file.getBlob().getDataAsString("UTF-8");
}

function parseJsonOrThrow_(text, contextLabel) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Failed to parse JSON for " + contextLabel + ": " + (error && error.message ? error.message : error)
    );
  }
}

function loadTransportTrialResultFromDrive_(overrides) {
  const options = buildPhase12BenchmarkImportOptions_(overrides);
  const resolved = resolveBenchmarkArtifactFile_(options);
  const rawText = readUtf8TextFromDriveFile_(resolved.file);
  const transportResult = parseJsonOrThrow_(
    rawText,
    resolved.runFolderName + "/" + resolved.file.getName()
  );
  const validation = validateTransportTrialResult_(transportResult);

  if (validation.ok !== true) {
    throw new Error(validation.message || "Imported transport trial result failed validation.");
  }

  return {
    ok: true,
    options: options,
    selectionMode: resolved.selectionMode,
    benchmarkRunsFolderId: resolved.benchmarkRunsFolderId,
    runFolderId: resolved.runFolder.getId(),
    runFolderName: resolved.runFolderName,
    artifactFileId: resolved.file.getId(),
    artifactFileName: resolved.file.getName(),
    artifactLastUpdated: resolved.file.getLastUpdated(),
    artifactUrl: resolved.file.getUrl(),
    transportValidation: validation,
    transportResult: transportResult
  };
}

function buildBenchmarkImportSummary_(loaded) {
  const transportResult = loaded.transportResult || {};
  const bestTrial = transportResult.bestTrial || {};
  const scoringSummary = bestTrial.scoringSummary || {};
  const candidatePoolsSummary = transportResult.candidatePoolsSummary || {};
  const bestAllocation = transportResult.bestAllocation || null;
  const bestScoring = transportResult.bestScoring || null;

  return {
    importTimestamp: new Date(),
    selectionMode: loaded.selectionMode,
    runFolderName: loaded.runFolderName,
    artifactFileName: loaded.artifactFileName,
    artifactFileId: loaded.artifactFileId,
    artifactLastUpdated: loaded.artifactLastUpdated,
    artifactUrl: loaded.artifactUrl,
    contractVersion: transportResult.contractVersion || null,
    sourceContractVersion: transportResult.sourceContractVersion || null,
    snapshotContractVersion: transportResult.snapshotContractVersion || null,
    trialCount: transportResult.trialSpec ? transportResult.trialSpec.trialCount : null,
    seed: transportResult.trialSpec ? transportResult.trialSpec.seed : null,
    rngKind: transportResult.rng ? transportResult.rng.kind : null,
    normalizedSeed: transportResult.rng ? transportResult.rng.normalizedSeed : null,
    bestTrialIndex: bestTrial.index,
    bestScore: bestTrial.score,
    hasBestAllocation: !!bestAllocation,
    hasBestScoring: !!bestScoring,
    allocationDayCount: bestAllocation && Array.isArray(bestAllocation.days)
      ? bestAllocation.days.length
      : null,
    candidatePoolDateCount: candidatePoolsSummary.dateCount || null,
    candidatePoolEmptySlotCount: candidatePoolsSummary.emptySlotCount || null,
    scoringMeanPoints: scoringSummary.meanPoints || null,
    scoringStandardDeviation: scoringSummary.standardDeviation || null,
    scoringMinPoints: scoringSummary.minPoints || null,
    scoringMaxPoints: scoringSummary.maxPoints || null,
    scoringRange: scoringSummary.range || null
  };
}

function getOrCreateSheetByName_(sheetName) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  return sheet;
}

function buildBenchmarkImportSummaryRows_(summary) {
  return [
    ["Field", "Value"],
    ["Import timestamp", summary.importTimestamp],
    ["Selection mode", summary.selectionMode],
    ["Run folder name", summary.runFolderName],
    ["Artifact file name", summary.artifactFileName],
    ["Artifact file ID", summary.artifactFileId],
    ["Artifact last updated", summary.artifactLastUpdated],
    ["Artifact URL", summary.artifactUrl],
    ["Contract version", summary.contractVersion],
    ["Source contract version", summary.sourceContractVersion],
    ["Snapshot contract version", summary.snapshotContractVersion],
    ["Trial count", summary.trialCount],
    ["Seed", summary.seed],
    ["RNG kind", summary.rngKind],
    ["Normalized seed", summary.normalizedSeed],
    ["Best trial index", summary.bestTrialIndex],
    ["Best score", summary.bestScore],
    ["Has best allocation", summary.hasBestAllocation],
    ["Has best scoring", summary.hasBestScoring],
    ["Allocation day count", summary.allocationDayCount],
    ["Candidate pool date count", summary.candidatePoolDateCount],
    ["Candidate pool empty slot count", summary.candidatePoolEmptySlotCount],
    ["Scoring mean points", summary.scoringMeanPoints],
    ["Scoring standard deviation", summary.scoringStandardDeviation],
    ["Scoring min points", summary.scoringMinPoints],
    ["Scoring max points", summary.scoringMaxPoints],
    ["Scoring range", summary.scoringRange]
  ];
}

function writeBenchmarkImportSummaryToSheet_(summary, summarySheetName) {
  const sheetName = String(
    summarySheetName || getPhase12BenchmarkImportDefaults_().summarySheetName
  ).trim();
  const sheet = getOrCreateSheetByName_(sheetName);
  const rows = buildBenchmarkImportSummaryRows_(summary);
  const rowCount = rows.length;
  const colCount = rows[0].length;

  sheet.clearContents();
  sheet.getRange(1, 1, rowCount, colCount).setValues(rows);
  sheet.autoResizeColumns(1, colCount);

  return {
    ok: true,
    sheetName: sheetName,
    rowCount: rowCount,
    columnCount: colCount
  };
}

function importBenchmarkResultFromDrive_(overrides) {
  const loaded = loadTransportTrialResultFromDrive_(overrides);
  const summary = buildBenchmarkImportSummary_(loaded);
  let summaryWriteResult = null;

  if (loaded.options.writeSummarySheet !== false) {
    summaryWriteResult = writeBenchmarkImportSummaryToSheet_(summary, loaded.options.summarySheetName);
  }

  return {
    ok: true,
    loaded: loaded,
    summary: summary,
    summaryWriteResult: summaryWriteResult
  };
}

function buildBenchmarkImportLogPayload_(imported, includeTransportResult) {
  const payload = {
    ok: true,
    selectionMode: imported.loaded.selectionMode,
    runFolderName: imported.loaded.runFolderName,
    artifactFileName: imported.loaded.artifactFileName,
    artifactFileId: imported.loaded.artifactFileId,
    artifactLastUpdated: imported.loaded.artifactLastUpdated,
    transportValidation: imported.loaded.transportValidation,
    summary: imported.summary,
    summaryWriteResult: imported.summaryWriteResult
  };

  if (includeTransportResult === true) {
    payload.transportResult = imported.loaded.transportResult;
  }

  return payload;
}

function debugInspectLatestBenchmarkResultFromDrive() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "LATEST",
    writeSummarySheet: false
  });

  Logger.log(JSON.stringify(buildBenchmarkImportLogPayload_(imported, false), null, 2));
}

function debugInspectSelectedBenchmarkResultFromDrive() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "SELECTED",
    writeSummarySheet: false
  });

  Logger.log(JSON.stringify(buildBenchmarkImportLogPayload_(imported, false), null, 2));
}

function runPrintLatestBenchmarkResultSummaryToSheet() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "LATEST",
    writeSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkImportLogPayload_(imported, false), null, 2));
}

function runPrintSelectedBenchmarkResultSummaryToSheet() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "SELECTED",
    writeSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkImportLogPayload_(imported, false), null, 2));
}

function runWriteLatestBenchmarkResultToSheet() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "LATEST",
    writeSummarySheet: true
  });

  writeTransportTrialResultToSheet_(imported.loaded.transportResult);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Latest benchmark result imported and written to Sheet1 rows 35-38.",
    selectionMode: imported.loaded.selectionMode,
    runFolderName: imported.loaded.runFolderName,
    artifactFileName: imported.loaded.artifactFileName,
    artifactFileId: imported.loaded.artifactFileId,
    summary: imported.summary,
    summaryWriteResult: imported.summaryWriteResult
  }, null, 2));
}

function runWriteSelectedBenchmarkResultToSheet() {
  const imported = importBenchmarkResultFromDrive_({
    selectionMode: "SELECTED",
    writeSummarySheet: true
  });

  writeTransportTrialResultToSheet_(imported.loaded.transportResult);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Selected benchmark result imported and written to Sheet1 rows 35-38.",
    selectionMode: imported.loaded.selectionMode,
    runFolderName: imported.loaded.runFolderName,
    artifactFileName: imported.loaded.artifactFileName,
    artifactFileId: imported.loaded.artifactFileId,
    summary: imported.summary,
    summaryWriteResult: imported.summaryWriteResult
  }, null, 2));
}
