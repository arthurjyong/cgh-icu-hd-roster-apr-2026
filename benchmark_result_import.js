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
    scorerFingerprint: transportResult.scorerFingerprint || null,
    scorerFingerprintShort: transportResult.scorerFingerprintShort || null,
    scorerFingerprintVersion: transportResult.scorerFingerprintVersion || null,
    scorerSource: transportResult.scorerSource || (bestScoring && bestScoring.scorerSource) || null,
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
    ["Scorer fingerprint", summary.scorerFingerprint],
    ["Scorer fingerprint short", summary.scorerFingerprintShort],
    ["Scorer fingerprint version", summary.scorerFingerprintVersion],
    ["Scorer source", summary.scorerSource],
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



function getPhase13CampaignImportPropertyKeys_() {
  return {
    selectionMode: "PHASE13_CAMPAIGN_IMPORT_SELECTION_MODE",
    selectedCampaignFolderName: "PHASE13_CAMPAIGN_IMPORT_SELECTED_CAMPAIGN_FOLDER_NAME",
    selectedArtifactFileName: "PHASE13_CAMPAIGN_IMPORT_SELECTED_ARTIFACT_FILE_NAME"
  };
}

function getPhase13CampaignImportDefaults_() {
  return {
    selectionMode: "LATEST",
    artifactFileName: "benchmark_campaign_report_v1.json",
    refreshSummarySheet: true
  };
}

function normalizePhase13CampaignImportSelectionMode_(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SELECTED") {
    return "SELECTED";
  }
  return "LATEST";
}

function normalizeBenchmarkTrialsWriteMode_(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "REPLACE") {
    return "REPLACE";
  }
  return "APPEND";
}

function getStoredPhase13CampaignImportSelection_() {
  const keys = getPhase13CampaignImportPropertyKeys_();
  const defaults = getPhase13CampaignImportDefaults_();
  const properties = PropertiesService.getScriptProperties();

  return {
    selectionMode: normalizePhase13CampaignImportSelectionMode_(
      properties.getProperty(keys.selectionMode) || defaults.selectionMode
    ),
    selectedCampaignFolderName: String(
      properties.getProperty(keys.selectedCampaignFolderName) || ""
    ).trim(),
    selectedArtifactFileName: String(
      properties.getProperty(keys.selectedArtifactFileName) || defaults.artifactFileName
    ).trim() || defaults.artifactFileName
  };
}

function persistPhase13CampaignImportSelection_(selection) {
  const keys = getPhase13CampaignImportPropertyKeys_();
  const defaults = getPhase13CampaignImportDefaults_();
  const properties = PropertiesService.getScriptProperties();

  const values = {};
  values[keys.selectionMode] = normalizePhase13CampaignImportSelectionMode_(
    selection && selection.selectionMode
  );
  values[keys.selectedCampaignFolderName] = selection && selection.selectedCampaignFolderName
    ? String(selection.selectedCampaignFolderName).trim()
    : "";
  values[keys.selectedArtifactFileName] = selection && selection.selectedArtifactFileName
    ? String(selection.selectedArtifactFileName).trim()
    : defaults.artifactFileName;

  properties.setProperties(values, false);
}

function setPhase13CampaignImportLatestSelection() {
  persistPhase13CampaignImportSelection_({
    selectionMode: "LATEST"
  });

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 13 campaign import selection set to LATEST.",
    selection: getStoredPhase13CampaignImportSelection_()
  }, null, 2));
}

function setPhase13CampaignImportSelectedCampaignFolder(campaignFolderName) {
  const trimmed = String(campaignFolderName || "").trim();
  if (!trimmed) {
    throw new Error("campaignFolderName is required.");
  }

  persistPhase13CampaignImportSelection_({
    selectionMode: "SELECTED",
    selectedCampaignFolderName: trimmed
  });

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 13 campaign import selection set to SELECTED.",
    selection: getStoredPhase13CampaignImportSelection_()
  }, null, 2));
}

function setPhase13CampaignImportSelectedArtifactFileName(artifactFileName) {
  const trimmed = String(artifactFileName || "").trim();
  if (!trimmed) {
    throw new Error("artifactFileName is required.");
  }

  const current = getStoredPhase13CampaignImportSelection_();
  current.selectedArtifactFileName = trimmed;
  persistPhase13CampaignImportSelection_(current);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 13 campaign import artifact filename updated.",
    selection: getStoredPhase13CampaignImportSelection_()
  }, null, 2));
}

function clearPhase13CampaignImportSelectedCampaignFolder() {
  const current = getStoredPhase13CampaignImportSelection_();
  current.selectedCampaignFolderName = "";
  persistPhase13CampaignImportSelection_(current);

  Logger.log(JSON.stringify({
    ok: true,
    message: "Phase 13 campaign import selected campaign folder cleared.",
    selection: getStoredPhase13CampaignImportSelection_()
  }, null, 2));
}

function debugGetPhase13CampaignImportSelection() {
  Logger.log(JSON.stringify({
    ok: true,
    selection: getStoredPhase13CampaignImportSelection_()
  }, null, 2));
}

function buildPhase13CampaignImportOptions_(overrides) {
  const defaults = getPhase13CampaignImportDefaults_();
  const stored = getStoredPhase13CampaignImportSelection_();
  const options = {
    selectionMode: stored.selectionMode,
    selectedCampaignFolderName: stored.selectedCampaignFolderName,
    selectedArtifactFileName: stored.selectedArtifactFileName,
    writeMode: "APPEND",
    refreshSummarySheet: defaults.refreshSummarySheet
  };

  const extra = overrides || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    options[keys[i]] = extra[keys[i]];
  }

  options.selectionMode = normalizePhase13CampaignImportSelectionMode_(options.selectionMode);
  options.selectedCampaignFolderName = String(options.selectedCampaignFolderName || "").trim();
  options.selectedArtifactFileName = String(
    options.selectedArtifactFileName || defaults.artifactFileName
  ).trim() || defaults.artifactFileName;
  options.writeMode = normalizeBenchmarkTrialsWriteMode_(options.writeMode);
  options.refreshSummarySheet = options.refreshSummarySheet !== false;

  return options;
}

function findSingleCampaignFolderByNameOrNull_(benchmarkRunsFolder, campaignFolderName) {
  const iterator = benchmarkRunsFolder.getFoldersByName(campaignFolderName);
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
        'Multiple benchmark campaign folders named "' + campaignFolderName + '" were found under benchmark_runs.'
    };
  }

  return {
    ok: true,
    folder: matches[0],
    matchCount: 1
  };
}

function findSingleFileByNameInFolder_(folder, fileName) {
  const iterator = folder.getFilesByName(fileName);
  const files = [];

  while (iterator.hasNext()) {
    files.push(iterator.next());
  }

  if (files.length === 0) {
    return {
      ok: false,
      message: 'File "' + fileName + '" not found in folder "' + folder.getName() + '".'
    };
  }

  if (files.length > 1) {
    return {
      ok: false,
      message: 'Multiple files named "' + fileName + '" were found in folder "' + folder.getName() + '".'
    };
  }

  return {
    ok: true,
    file: files[0]
  };
}

function chooseLatestBenchmarkCampaignReportFile_(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  let latest = candidates[0];
  let latestTime = latest.file.getLastUpdated().getTime();

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const candidateTime = candidate.file.getLastUpdated().getTime();

    if (candidateTime > latestTime) {
      latest = candidate;
      latestTime = candidateTime;
      continue;
    }

    if (candidateTime === latestTime) {
      if (String(candidate.campaignFolderName) > String(latest.campaignFolderName)) {
        latest = candidate;
        latestTime = candidateTime;
      }
    }
  }

  return latest;
}

function resolveSelectedBenchmarkCampaignReportFile_(options) {
  const benchmarkRunsFolder = getPhase12BenchmarkRunsFolder_();
  const campaignFolderName = options.selectedCampaignFolderName;
  const artifactFileName = options.selectedArtifactFileName;

  if (!campaignFolderName) {
    throw new Error(
      "SELECTED mode requires Script Property PHASE13_CAMPAIGN_IMPORT_SELECTED_CAMPAIGN_FOLDER_NAME."
    );
  }

  const folderMatch = findSingleCampaignFolderByNameOrNull_(benchmarkRunsFolder, campaignFolderName);
  if (folderMatch.ok !== true) {
    throw new Error(folderMatch.message || "Failed to resolve selected benchmark campaign folder.");
  }

  if (!folderMatch.folder) {
    throw new Error('Benchmark campaign folder not found: "' + campaignFolderName + '".');
  }

  const fileMatch = findSingleFileByNameInFolder_(folderMatch.folder, artifactFileName);
  if (fileMatch.ok !== true) {
    throw new Error(fileMatch.message || "Failed to resolve selected benchmark campaign report file.");
  }

  return {
    selectionMode: "SELECTED",
    benchmarkRunsFolderId: benchmarkRunsFolder.getId(),
    campaignFolder: folderMatch.folder,
    campaignFolderName: folderMatch.folder.getName(),
    file: fileMatch.file,
    fileName: fileMatch.file.getName()
  };
}

function resolveLatestBenchmarkCampaignReportFile_(options) {
  const benchmarkRunsFolder = getPhase12BenchmarkRunsFolder_();
  const artifactFileName = options.selectedArtifactFileName;
  const campaignFolders = benchmarkRunsFolder.getFolders();
  const candidates = [];

  while (campaignFolders.hasNext()) {
    const campaignFolder = campaignFolders.next();
    const fileMatch = findSingleFileByNameInFolder_(campaignFolder, artifactFileName);

    if (fileMatch.ok === true) {
      candidates.push({
        campaignFolder: campaignFolder,
        campaignFolderName: campaignFolder.getName(),
        file: fileMatch.file,
        fileName: fileMatch.file.getName()
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'No benchmark campaign report file named "' + artifactFileName + '" was found under benchmark_runs.'
    );
  }

  const latest = chooseLatestBenchmarkCampaignReportFile_(candidates);

  return {
    selectionMode: "LATEST",
    benchmarkRunsFolderId: benchmarkRunsFolder.getId(),
    campaignFolder: latest.campaignFolder,
    campaignFolderName: latest.campaignFolderName,
    file: latest.file,
    fileName: latest.fileName
  };
}

function resolveBenchmarkCampaignReportFile_(options) {
  if (options.selectionMode === "SELECTED") {
    return resolveSelectedBenchmarkCampaignReportFile_(options);
  }

  return resolveLatestBenchmarkCampaignReportFile_(options);
}

function isFiniteNumberValue_(value) {
  return typeof value === "number" && isFinite(value);
}

function isCampaignScopedBenchmarkRunId_(runId) {
  return /^cmp_/i.test(String(runId || "").trim());
}

function validateBenchmarkCampaignRun_(run, index) {
  const prefix = "runs[" + index + "]";

  if (!run || typeof run !== "object" || Array.isArray(run)) {
    return {
      ok: false,
      message: prefix + " must be an object."
    };
  }

  if (!String(run.runId || "").trim()) {
    return {
      ok: false,
      message: prefix + '.runId is required.'
    };
  }

  if (!isCampaignScopedBenchmarkRunId_(run.runId)) {
    return {
      ok: false,
      message: prefix + '.runId must use the campaign-scoped cmp_... format.'
    };
  }

  if (!isFiniteNumberValue_(run.trialCount)) {
    return {
      ok: false,
      message: prefix + '.trialCount must be a finite number.'
    };
  }

  if (!isFiniteNumberValue_(run.repeatIndex)) {
    return {
      ok: false,
      message: prefix + '.repeatIndex must be a finite number.'
    };
  }

  if (typeof run.ok !== "boolean") {
    return {
      ok: false,
      message: prefix + '.ok must be boolean.'
    };
  }

  if (run.scoring !== undefined && run.scoring !== null) {
    if (typeof run.scoring !== "object" || Array.isArray(run.scoring)) {
      return {
        ok: false,
        message: prefix + '.scoring must be an object when provided.'
      };
    }
  }

  return {
    ok: true
  };
}

function validateBenchmarkCampaignReport_(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return {
      ok: false,
      message: "Campaign report must be an object."
    };
  }

  if (report.contractVersion !== "benchmark_campaign_report_v1") {
    return {
      ok: false,
      message: 'Unsupported campaign report contractVersion: "' + report.contractVersion + '".'
    };
  }

  if (!report.campaign || typeof report.campaign !== "object" || Array.isArray(report.campaign)) {
    return {
      ok: false,
      message: "Campaign report is missing campaign metadata."
    };
  }

  if (!String(report.campaign.batchLabel || "").trim()) {
    return {
      ok: false,
      message: "Campaign report campaign.batchLabel is required."
    };
  }

  if (!Array.isArray(report.runs)) {
    return {
      ok: false,
      message: "Campaign report runs must be an array."
    };
  }

  const seenRunIds = {};

  for (let i = 0; i < report.runs.length; i++) {
    const currentRun = report.runs[i];
    const validation = validateBenchmarkCampaignRun_(currentRun, i);
    if (validation.ok !== true) {
      return validation;
    }

    const runIdKey = normalizeBenchmarkTrialsRunIdForCompare_(currentRun.runId);
    if (runIdKey) {
      if (seenRunIds[runIdKey]) {
        return {
          ok: false,
          message: 'Campaign report contains duplicate runId values: "' + currentRun.runId + '".'
        };
      }
      seenRunIds[runIdKey] = true;
    }
  }

  return {
    ok: true,
    runCount: report.runs.length
  };
}

function loadBenchmarkCampaignReportFromDrive_(overrides) {
  const options = buildPhase13CampaignImportOptions_(overrides);
  const resolved = resolveBenchmarkCampaignReportFile_(options);
  const rawText = readUtf8TextFromDriveFile_(resolved.file);
  const report = parseJsonOrThrow_(
    rawText,
    resolved.campaignFolderName + "/" + resolved.file.getName()
  );
  const validation = validateBenchmarkCampaignReport_(report);

  if (validation.ok !== true) {
    throw new Error(validation.message || "Imported benchmark campaign report failed validation.");
  }

  return {
    ok: true,
    options: options,
    selectionMode: resolved.selectionMode,
    benchmarkRunsFolderId: resolved.benchmarkRunsFolderId,
    campaignFolderId: resolved.campaignFolder.getId(),
    campaignFolderName: resolved.campaignFolderName,
    artifactFileId: resolved.file.getId(),
    artifactFileName: resolved.file.getName(),
    artifactLastUpdated: resolved.file.getLastUpdated(),
    artifactUrl: resolved.file.getUrl(),
    reportValidation: validation,
    report: report
  };
}

function safeStringOrBlank_(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}

function safeFiniteNumberOrBlank_(value) {
  return isFiniteNumberValue_(value) ? value : "";
}

function safeCampaignScoringComponentOrBlank_(scoring, componentKey) {
  const componentScores = scoring && scoring.componentScores && typeof scoring.componentScores === "object"
    && !Array.isArray(scoring.componentScores)
    ? scoring.componentScores
    : null;

  if (!componentScores) {
    return "";
  }

  return safeFiniteNumberOrBlank_(componentScores[componentKey]);
}

function buildBenchmarkTrialsRowsFromCampaignReport_(loaded, importTimestamp) {
  const report = loaded && loaded.report ? loaded.report : {};
  const campaign = report && report.campaign ? report.campaign : {};
  const runs = report && Array.isArray(report.runs) ? report.runs : [];
  const timestamp = importTimestamp || new Date();
  const campaignFolderName = loaded && loaded.campaignFolderName
    ? String(loaded.campaignFolderName).trim()
    : "";

  return runs.map(function(run) {
    const scoring = run && run.scoring && typeof run.scoring === "object" ? run.scoring : {};
    const rowObject = {
      ImportTimestamp: timestamp,
      CampaignBatchLabel: safeStringOrBlank_(campaign.batchLabel),
      CampaignFolderName: safeStringOrBlank_(campaignFolderName),
      SnapshotLabel: safeStringOrBlank_(run.snapshotFileName || campaign.snapshotFileName || ""),
      SnapshotFileSha256: safeStringOrBlank_(run.snapshotFileSha256 || campaign.snapshotFileSha256 || ""),
      TrialCount: safeFiniteNumberOrBlank_(run.trialCount),
      RepeatIndex: safeFiniteNumberOrBlank_(run.repeatIndex),
      RunId: safeStringOrBlank_(run.runId),
      Ok: run.ok === true,
      BestScore: safeFiniteNumberOrBlank_(run.bestScore),
      BestTrialIndex: safeFiniteNumberOrBlank_(run.bestTrialIndex),
      RuntimeMs: safeFiniteNumberOrBlank_(run.runtimeMs),
      RuntimeSec: safeFiniteNumberOrBlank_(run.runtimeSec),
      InvocationMode: safeStringOrBlank_(run.invocationMode),
      Seed: safeStringOrBlank_(run.seed),
      RunFolderName: safeStringOrBlank_(run.runFolderName),
      ArtifactFileName: safeStringOrBlank_(run.artifactFileName),
      ScorerFingerprint: safeStringOrBlank_(run.scorerFingerprint || (scoring && scoring.scorerFingerprint)),
      ScorerFingerprintShort: safeStringOrBlank_(run.scorerFingerprintShort || (scoring && scoring.scorerFingerprintShort)),
      ScorerFingerprintVersion: safeStringOrBlank_(run.scorerFingerprintVersion || (scoring && scoring.scorerFingerprintVersion)),
      ScorerSource: safeStringOrBlank_(run.scorerSource || (scoring && scoring.scorerSource)),
      MeanPoints: safeFiniteNumberOrBlank_(scoring.meanPoints),
      StandardDeviation: safeFiniteNumberOrBlank_(scoring.standardDeviation),
      Range: safeFiniteNumberOrBlank_(scoring.range),
      TotalScore: safeFiniteNumberOrBlank_(
        isFiniteNumberValue_(scoring.totalScore) ? scoring.totalScore : run.bestScore
      ),
      PointBalanceGlobal: safeCampaignScoringComponentOrBlank_(scoring, "pointBalanceGlobal"),
      PointBalanceWithinSection: safeCampaignScoringComponentOrBlank_(scoring, "pointBalanceWithinSection"),
      SpacingPenalty: safeCampaignScoringComponentOrBlank_(scoring, "spacingPenalty"),
      CrReward: safeCampaignScoringComponentOrBlank_(scoring, "crReward"),
      DualEligibleIcuBonus: safeCampaignScoringComponentOrBlank_(scoring, "dualEligibleIcuBonus"),
      StandbyAdjacencyPenalty: safeCampaignScoringComponentOrBlank_(scoring, "standbyAdjacencyPenalty"),
      StandbyCountFairnessPenalty: safeCampaignScoringComponentOrBlank_(scoring, "standbyCountFairnessPenalty"),
      PreLeavePenalty: safeCampaignScoringComponentOrBlank_(scoring, "preLeavePenalty"),
      UnfilledPenalty: safeCampaignScoringComponentOrBlank_(scoring, "unfilledPenalty"),
      SummaryMessage: safeStringOrBlank_(run.summaryMessage),
      FailureMessage: safeStringOrBlank_(run.failureMessage)
    };

    return buildBenchmarkTrialsRowFromObject_(rowObject);
  });
}

function replaceBenchmarkTrialsRows_(rows) {
  const sheet = ensureBenchmarkTrialsSheet_();
  const header = getBenchmarkTrialsHeader_();

  writeBenchmarkSheetHeaderRow_(sheet, header);

  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  return {
    ok: true,
    sheetName: sheet.getName(),
    writeMode: "REPLACE",
    rowCount: rows ? rows.length : 0
  };
}

function appendBenchmarkTrialsRows_(rows) {
  const appendRows = Array.isArray(rows) ? rows : [];
  const dedupeResult = filterBenchmarkTrialsRowsForAppendDeduping_(appendRows);
  appendBenchmarkRows_(dedupeResult.rowsToAppend);

  return {
    ok: true,
    sheetName: getBenchmarkTrialsSheetName_(),
    writeMode: "APPEND",
    rowCount: dedupeResult.rowsToAppend.length,
    skippedDuplicateRowCount: dedupeResult.skippedDuplicateRowCount
  };
}

function buildBenchmarkTrialsFallbackDedupeKey_(rowObject) {
  const row = rowObject || {};
  return [
    trimmedStringOrBlank_(row.CampaignFolderName),
    trimmedStringOrBlank_(row.RunFolderName),
    trimmedStringOrBlank_(row.ArtifactFileName),
    trimmedStringOrBlank_(row.TrialCount),
    trimmedStringOrBlank_(row.RepeatIndex)
  ].join("|").toLowerCase();
}

function buildBenchmarkTrialsRunIdOrFallbackDedupeKey_(rowObject) {
  const row = rowObject || {};
  const runIdKey = normalizeBenchmarkTrialsRunIdForCompare_(row.RunId);
  if (runIdKey) {
    return "runid:" + runIdKey;
  }

  return "fallback:" + buildBenchmarkTrialsFallbackDedupeKey_(row);
}

function buildBenchmarkTrialsRowObjectFromArray_(rowValues) {
  const values = Array.isArray(rowValues) ? rowValues : [];
  const header = getBenchmarkTrialsHeader_();
  const rowObject = {};

  for (let i = 0; i < header.length; i++) {
    rowObject[header[i]] = i < values.length ? values[i] : "";
  }

  return rowObject;
}

function filterBenchmarkTrialsRowsForAppendDeduping_(rows) {
  const appendRows = Array.isArray(rows) ? rows : [];
  if (appendRows.length === 0) {
    return {
      rowsToAppend: [],
      skippedDuplicateRowCount: 0
    };
  }

  const existing = readBenchmarkTrialsRowsAsObjects_();
  const existingRows = existing && Array.isArray(existing.rows) ? existing.rows : [];
  const seenKeys = {};

  for (let i = 0; i < existingRows.length; i++) {
    const key = buildBenchmarkTrialsRunIdOrFallbackDedupeKey_(existingRows[i]);
    if (key) {
      seenKeys[key] = true;
    }
  }

  const rowsToAppend = [];
  let skippedDuplicateRowCount = 0;

  for (let j = 0; j < appendRows.length; j++) {
    const rowArray = appendRows[j];
    const rowObject = buildBenchmarkTrialsRowObjectFromArray_(rowArray);
    const key = buildBenchmarkTrialsRunIdOrFallbackDedupeKey_(rowObject);

    if (key && seenKeys[key]) {
      skippedDuplicateRowCount += 1;
      continue;
    }

    if (key) {
      seenKeys[key] = true;
    }
    rowsToAppend.push(rowArray);
  }

  return {
    rowsToAppend: rowsToAppend,
    skippedDuplicateRowCount: skippedDuplicateRowCount
  };
}

function writeBenchmarkCampaignRowsToTrialsSheet_(rows, options) {
  const settings = options || {};
  const writeMode = normalizeBenchmarkTrialsWriteMode_(settings.writeMode);
  let writeResult;

  if (writeMode === "REPLACE") {
    writeResult = replaceBenchmarkTrialsRows_(rows);
  } else {
    writeResult = appendBenchmarkTrialsRows_(rows);
  }

  let summaryWriteResult = null;
  if (settings.refreshSummarySheet !== false) {
    refreshBenchmarkReviewSheet();
    summaryWriteResult = {
      ok: true,
      sheetNames: [
        getBenchmarkReviewSheetName_()
      ]
    };
  }

  return {
    ok: true,
    writeMode: writeMode,
    trialsWriteResult: writeResult,
    summaryWriteResult: summaryWriteResult
  };
}

function buildBenchmarkCampaignImportSummary_(loaded) {
  const report = loaded.report || {};
  const campaign = report.campaign || {};
  const summary = report.summary || {};
  const winner = report.winner || {};

  return {
    importTimestamp: new Date(),
    selectionMode: loaded.selectionMode,
    campaignFolderName: loaded.campaignFolderName,
    artifactFileName: loaded.artifactFileName,
    artifactFileId: loaded.artifactFileId,
    artifactLastUpdated: loaded.artifactLastUpdated,
    artifactUrl: loaded.artifactUrl,
    contractVersion: report.contractVersion || null,
    batchLabel: campaign.batchLabel || null,
    snapshotFileName: campaign.snapshotFileName || null,
    snapshotFileSha256: campaign.snapshotFileSha256 || null,
    plannedRunCount: campaign.plannedRunCount || null,
    importedRunCount: Array.isArray(report.runs) ? report.runs.length : 0,
    completedCount: summary.completedCount || null,
    okCount: summary.okCount || null,
    failedCount: summary.failedCount || null,
    winnerRunId: winner.runId || null,
    winnerTrialCount: winner.trialCount || null,
    winnerRepeatIndex: winner.repeatIndex || null,
    winnerBestScore: winner.bestScore || null,
    winnerScorerFingerprint: winner.scorerFingerprint || null,
    winnerScorerFingerprintShort: winner.scorerFingerprintShort || null,
    winnerScorerFingerprintVersion: winner.scorerFingerprintVersion || null,
    winnerScorerSource: winner.scorerSource || null
  };
}

function importBenchmarkCampaignReportToTrialsSheet_(overrides) {
  const loaded = loadBenchmarkCampaignReportFromDrive_(overrides);
  const importTimestamp = new Date();
  const rows = buildBenchmarkTrialsRowsFromCampaignReport_(loaded, importTimestamp);
  const writeResult = writeBenchmarkCampaignRowsToTrialsSheet_(rows, {
    writeMode: loaded.options.writeMode,
    refreshSummarySheet: loaded.options.refreshSummarySheet
  });
  const summary = buildBenchmarkCampaignImportSummary_(loaded);

  return {
    ok: true,
    loaded: loaded,
    summary: summary,
    rows: rows,
    writeResult: writeResult
  };
}

function buildBenchmarkCampaignImportLogPayload_(imported) {
  return {
    ok: true,
    selectionMode: imported.loaded.selectionMode,
    campaignFolderName: imported.loaded.campaignFolderName,
    artifactFileName: imported.loaded.artifactFileName,
    artifactFileId: imported.loaded.artifactFileId,
    artifactLastUpdated: imported.loaded.artifactLastUpdated,
    reportValidation: imported.loaded.reportValidation,
    summary: imported.summary,
    writeResult: imported.writeResult
  };
}

function debugInspectLatestBenchmarkCampaignReportFromDrive() {
  const loaded = loadBenchmarkCampaignReportFromDrive_({
    selectionMode: "LATEST"
  });

  Logger.log(JSON.stringify({
    ok: true,
    selectionMode: loaded.selectionMode,
    campaignFolderName: loaded.campaignFolderName,
    artifactFileName: loaded.artifactFileName,
    artifactFileId: loaded.artifactFileId,
    artifactLastUpdated: loaded.artifactLastUpdated,
    artifactUrl: loaded.artifactUrl,
    reportValidation: loaded.reportValidation,
    contractVersion: loaded.report && loaded.report.contractVersion,
    batchLabel: loaded.report && loaded.report.campaign ? loaded.report.campaign.batchLabel : null,
    snapshotFileSha256: loaded.report && loaded.report.campaign ? loaded.report.campaign.snapshotFileSha256 : null,
    runCount: loaded.report && Array.isArray(loaded.report.runs) ? loaded.report.runs.length : 0
  }, null, 2));
}

function debugInspectSelectedBenchmarkCampaignReportFromDrive() {
  const loaded = loadBenchmarkCampaignReportFromDrive_({
    selectionMode: "SELECTED"
  });

  Logger.log(JSON.stringify({
    ok: true,
    selectionMode: loaded.selectionMode,
    campaignFolderName: loaded.campaignFolderName,
    artifactFileName: loaded.artifactFileName,
    artifactFileId: loaded.artifactFileId,
    artifactLastUpdated: loaded.artifactLastUpdated,
    artifactUrl: loaded.artifactUrl,
    reportValidation: loaded.reportValidation,
    contractVersion: loaded.report && loaded.report.contractVersion,
    batchLabel: loaded.report && loaded.report.campaign ? loaded.report.campaign.batchLabel : null,
    snapshotFileSha256: loaded.report && loaded.report.campaign ? loaded.report.campaign.snapshotFileSha256 : null,
    runCount: loaded.report && Array.isArray(loaded.report.runs) ? loaded.report.runs.length : 0
  }, null, 2));
}

function runAppendLatestBenchmarkCampaignReportToTrialsSheet() {
  const imported = importBenchmarkCampaignReportToTrialsSheet_({
    selectionMode: "LATEST",
    writeMode: "APPEND",
    refreshSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkCampaignImportLogPayload_(imported), null, 2));
  return imported;
}

function runAppendSelectedBenchmarkCampaignReportToTrialsSheet() {
  const imported = importBenchmarkCampaignReportToTrialsSheet_({
    selectionMode: "SELECTED",
    writeMode: "APPEND",
    refreshSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkCampaignImportLogPayload_(imported), null, 2));
  return imported;
}

function runReplaceBenchmarkTrialsWithLatestCampaignReport() {
  const imported = importBenchmarkCampaignReportToTrialsSheet_({
    selectionMode: "LATEST",
    writeMode: "REPLACE",
    refreshSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkCampaignImportLogPayload_(imported), null, 2));
  return imported;
}

function runReplaceBenchmarkTrialsWithSelectedCampaignReport() {
  const imported = importBenchmarkCampaignReportToTrialsSheet_({
    selectionMode: "SELECTED",
    writeMode: "REPLACE",
    refreshSummarySheet: true
  });

  Logger.log(JSON.stringify(buildBenchmarkCampaignImportLogPayload_(imported), null, 2));
  return imported;
}


function normalizeBenchmarkTrialsRowObjectCell_(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}

function getRequiredBenchmarkTrialsWritebackColumns_() {
  return [
    "CampaignFolderName",
    "RunFolderName",
    "ArtifactFileName",
    "BestScore",
    "Ok"
  ];
}

function readBenchmarkTrialsRowsAsObjects_() {
  const sheet = ensureBenchmarkTrialsSheet_();
  const expectedHeader = getBenchmarkTrialsHeader_();
  const lastRow = sheet.getLastRow();
  const actualHeader = expectedHeader.length > 0
    ? sheet.getRange(1, 1, 1, expectedHeader.length).getValues()[0]
    : [];
  const headerMap = buildHeaderIndexMapFromRow_(actualHeader);
  const requiredColumns = getRequiredBenchmarkTrialsWritebackColumns_();

  for (let i = 0; i < requiredColumns.length; i++) {
    if (typeof headerMap[requiredColumns[i]] !== "number") {
      throw new Error(
        'BENCHMARK_TRIALS header is missing required column "' + requiredColumns[i] + '". ' +
        "Update benchmark_trials.js and rerun resetBenchmarkSheets() plus a REPLACE campaign import."
      );
    }
  }

  if (lastRow <= 1) {
    return {
      ok: true,
      sheetName: sheet.getName(),
      rowCount: 0,
      rows: []
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, expectedHeader.length).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    const sourceRow = values[i];
    const rowObject = {
      _rowNumber: i + 2
    };
    let hasAnyValue = false;

    for (let j = 0; j < expectedHeader.length; j++) {
      const headerKey = expectedHeader[j];
      const cellValue = normalizeBenchmarkTrialsRowObjectCell_(sourceRow[j]);
      rowObject[headerKey] = cellValue;
      if (cellValue !== "") {
        hasAnyValue = true;
      }
    }

    if (hasAnyValue) {
      rows.push(rowObject);
    }
  }

  return {
    ok: true,
    sheetName: sheet.getName(),
    rowCount: rows.length,
    rows: rows
  };
}

function readBenchmarkReviewRowsAsObjects_() {
  const sheet = ensureBenchmarkReviewSheet_();
  const expectedHeader = getBenchmarkReviewHeader_();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return {
      ok: true,
      sheetName: sheet.getName(),
      rowCount: 0,
      rows: []
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, expectedHeader.length).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    const sourceRow = values[i];
    const rowObject = {
      _rowNumber: i + 2
    };
    let hasAnyValue = false;

    for (let j = 0; j < expectedHeader.length; j++) {
      const headerKey = expectedHeader[j];
      const cellValue = normalizeBenchmarkTrialsRowObjectCell_(sourceRow[j]);
      rowObject[headerKey] = cellValue;
      if (cellValue !== "") {
        hasAnyValue = true;
      }
    }

    if (hasAnyValue) {
      rows.push(rowObject);
    }
  }

  return {
    ok: true,
    sheetName: sheet.getName(),
    rowCount: rows.length,
    rows: rows
  };
}

function normalizeBenchmarkTrialsBoolean_(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TRUE") {
    return true;
  }
  if (normalized === "FALSE") {
    return false;
  }
  return null;
}

function trimmedStringOrBlank_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function normalizeBenchmarkTrialsRunIdForCompare_(value) {
  return trimmedStringOrBlank_(value).toLowerCase();
}

function numericValueOrNull_(value) {
  return isFiniteNumberValue_(value) ? Number(value) : null;
}

function buildDuplicateBenchmarkTrialsRunIdError_(duplicates, contextLabel) {
  const entries = Array.isArray(duplicates) ? duplicates : [];
  const label = contextLabel || 'valid writeback candidates';
  const details = entries.slice(0, 3).map(function(entry) {
    return 'RunId "' + entry.runId + '" rows ' + entry.rows.join(', ');
  }).join('; ');

  return new Error(
    'BENCHMARK_TRIALS contains duplicate RunId values among ' + label + '. ' +
    'RunId is now expected to be globally unique across campaigns, so duplicates indicate legacy retained rows or an import integrity problem. ' +
    (details ? 'Duplicates: ' + details + '.' : '')
  );
}

function collectDuplicateBenchmarkTrialsRunIds_(candidates) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const map = {};
  const order = [];

  for (let i = 0; i < rows.length; i++) {
    const candidate = rows[i] || {};
    const normalized = trimmedStringOrBlank_(candidate.RunIdNormalized);
    if (!normalized) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(map, normalized)) {
      map[normalized] = {
        runId: trimmedStringOrBlank_(candidate.RunId) || normalized,
        rows: []
      };
      order.push(normalized);
    }

    map[normalized].rows.push(Number(candidate._rowNumber || 0));
  }

  return order.map(function(key) {
    return map[key];
  }).filter(function(entry) {
    return entry.rows.length > 1;
  });
}

function assertNoDuplicateBenchmarkTrialsRunIds_(candidates, contextLabel) {
  const duplicates = collectDuplicateBenchmarkTrialsRunIds_(candidates);
  if (duplicates.length > 0) {
    throw buildDuplicateBenchmarkTrialsRunIdError_(duplicates, contextLabel);
  }
}

function buildBenchmarkTrialsWritebackCandidates_(rowObjects) {
  const candidates = [];
  const rows = Array.isArray(rowObjects) ? rowObjects : [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const okValue = normalizeBenchmarkTrialsBoolean_(row.Ok);
    const campaignFolderName = trimmedStringOrBlank_(row.CampaignFolderName);
    const runFolderName = trimmedStringOrBlank_(row.RunFolderName);
    const artifactFileName = trimmedStringOrBlank_(row.ArtifactFileName);
    const bestScore = numericValueOrNull_(row.BestScore);
    const runId = trimmedStringOrBlank_(row.RunId);

    if (okValue !== true) {
      continue;
    }
    if (!campaignFolderName || !runFolderName || !artifactFileName) {
      continue;
    }
    if (bestScore === null) {
      continue;
    }
    if (!isCampaignScopedBenchmarkRunId_(runId)) {
      continue;
    }

    const candidate = {};
    const keys = Object.keys(row);
    for (let j = 0; j < keys.length; j++) {
      candidate[keys[j]] = row[keys[j]];
    }

    candidate.CampaignFolderName = campaignFolderName;
    candidate.RunFolderName = runFolderName;
    candidate.ArtifactFileName = artifactFileName;
    candidate.BestScore = bestScore;
    candidate.TrialCountNumber = numericValueOrNull_(row.TrialCount);
    candidate.RepeatIndexNumber = numericValueOrNull_(row.RepeatIndex);
    candidate.RunIdNormalized = normalizeBenchmarkTrialsRunIdForCompare_(runId);
    candidate.InvocationModeNormalized = trimmedStringOrBlank_(row.InvocationMode);

    candidates.push(candidate);
  }

  return candidates;
}

function resolveSingleCampaignFolderInTrialsSheet_(candidates) {
  const unique = {};
  const ordered = [];
  const rows = Array.isArray(candidates) ? candidates : [];

  for (let i = 0; i < rows.length; i++) {
    const name = trimmedStringOrBlank_(rows[i].CampaignFolderName);
    if (!name) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(unique, name)) {
      unique[name] = true;
      ordered.push(name);
    }
  }

  if (ordered.length === 0) {
    throw new Error(
      "BENCHMARK_TRIALS has no valid writeback candidates. Import at least one campaign report first."
    );
  }

  if (ordered.length > 1) {
    throw new Error(
      "BENCHMARK_TRIALS contains multiple CampaignFolderName values among valid writeback candidates."
    );
  }

  return ordered[0];
}

function buildBenchmarkTrialsWritebackComparisonGroups_(candidates) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const groups = {};
  const orderedKeys = [];

  for (let i = 0; i < rows.length; i++) {
    const candidate = rows[i] || {};
    const identity = buildBenchmarkSummaryRowIdentity_(candidate, i);
    const comparisonGroupKey = trimmedStringOrBlank_(identity.comparisonGroupKey);

    if (!comparisonGroupKey) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(groups, comparisonGroupKey)) {
      groups[comparisonGroupKey] = {
        comparisonGroupKey: comparisonGroupKey,
        comparisonStatus: trimmedStringOrBlank_(identity.comparisonStatus),
        comparisonStatusReason: trimmedStringOrBlank_(identity.comparisonStatusReason),
        snapshotFileSha256: trimmedStringOrBlank_(identity.snapshotFileSha256),
        scorerFingerprint: trimmedStringOrBlank_(identity.scorerFingerprint),
        candidates: []
      };
      orderedKeys.push(comparisonGroupKey);
    }

    groups[comparisonGroupKey].candidates.push(candidate);
  }

  return orderedKeys.map(function(key) {
    return groups[key];
  });
}

function buildBenchmarkTrialsWritebackScopeRecoveryMessage_(requestedComparisonGroupKey) {
  const requested = trimmedStringOrBlank_(requestedComparisonGroupKey);

  if (requested) {
    return (
      'Update or clear the Default Writeback ComparisonGroupKey control in SCORER_CONFIG, then choose an explicit RunId or a current ComparisonGroupKey.'
    );
  }

  return (
    'Set the Default Writeback ComparisonGroupKey control in SCORER_CONFIG to a valid ComparisonGroupKey, or choose an explicit RunId instead.'
  );
}

function formatBenchmarkTrialsWritebackComparisonGroupForError_(group) {
  const current = group || {};
  const candidateRows = Array.isArray(current.candidates) ? current.candidates : [];
  const sampleRunIds = candidateRows.slice(0, 3).map(function(candidate) {
    return trimmedStringOrBlank_(candidate.RunId);
  }).filter(function(runId) {
    return !!runId;
  });
  const parts = [
    current.comparisonStatus || "UNKNOWN",
    current.comparisonGroupKey || "(missing key)",
    "rows=" + candidateRows.length
  ];

  if (current.snapshotFileSha256) {
    parts.push("snapshot=" + current.snapshotFileSha256);
  }

  if (current.scorerFingerprint) {
    parts.push("scorer=" + current.scorerFingerprint);
  }

  if (sampleRunIds.length > 0) {
    parts.push("sampleRunIds=" + sampleRunIds.join(", "));
  }

  return parts.join(", ");
}

function resolveBenchmarkTrialsWritebackScope_(candidates, scopeOptions) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const options = scopeOptions || {};
  const enforceStrictComparisonGroup = options.enforceStrictComparisonGroup !== false;
  const requestedComparisonGroupKey = trimmedStringOrBlank_(options.comparisonGroupKey);
  const scopeSelectionSource = trimmedStringOrBlank_(options.scopeSelectionSource);
  const isUiDefaultScope =
    scopeSelectionSource === 'BENCHMARK_UI_CONTROL_PANEL' ||
    scopeSelectionSource === 'UI_DEFAULT_COMPARISON_GROUP_KEY';
  const recoveryMessage = buildBenchmarkTrialsWritebackScopeRecoveryMessage_(requestedComparisonGroupKey);

  if (rows.length === 0) {
    throw new Error(
      "BENCHMARK_TRIALS has no valid writeback candidates. Import at least one campaign report first."
    );
  }

  const groups = buildBenchmarkTrialsWritebackComparisonGroups_(rows);
  let selectedGroup = null;
  let selectionMode = "AUTO_SINGLE_GROUP_ONLY";

  if (requestedComparisonGroupKey) {
    const scopedGroup = groups.filter(function(group) {
      return trimmedStringOrBlank_(group.comparisonGroupKey) === requestedComparisonGroupKey;
    });

    if (scopedGroup.length === 0) {
      if (isUiDefaultScope) {
        const strictGroups = groups.filter(function(group) {
          return group && group.comparisonStatus === "STRICT";
        });
        if (strictGroups.length === 1) {
          selectedGroup = strictGroups[0];
          selectionMode = "AUTO_RECOVERED_FROM_STALE_UI_DEFAULT";
        } else {
          throw new Error(
            'Saved default comparison group "' + requestedComparisonGroupKey + '" is stale and no single strict fallback group could be chosen automatically. ' +
            'Found ' + strictGroups.length + ' strict group(s). ' +
            recoveryMessage +
            ' Groups in scope: ' +
            groups.slice(0, 3).map(formatBenchmarkTrialsWritebackComparisonGroupForError_).join(" | ") +
            (groups.length > 3 ? " | ..." : "")
          );
        }
      } else {
        throw new Error(
          'Requested comparison group "' + requestedComparisonGroupKey + '" was not found among valid BENCHMARK_TRIALS writeback candidates. ' +
          'The saved scope may be stale after a REPLACE import or no longer present among valid rows. ' +
          recoveryMessage
        );
      }
    } else {
      selectedGroup = scopedGroup[0];
      selectionMode = "EXPLICIT_COMPARISON_GROUP_KEY";
    }
  } else {
    if (groups.length > 1) {
      throw new Error(
        "Default benchmark winner writeback is blocked because valid BENCHMARK_TRIALS candidates span multiple comparison groups (" +
        groups.length +
        "). Automatic writeback only proceeds when exactly one valid comparison group is in scope. " +
        recoveryMessage +
        " Groups in scope: " +
        groups.slice(0, 3).map(formatBenchmarkTrialsWritebackComparisonGroupForError_).join(" | ") +
        (groups.length > 3 ? " | ..." : "")
      );
    }

    selectedGroup = groups[0];
  }

  if (enforceStrictComparisonGroup !== false && (!selectedGroup || selectedGroup.comparisonStatus !== "STRICT")) {
    throw new Error(
      "Default benchmark winner writeback is blocked because the selected comparison group is not valid for automatic selection. " +
      "Automatic writeback requires complete comparable metadata (SnapshotFileSha256 + ScorerFingerprint) on all candidate rows. " +
      recoveryMessage +
      " Group in scope: " +
      formatBenchmarkTrialsWritebackComparisonGroupForError_(selectedGroup)
    );
  }

  return {
    groupCount: groups.length,
    selectedGroup: selectedGroup,
    scopedCandidates: selectedGroup.candidates.slice(),
    selectionMode: selectionMode
  };
}

function compareBenchmarkTrialsWritebackCandidates_(left, right) {
  const scoreDiff = left.BestScore - right.BestScore;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const leftTrialCount = left.TrialCountNumber === null ? Number.POSITIVE_INFINITY : left.TrialCountNumber;
  const rightTrialCount = right.TrialCountNumber === null ? Number.POSITIVE_INFINITY : right.TrialCountNumber;
  if (leftTrialCount !== rightTrialCount) {
    return leftTrialCount - rightTrialCount;
  }

  const leftRepeat = left.RepeatIndexNumber === null ? Number.POSITIVE_INFINITY : left.RepeatIndexNumber;
  const rightRepeat = right.RepeatIndexNumber === null ? Number.POSITIVE_INFINITY : right.RepeatIndexNumber;
  if (leftRepeat !== rightRepeat) {
    return leftRepeat - rightRepeat;
  }

  const runIdCompare = left.RunIdNormalized.localeCompare(right.RunIdNormalized);
  if (runIdCompare !== 0) {
    return runIdCompare;
  }

  return Number(left._rowNumber || 0) - Number(right._rowNumber || 0);
}

function pickBestBenchmarkTrialsWritebackCandidate_(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(
      "BENCHMARK_TRIALS has no valid writeback candidates. Import at least one campaign report first."
    );
  }

  const sorted = candidates.slice().sort(compareBenchmarkTrialsWritebackCandidates_);
  return sorted[0];
}

function findSingleChildFolderByNameOrThrow_(parentFolder, childFolderName, contextLabel) {
  const iterator = parentFolder.getFoldersByName(childFolderName);
  const matches = [];

  while (iterator.hasNext() && matches.length < 2) {
    matches.push(iterator.next());
  }

  if (matches.length === 0) {
    throw new Error('No folder named "' + childFolderName + '" was found in ' + contextLabel + '.');
  }

  if (matches.length > 1 || iterator.hasNext()) {
    throw new Error('Multiple folders named "' + childFolderName + '" were found in ' + contextLabel + '.');
  }

  return matches[0];
}

function findSingleFileByNameOrThrow_(parentFolder, fileName, contextLabel) {
  const iterator = parentFolder.getFilesByName(fileName);
  const matches = [];

  while (iterator.hasNext() && matches.length < 2) {
    matches.push(iterator.next());
  }

  if (matches.length === 0) {
    throw new Error('No file named "' + fileName + '" was found in ' + contextLabel + '.');
  }

  if (matches.length > 1 || iterator.hasNext()) {
    throw new Error('Multiple files named "' + fileName + '" were found in ' + contextLabel + '.');
  }

  return matches[0];
}

function resolveBenchmarkRunArtifactFromTrialsRow_(rowObject, resolverOptions) {
  const options = resolverOptions || {};
  const cache = options.cache || null;
  const benchmarkRunsFolder = cache && cache.benchmarkRunsFolder
    ? cache.benchmarkRunsFolder
    : getPhase12BenchmarkRunsFolder_();
  if (cache && !cache.benchmarkRunsFolder) {
    cache.benchmarkRunsFolder = benchmarkRunsFolder;
  }

  const campaignFolderName = trimmedStringOrBlank_(rowObject && rowObject.CampaignFolderName);
  const runFolderName = trimmedStringOrBlank_(rowObject && rowObject.RunFolderName);
  const artifactFileName = trimmedStringOrBlank_(rowObject && rowObject.ArtifactFileName);
  const campaignCacheKey = campaignFolderName.toLowerCase();
  const runFolderCacheKey = campaignCacheKey + '|runs|' + runFolderName.toLowerCase();
  const artifactCacheKey = runFolderCacheKey + '|artifact|' + artifactFileName.toLowerCase();

  let campaignFolder = cache && cache.campaignFolders && Object.prototype.hasOwnProperty.call(cache.campaignFolders, campaignCacheKey)
    ? cache.campaignFolders[campaignCacheKey]
    : null;
  if (!campaignFolder) {
    campaignFolder = findSingleChildFolderByNameOrThrow_(
      benchmarkRunsFolder,
      campaignFolderName,
      'benchmark_runs'
    );
    if (cache && cache.campaignFolders) {
      cache.campaignFolders[campaignCacheKey] = campaignFolder;
    }
  }

  let runsFolder = cache && cache.runsFolders && Object.prototype.hasOwnProperty.call(cache.runsFolders, campaignCacheKey)
    ? cache.runsFolders[campaignCacheKey]
    : null;
  if (!runsFolder) {
    runsFolder = findSingleChildFolderByNameOrThrow_(
      campaignFolder,
      'runs',
      'campaign folder "' + campaignFolder.getName() + '"'
    );
    if (cache && cache.runsFolders) {
      cache.runsFolders[campaignCacheKey] = runsFolder;
    }
  }

  let runFolder = cache && cache.runFolders && Object.prototype.hasOwnProperty.call(cache.runFolders, runFolderCacheKey)
    ? cache.runFolders[runFolderCacheKey]
    : null;
  if (!runFolder) {
    runFolder = findSingleChildFolderByNameOrThrow_(
      runsFolder,
      runFolderName,
      'campaign folder "' + campaignFolder.getName() + '" runs/'
    );
    if (cache && cache.runFolders) {
      cache.runFolders[runFolderCacheKey] = runFolder;
    }
  }

  let artifactFile = cache && cache.artifactFiles && Object.prototype.hasOwnProperty.call(cache.artifactFiles, artifactCacheKey)
    ? cache.artifactFiles[artifactCacheKey]
    : null;
  if (!artifactFile) {
    artifactFile = findSingleFileByNameOrThrow_(
      runFolder,
      artifactFileName,
      'run folder "' + runFolder.getName() + '"'
    );
    if (cache && cache.artifactFiles) {
      cache.artifactFiles[artifactCacheKey] = artifactFile;
    }
  }

  return {
    benchmarkRunsFolderId: benchmarkRunsFolder.getId(),
    campaignFolderId: campaignFolder.getId(),
    campaignFolderName: campaignFolder.getName(),
    runsFolderId: runsFolder.getId(),
    runFolderId: runFolder.getId(),
    runFolderName: runFolder.getName(),
    runFolder: runFolder,
    artifactFileId: artifactFile.getId(),
    artifactFileName: artifactFile.getName(),
    artifactLastUpdated: artifactFile.getLastUpdated(),
    artifactUrl: artifactFile.getUrl(),
    artifactFile: artifactFile
  };
}

function numericValuesApproximatelyEqual_(left, right) {
  if (!isFiniteNumberValue_(left) || !isFiniteNumberValue_(right)) {
    return false;
  }

  return Math.abs(Number(left) - Number(right)) <= 1e-9;
}

function readJsonDriveFileOrThrow_(file, contextLabel) {
  const rawText = readUtf8TextFromDriveFile_(file);
  return parseJsonOrThrow_(rawText, contextLabel);
}

function loadBenchmarkRunManifestFromResolvedArtifact_(resolvedArtifact) {
  const runFolder = resolvedArtifact && resolvedArtifact.runFolder ? resolvedArtifact.runFolder : null;
  if (!runFolder) {
    throw new Error("Resolved benchmark run folder is required to load run manifest metadata.");
  }

  const manifestFile = findSingleFileByNameOrThrow_(
    runFolder,
    'run_manifest.json',
    'run folder "' + runFolder.getName() + '"'
  );

  return {
    manifestFileId: manifestFile.getId(),
    manifestFileName: manifestFile.getName(),
    manifestFile: manifestFile,
    manifest: readJsonDriveFileOrThrow_(
      manifestFile,
      resolvedArtifact.campaignFolderName + '/runs/' + resolvedArtifact.runFolderName + '/run_manifest.json'
    )
  };
}

function buildBenchmarkRunComparisonMetadataFromArtifacts_(transportResult, manifestDocument) {
  const transport = transportResult || {};
  const manifest = manifestDocument || {};
  const manifestSnapshot = manifest && manifest.snapshot && typeof manifest.snapshot === "object"
    ? manifest.snapshot
    : {};
  const bestTrial = transport && transport.bestTrial && typeof transport.bestTrial === "object"
    ? transport.bestTrial
    : {};
  const scoringSummary = bestTrial && bestTrial.scoringSummary && typeof bestTrial.scoringSummary === "object"
    ? bestTrial.scoringSummary
    : {};
  const bestScoring = transport && transport.bestScoring && typeof transport.bestScoring === "object"
    ? transport.bestScoring
    : {};

  return {
    snapshotFileSha256: trimmedStringOrBlank_(manifestSnapshot.fileSha256),
    scorerFingerprint: safeScorerFingerprintFieldFromObjects_(
      "scorerFingerprint",
      transport,
      bestScoring,
      scoringSummary
    ),
    scorerFingerprintShort: safeScorerFingerprintFieldFromObjects_(
      "scorerFingerprintShort",
      transport,
      bestScoring,
      scoringSummary
    ),
    scorerFingerprintVersion: safeScorerFingerprintFieldFromObjects_(
      "scorerFingerprintVersion",
      transport,
      bestScoring,
      scoringSummary
    )
  };
}

function validateBenchmarkTrialsRowComparisonMetadata_(rowObject, comparisonMetadata, resolvedArtifact) {
  const issues = [];
  const rowSnapshotFileSha256 = trimmedStringOrBlank_(rowObject && rowObject.SnapshotFileSha256);
  const rowScorerFingerprint = trimmedStringOrBlank_(rowObject && rowObject.ScorerFingerprint);
  const metadata = comparisonMetadata || {};
  const artifactSnapshotFileSha256 = trimmedStringOrBlank_(metadata.snapshotFileSha256);
  const artifactScorerFingerprint = trimmedStringOrBlank_(metadata.scorerFingerprint);
  const resolvedArtifactPath =
    trimmedStringOrBlank_(resolvedArtifact && resolvedArtifact.campaignFolderName) +
    '/runs/' +
    trimmedStringOrBlank_(resolvedArtifact && resolvedArtifact.runFolderName) +
    '/' +
    trimmedStringOrBlank_(resolvedArtifact && resolvedArtifact.artifactFileName);

  if (rowSnapshotFileSha256 && rowSnapshotFileSha256 !== artifactSnapshotFileSha256) {
    issues.push(
      'Selected BENCHMARK_TRIALS SnapshotFileSha256 does not match resolved run manifest snapshot.fileSha256. ' +
      'Row SnapshotFileSha256="' + rowSnapshotFileSha256 +
      '", manifest snapshot.fileSha256="' + artifactSnapshotFileSha256 +
      '", artifact="' + resolvedArtifactPath + '".'
    );
  }

  if (rowScorerFingerprint && rowScorerFingerprint !== artifactScorerFingerprint) {
    issues.push(
      'Selected BENCHMARK_TRIALS ScorerFingerprint does not match resolved benchmark artifact scorer fingerprint. ' +
      'Row ScorerFingerprint="' + rowScorerFingerprint +
      '", artifact scorerFingerprint="' + artifactScorerFingerprint +
      '", artifact="' + resolvedArtifactPath + '".'
    );
  }

  return issues.length > 0
    ? {
        ok: false,
        message: issues[0],
        issues: issues
      }
    : {
        ok: true
      };
}

function validateBenchmarkTrialsRowAgainstTransportResult_(rowObject, transportResult, resolvedArtifact) {
  const issues = [];
  const transportBestTrial = transportResult && transportResult.bestTrial ? transportResult.bestTrial : {};
  const transportTrialSpec = transportResult && transportResult.trialSpec ? transportResult.trialSpec : {};
  const transportInvocationMode = transportResult ? trimmedStringOrBlank_(transportResult.invocationMode) : "";
  const rowRunId = trimmedStringOrBlank_(rowObject.RunId);
  const rowTrialCount = isFiniteNumberValue_(rowObject.TrialCount) ? Number(rowObject.TrialCount) : null;
  const transportTrialCount = isFiniteNumberValue_(transportTrialSpec.trialCount)
    ? Number(transportTrialSpec.trialCount)
    : null;
  const resolvedArtifactPath =
    trimmedStringOrBlank_(resolvedArtifact.campaignFolderName) +
    '/runs/' +
    trimmedStringOrBlank_(resolvedArtifact.runFolderName) +
    '/' +
    trimmedStringOrBlank_(resolvedArtifact.artifactFileName);

  if (trimmedStringOrBlank_(rowObject.RunFolderName) !== trimmedStringOrBlank_(resolvedArtifact.runFolderName)) {
    issues.push("Selected BENCHMARK_TRIALS RunFolderName does not match resolved Drive run folder.");
  }

  if (trimmedStringOrBlank_(rowObject.ArtifactFileName) !== trimmedStringOrBlank_(resolvedArtifact.artifactFileName)) {
    issues.push("Selected BENCHMARK_TRIALS ArtifactFileName does not match resolved Drive artifact file.");
  }

  if (rowTrialCount !== null && transportTrialCount !== null) {
    if (rowTrialCount !== transportTrialCount) {
      issues.push(
        'Selected BENCHMARK_TRIALS TrialCount does not match transport trialSpec.trialCount. ' +
        'RunId="' + rowRunId + '", row TrialCount=' + rowTrialCount +
        ', artifact trialSpec.trialCount=' + transportTrialCount +
        ', artifact="' + resolvedArtifactPath + '". ' +
        'This usually indicates stale Drive artifacts or a report/artifact provenance mismatch, not a sheet writeback bug.'
      );
    }
  }

  if (isFiniteNumberValue_(rowObject.BestScore) && isFiniteNumberValue_(transportBestTrial.score)) {
    if (!numericValuesApproximatelyEqual_(rowObject.BestScore, transportBestTrial.score)) {
      issues.push("Selected BENCHMARK_TRIALS BestScore does not match transport bestTrial.score.");
    }
  }

  if (trimmedStringOrBlank_(rowObject.InvocationMode) && transportInvocationMode) {
    const rowInvocationMode = normalizeBenchmarkInvocationModeForComparison_(rowObject.InvocationMode);
    const transportInvocationModeForCompare = normalizeBenchmarkInvocationModeForComparison_(transportInvocationMode);

    if (
      rowInvocationMode.mode
      && transportInvocationModeForCompare.mode
      && rowInvocationMode.mode !== transportInvocationModeForCompare.mode
      && rowInvocationMode.isKnownTrialComputeMode
      && transportInvocationModeForCompare.isKnownTrialComputeMode
    ) {
      issues.push(
        'Selected BENCHMARK_TRIALS InvocationMode does not match transport invocationMode. '
        + 'Row InvocationMode="' + rowInvocationMode.raw + '", transport invocationMode="'
        + transportInvocationModeForCompare.raw + '".'
      );
    }
  }

  return issues.length > 0
    ? {
        ok: false,
        message: issues[0],
        issues: issues
      }
    : {
        ok: true
      };
}

function normalizeBenchmarkInvocationModeForComparison_(value) {
  const raw = trimmedStringOrBlank_(value);
  const mode = raw.toUpperCase();
  const knownTrialComputeModes = {
    LOCAL_DIRECT: true,
    LOCAL_SIMULATED_EXTERNAL: true,
    EXTERNAL_HTTP: true
  };

  return {
    raw: raw,
    mode: mode,
    isKnownTrialComputeMode: !!knownTrialComputeModes[mode]
  };
}

function createBenchmarkWritebackDriveResolverCache_() {
  return {
    benchmarkRunsFolder: null,
    campaignFolders: {},
    runsFolders: {},
    runFolders: {},
    artifactFiles: {}
  };
}

function normalizeBenchmarkWritebackValidationMode_(value, selectionStrategy) {
  const strategy = normalizeBenchmarkTrialsWritebackSelectionStrategy_(selectionStrategy);
  const normalized = trimmedStringOrBlank_(value).toUpperCase();

  if (normalized === 'STRICT_AUDIT' || strategy === 'STRICT_FULL_SCAN') {
    return 'STRICT_AUDIT';
  }

  return 'LEAN_OPERATIONAL';
}

function loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(rowObject, loadOptions) {
  const options = loadOptions || {};
  const validationMode = normalizeBenchmarkWritebackValidationMode_(
    options.validationMode,
    options.selectionStrategy
  );
  const resolvedArtifact = resolveBenchmarkRunArtifactFromTrialsRow_(rowObject, {
    cache: options.resolverCache || null
  });
  const transportResult = readJsonDriveFileOrThrow_(
    resolvedArtifact.artifactFile,
    resolvedArtifact.campaignFolderName + '/runs/' + resolvedArtifact.runFolderName + '/' + resolvedArtifact.artifactFileName
  );
  const transportValidation = validateTransportTrialResult_(transportResult);

  if (transportValidation.ok !== true) {
    throw new Error(transportValidation.message || "Resolved benchmark run artifact failed validation.");
  }

  const writebackValidation = validateTransportTrialResultForWriteback_(transportResult);
  if (writebackValidation.ok !== true) {
    throw new Error(writebackValidation.message || "Resolved benchmark run artifact is not writeback-safe.");
  }

  const rowArtifactValidation = validateBenchmarkTrialsRowAgainstTransportResult_(
    rowObject,
    transportResult,
    resolvedArtifact
  );
  if (rowArtifactValidation.ok !== true) {
    throw new Error(rowArtifactValidation.message || "BENCHMARK_TRIALS row does not match resolved artifact.");
  }

  if (validationMode !== 'STRICT_AUDIT') {
    return {
      resolvedArtifact: resolvedArtifact,
      manifestInfo: null,
      comparisonMetadata: null,
      transportValidation: transportValidation,
      writebackValidation: writebackValidation,
      comparisonMetadataValidation: null,
      rowArtifactValidation: rowArtifactValidation,
      transportResult: transportResult,
      validationMode: validationMode
    };
  }

  const manifestInfo = loadBenchmarkRunManifestFromResolvedArtifact_(resolvedArtifact);
  const comparisonMetadata = buildBenchmarkRunComparisonMetadataFromArtifacts_(
    transportResult,
    manifestInfo.manifest
  );
  const comparisonMetadataValidation = validateBenchmarkTrialsRowComparisonMetadata_(
    rowObject,
    comparisonMetadata,
    resolvedArtifact
  );
  if (comparisonMetadataValidation.ok !== true) {
    throw new Error(
      comparisonMetadataValidation.message || "BENCHMARK_TRIALS comparison metadata does not match resolved artifact provenance."
    );
  }

  return {
    resolvedArtifact: resolvedArtifact,
    manifestInfo: manifestInfo,
    comparisonMetadata: comparisonMetadata,
    transportValidation: transportValidation,
    writebackValidation: writebackValidation,
    comparisonMetadataValidation: comparisonMetadataValidation,
    rowArtifactValidation: rowArtifactValidation,
    transportResult: transportResult,
    validationMode: validationMode
  };
}

function loadAndValidateBenchmarkRunArtifactForWriteback_(rowObject) {
  return loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(rowObject, {
    validationMode: 'STRICT_AUDIT',
    selectionStrategy: 'STRICT_FULL_SCAN'
  });
}

function resolveBenchmarkTrialsDefaultWritebackScopeOptions_(scopeOptions) {
  const options = scopeOptions || {};
  const requestedComparisonGroupKey = trimmedStringOrBlank_(options.comparisonGroupKey);

  if (requestedComparisonGroupKey) {
    return {
      comparisonGroupKey: requestedComparisonGroupKey,
      scopeSelectionMode: 'EXPLICIT_COMPARISON_GROUP_KEY',
      scopeSelectionSource: trimmedStringOrBlank_(options.scopeSelectionSource) || 'CALLER_OVERRIDE'
    };
  }

  const uiComparisonGroupKey = trimmedStringOrBlank_(readBenchmarkUiDefaultWritebackComparisonGroupKeyIfAvailable_());
  if (uiComparisonGroupKey) {
    return {
      comparisonGroupKey: uiComparisonGroupKey,
      scopeSelectionMode: 'EXPLICIT_COMPARISON_GROUP_KEY',
      scopeSelectionSource: 'BENCHMARK_UI_CONTROL_PANEL'
    };
  }

  return {
    comparisonGroupKey: '',
    scopeSelectionMode: 'AUTO_SINGLE_GROUP_ONLY',
    scopeSelectionSource: 'AUTO_SINGLE_GROUP_ONLY'
  };
}

function normalizeBenchmarkTrialsWritebackSelectionStrategy_(value) {
  const normalized = trimmedStringOrBlank_(value).toUpperCase();
  if (normalized === 'STRICT_FULL_SCAN') {
    return 'STRICT_FULL_SCAN';
  }
  return 'FAST_ASC_VALIDATE';
}

function getBenchmarkTrialsWritebackOperationalDefaults_() {
  return {
    maxAttempts: 15,
    maxFailureSamples: 5
  };
}

function normalizePositiveIntegerOption_(value, fallbackValue) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallbackValue;
}

function normalizeBenchmarkTrialsWritebackExecutionOptions_(scopeOptions, strategy) {
  const defaults = getBenchmarkTrialsWritebackOperationalDefaults_();
  const options = scopeOptions || {};
  const normalizedStrategy = normalizeBenchmarkTrialsWritebackSelectionStrategy_(strategy || options.selectionStrategy);

  return {
    selectionStrategy: normalizedStrategy,
    validationMode: normalizeBenchmarkWritebackValidationMode_(options.validationMode, normalizedStrategy),
    maxAttempts: normalizePositiveIntegerOption_(options.maxAttempts, defaults.maxAttempts),
    maxFailureSamples: normalizePositiveIntegerOption_(options.maxFailureSamples, defaults.maxFailureSamples)
  };
}

function toFixedDedupeBestScoreKey_(value) {
  const numeric = numericValueOrNull_(value);
  if (numeric === null) {
    return '';
  }
  return Number(numeric).toFixed(9);
}

function buildSearchSheetDuplicateGroups_(sheetRows) {
  const rows = Array.isArray(sheetRows) ? sheetRows : [];
  const exactGroups = {};
  const runIdGroups = {};
  const exactOrder = [];
  const runIdOrder = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const runIdKey = normalizeBenchmarkTrialsRunIdForCompare_(row.RunId);
    if (!runIdKey) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(runIdGroups, runIdKey)) {
      runIdGroups[runIdKey] = [];
      runIdOrder.push(runIdKey);
    }
    runIdGroups[runIdKey].push(row);

    const scoreKey = toFixedDedupeBestScoreKey_(row.BestScore);
    if (!scoreKey) {
      continue;
    }

    const runFolder = trimmedStringOrBlank_(row.RunFolderName).toLowerCase();
    const artifactFile = trimmedStringOrBlank_(row.ArtifactFileName).toLowerCase();
    const exactKey = runIdKey + '|' + scoreKey + '|' + runFolder + '|' + artifactFile;
    if (!Object.prototype.hasOwnProperty.call(exactGroups, exactKey)) {
      exactGroups[exactKey] = [];
      exactOrder.push(exactKey);
    }
    exactGroups[exactKey].push(row);
  }

  return {
    exactOrder: exactOrder,
    exactGroups: exactGroups,
    runIdOrder: runIdOrder,
    runIdGroups: runIdGroups
  };
}

function chooseCanonicalConflictDuplicateRow_(rows, resolverCache, executionOptions) {
  const candidates = Array.isArray(rows) ? rows : [];
  const validRows = [];
  const invalidRows = [];
  const unknownRows = [];
  const failures = [];

  function classifyBenchmarkConflictValidationError_(message) {
    const normalized = trimmedStringOrBlank_(message).toLowerCase();
    if (!normalized) {
      return 'UNKNOWN';
    }

    const transientMarkers = [
      'service invoked too many times',
      'service unavailable',
      'timed out',
      'timeout',
      'rate limit',
      'quota',
      'try again later',
      'internal error',
      'temporarily unavailable'
    ];

    for (let i = 0; i < transientMarkers.length; i++) {
      if (normalized.indexOf(transientMarkers[i]) >= 0) {
        return 'UNKNOWN';
      }
    }

    return 'INVALID';
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(candidate, {
        validationMode: 'LEAN_OPERATIONAL',
        selectionStrategy: executionOptions.selectionStrategy,
        resolverCache: resolverCache
      });
      validRows.push(candidate);
    } catch (err) {
      const reason = String(err && err.message ? err.message : err);
      const classification = classifyBenchmarkConflictValidationError_(reason);
      failures.push({
        rowNumber: candidate._rowNumber || null,
        runId: trimmedStringOrBlank_(candidate.RunId),
        reason: reason,
        classification: classification
      });
      if (classification === 'INVALID') {
        invalidRows.push(candidate);
      } else {
        unknownRows.push(candidate);
      }
    }
  }

  if (validRows.length > 0) {
    return {
      decision: 'KEEP_CANONICAL',
      canonical: validRows[0],
      validRows: validRows,
      invalidRows: invalidRows,
      unknownRows: unknownRows,
      failures: failures
    };
  }

  if (invalidRows.length > 0 && unknownRows.length === 0) {
    return {
      decision: 'DELETE_ALL_INVALID',
      canonical: null,
      validRows: validRows,
      invalidRows: invalidRows,
      unknownRows: unknownRows,
      failures: failures
    };
  }

  return {
    decision: 'SKIP_INCONCLUSIVE',
    canonical: null,
    validRows: validRows,
    invalidRows: invalidRows,
    unknownRows: unknownRows,
    failures: failures
  };
}

function autoCleanBenchmarkSearchSheetDuplicates_() {
  const trialsData = readBenchmarkTrialsRowsAsObjects_();
  const progressData = readBenchmarkReviewRowsAsObjects_();
  const executionOptions = normalizeBenchmarkTrialsWritebackExecutionOptions_({}, 'FAST_ASC_VALIDATE');
  const resolverCache = createBenchmarkWritebackDriveResolverCache_();

  const trialsRows = Array.isArray(trialsData.rows) ? trialsData.rows : [];
  const progressRows = Array.isArray(progressData.rows) ? progressData.rows : [];
  const grouped = buildSearchSheetDuplicateGroups_(trialsRows);
  const deleteRowNumbersMap = {};
  const stats = {
    exactDuplicateDeletionsCount: 0,
    conflictDuplicateChecksCount: 0,
    conflictResolutionsPerformed: 0,
    conflictDeleteAllRunIdCount: 0,
    conflictInconclusiveSkipCount: 0
  };
  const conflictProgressPlanByRunId = {};

  for (let i = 0; i < grouped.exactOrder.length; i++) {
    const key = grouped.exactOrder[i];
    const rows = grouped.exactGroups[key] || [];
    if (rows.length <= 1) {
      continue;
    }
    for (let j = 1; j < rows.length; j++) {
      deleteRowNumbersMap[rows[j]._rowNumber] = true;
      stats.exactDuplicateDeletionsCount += 1;
    }
  }

  for (let r = 0; r < grouped.runIdOrder.length; r++) {
    const runIdKey = grouped.runIdOrder[r];
    const runRowsAll = grouped.runIdGroups[runIdKey] || [];
    const remainingRunRows = runRowsAll.filter(function(row) {
      return !deleteRowNumbersMap[row._rowNumber];
    });
    if (remainingRunRows.length <= 1) {
      continue;
    }

    stats.conflictDuplicateChecksCount += 1;
    const resolution = chooseCanonicalConflictDuplicateRow_(
      remainingRunRows,
      resolverCache,
      executionOptions
    );

    if (!resolution || resolution.decision === 'SKIP_INCONCLUSIVE') {
      stats.conflictInconclusiveSkipCount += 1;
      continue;
    }

    const canonicalRowNumber = resolution && resolution.canonical ? resolution.canonical._rowNumber : null;
    const runIdPlanKey = runIdKey;
    if (resolution.decision === 'DELETE_ALL_INVALID') {
      conflictProgressPlanByRunId[runIdPlanKey] = {
        action: 'DELETE_ALL_PROGRESS_ROWS'
      };
      stats.conflictDeleteAllRunIdCount += 1;
      for (let c = 0; c < remainingRunRows.length; c++) {
        deleteRowNumbersMap[remainingRunRows[c]._rowNumber] = true;
        stats.conflictResolutionsPerformed += 1;
      }
      continue;
    }

    conflictProgressPlanByRunId[runIdPlanKey] = {
      action: 'KEEP_CANONICAL_PROGRESS_ROW',
      canonicalBestScoreKey: toFixedDedupeBestScoreKey_(resolution.canonical.BestScore)
    };
    for (let c = 0; c < remainingRunRows.length; c++) {
      const row = remainingRunRows[c];
      if (row._rowNumber !== canonicalRowNumber) {
        deleteRowNumbersMap[row._rowNumber] = true;
        stats.conflictResolutionsPerformed += 1;
      }
    }
  }

  const deleteRowNumbers = Object.keys(deleteRowNumbersMap).map(function(value) {
    return Number(value);
  }).filter(function(value) {
    return Number.isFinite(value) && value >= 2;
  }).sort(function(left, right) {
    return right - left;
  });

  if (deleteRowNumbers.length > 0) {
    const sheet = ensureBenchmarkTrialsSheet_();
    for (let d = 0; d < deleteRowNumbers.length; d++) {
      sheet.deleteRow(deleteRowNumbers[d]);
    }
  }

  const progressDeleteRows = [];
  const progressRowsByRunId = {};
  const progressRunIdOrder = [];
  for (let p = 0; p < progressRows.length; p++) {
    const row = progressRows[p] || {};
    const runIdKey = normalizeBenchmarkTrialsRunIdForCompare_(row.RunId);
    if (!runIdKey) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(progressRowsByRunId, runIdKey)) {
      progressRowsByRunId[runIdKey] = [];
      progressRunIdOrder.push(runIdKey);
    }
    progressRowsByRunId[runIdKey].push(row);
  }

  for (let i = 0; i < progressRunIdOrder.length; i++) {
    const runIdKey = progressRunIdOrder[i];
    const rows = progressRowsByRunId[runIdKey] || [];
    if (rows.length <= 1) {
      continue;
    }

    const plan = conflictProgressPlanByRunId[runIdKey] || null;
    if (plan && plan.action === 'DELETE_ALL_PROGRESS_ROWS') {
      for (let j = 0; j < rows.length; j++) {
        progressDeleteRows.push(Number(rows[j]._rowNumber || 0));
      }
      continue;
    }

    if (plan && plan.action === 'KEEP_CANONICAL_PROGRESS_ROW') {
      const canonicalBestScoreKey = plan.canonicalBestScoreKey || '';
      let canonicalRowNumber = null;
      for (let j = 0; j < rows.length; j++) {
        if (toFixedDedupeBestScoreKey_(rows[j].BestScore) === canonicalBestScoreKey) {
          canonicalRowNumber = Number(rows[j]._rowNumber || 0);
          break;
        }
      }
      if (canonicalRowNumber === null) {
        canonicalRowNumber = Number(rows[0]._rowNumber || 0);
      }
      for (let j = 0; j < rows.length; j++) {
        const rowNumber = Number(rows[j]._rowNumber || 0);
        if (rowNumber !== canonicalRowNumber) {
          progressDeleteRows.push(rowNumber);
        }
      }
      continue;
    }

    const seenScoreKeys = {};
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const scoreKey = toFixedDedupeBestScoreKey_(row.BestScore);
      const dedupeKey = runIdKey + '|' + scoreKey;
      if (seenScoreKeys[dedupeKey]) {
        progressDeleteRows.push(Number(row._rowNumber || 0));
      } else {
        seenScoreKeys[dedupeKey] = true;
      }
    }
  }

  if (progressDeleteRows.length > 0) {
    const progressSheet = ensureBenchmarkReviewSheet_();
    progressDeleteRows.sort(function(left, right) {
      return right - left;
    });
    for (let x = 0; x < progressDeleteRows.length; x++) {
      if (progressDeleteRows[x] >= 2) {
        progressSheet.deleteRow(progressDeleteRows[x]);
      }
    }
  }

  return {
    ok: true,
    exactDuplicateDeletionsCount: stats.exactDuplicateDeletionsCount,
    conflictDuplicateChecksCount: stats.conflictDuplicateChecksCount,
    conflictResolutionsPerformed: stats.conflictResolutionsPerformed,
    conflictDeleteAllRunIdCount: stats.conflictDeleteAllRunIdCount,
    conflictInconclusiveSkipCount: stats.conflictInconclusiveSkipCount,
    searchLogDeletedRowCount: deleteRowNumbers.length,
    searchProgressDeletedRowCount: progressDeleteRows.length
  };
}

function buildValidatedBenchmarkTrialsWritebackCandidatesForDefaultScope_(candidates) {
  const rows = Array.isArray(candidates) ? candidates : [];

  return rows.map(function(candidate) {
    const loadedArtifact = loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(candidate, {
      validationMode: 'STRICT_AUDIT',
      selectionStrategy: 'STRICT_FULL_SCAN'
    });
    const comparisonMetadata = loadedArtifact && loadedArtifact.comparisonMetadata
      ? loadedArtifact.comparisonMetadata
      : {};

    candidate.SnapshotFileSha256 = trimmedStringOrBlank_(comparisonMetadata.snapshotFileSha256);
    candidate.ScorerFingerprint = trimmedStringOrBlank_(comparisonMetadata.scorerFingerprint);
    candidate.ScorerFingerprintShort = trimmedStringOrBlank_(comparisonMetadata.scorerFingerprintShort);
    candidate.ScorerFingerprintVersion = trimmedStringOrBlank_(comparisonMetadata.scorerFingerprintVersion);
    candidate._loadedArtifactForWriteback = loadedArtifact;
    return candidate;
  });
}

function verifyCandidateBestScoreAgainstArtifact_(candidate, loadedArtifact) {
  const rowScore = numericValueOrNull_(candidate && candidate.BestScore);
  const transportResult = loadedArtifact && loadedArtifact.transportResult ? loadedArtifact.transportResult : {};
  const bestTrial = transportResult && transportResult.bestTrial ? transportResult.bestTrial : {};
  const artifactScore = numericValueOrNull_(bestTrial.score);

  if (rowScore === null || artifactScore === null) {
    return {
      ok: false,
      message: 'BestScore verification failed due to non-finite row/artifact score values.'
    };
  }

  if (!numericValuesApproximatelyEqual_(rowScore, artifactScore)) {
    return {
      ok: false,
      message: 'Selected BENCHMARK_TRIALS BestScore does not match transport bestTrial.score. row=' + rowScore + ' artifact=' + artifactScore + '.'
    };
  }

  return {
    ok: true,
    rowScore: rowScore,
    artifactScore: artifactScore
  };
}

function selectBestBenchmarkTrialsWinnerForWritebackFastAscValidate_(trialsData, candidates, scopeContext) {
  const scope = scopeContext && scopeContext.scope ? scopeContext.scope : {};
  const resolvedScopeOptions = scopeContext && scopeContext.resolvedScopeOptions
    ? scopeContext.resolvedScopeOptions
    : {};
  const executionOptions = scopeContext && scopeContext.executionOptions
    ? scopeContext.executionOptions
    : normalizeBenchmarkTrialsWritebackExecutionOptions_({}, 'FAST_ASC_VALIDATE');
  const scopedCandidates = Array.isArray(scope.scopedCandidates) ? scope.scopedCandidates : [];
  const sortedCandidates = scopedCandidates.slice().sort(compareBenchmarkTrialsWritebackCandidates_);
  const failures = [];
  const maxAttempts = Math.min(sortedCandidates.length, executionOptions.maxAttempts);
  const resolverCache = scopeContext && scopeContext.resolverCache
    ? scopeContext.resolverCache
    : createBenchmarkWritebackDriveResolverCache_();

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = sortedCandidates[i];

    try {
      const loadedArtifact = loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(candidate, {
        validationMode: executionOptions.validationMode,
        selectionStrategy: executionOptions.selectionStrategy,
        resolverCache: resolverCache
      });
      const scoreVerification = verifyCandidateBestScoreAgainstArtifact_(candidate, loadedArtifact);
      if (scoreVerification.ok !== true) {
        failures.push({
          rowNumber: candidate._rowNumber || null,
          runId: trimmedStringOrBlank_(candidate.RunId),
          reason: scoreVerification.message || 'BestScore verification failed.'
        });
        continue;
      }

      candidate._loadedArtifactForWriteback = loadedArtifact;
      return {
        ok: true,
        trialsSheetName: trialsData.sheetName,
        trialsDataRowCount: trialsData.rowCount,
        candidateCount: candidates.length,
        comparisonGroupCount: isFiniteNumberValue_(scope.groupCount) ? Number(scope.groupCount) : null,
        comparisonGroup: scope.selectedGroup || null,
        requestedComparisonGroupKey: resolvedScopeOptions.comparisonGroupKey || '',
        scopeSelectionMode: scope.selectionMode || resolvedScopeOptions.scopeSelectionMode || 'AUTO_SINGLE_GROUP_ONLY',
        scopeSelectionSource: resolvedScopeOptions.scopeSelectionSource || 'AUTO_SINGLE_GROUP_ONLY',
        campaignFolderName: trimmedStringOrBlank_(candidate.CampaignFolderName),
        selectionScopeDescription: 'FIRST_VALID_ASCENDING_BEST_SCORE',
        selectionStrategy: 'FAST_ASC_VALIDATE',
        attemptedCandidateCount: i + 1,
        maxAttempts: executionOptions.maxAttempts,
        candidateRow: candidate,
        loadedArtifact: loadedArtifact,
        transportResult: loadedArtifact.transportResult,
        failureSummary: {
          attemptedRunIds: failures.map(function(entry) { return entry.runId; }),
          failureSamples: failures.slice(0, executionOptions.maxFailureSamples)
        }
      };
    } catch (err) {
      failures.push({
        rowNumber: candidate._rowNumber || null,
        runId: trimmedStringOrBlank_(candidate.RunId),
        reason: String(err && err.message ? err.message : err)
      });
    }
  }

  throw new Error(
    'FAST_ASC_VALIDATE failed to find a writeback-safe winner after checking ' +
    maxAttempts +
    ' of ' +
    sortedCandidates.length +
    ' candidate(s). Sample failures: ' +
    failures.slice(0, executionOptions.maxFailureSamples).map(function(entry) {
      return 'row ' + entry.rowNumber + ' runId "' + entry.runId + '" -> ' + entry.reason;
    }).join(' | ')
  );
}

function selectBestBenchmarkTrialsWinnerForWriteback_(scopeOptions) {
  const strategy = normalizeBenchmarkTrialsWritebackSelectionStrategy_(
    scopeOptions && scopeOptions.selectionStrategy
  );
  const executionOptions = normalizeBenchmarkTrialsWritebackExecutionOptions_(scopeOptions, strategy);
  const dedupeSummary = autoCleanBenchmarkSearchSheetDuplicates_();
  const trialsData = readBenchmarkTrialsRowsAsObjects_();
  const candidates = buildBenchmarkTrialsWritebackCandidates_(trialsData.rows);
  const resolvedScopeOptions = resolveBenchmarkTrialsDefaultWritebackScopeOptions_(scopeOptions);
  const scope = resolveBenchmarkTrialsWritebackScope_(candidates, {
    comparisonGroupKey: resolvedScopeOptions.comparisonGroupKey,
    scopeSelectionSource: resolvedScopeOptions.scopeSelectionSource,
    enforceStrictComparisonGroup: strategy === 'STRICT_FULL_SCAN'
  });
  const resolverCache = createBenchmarkWritebackDriveResolverCache_();

  if (strategy === 'FAST_ASC_VALIDATE') {
    const fastSelection = selectBestBenchmarkTrialsWinnerForWritebackFastAscValidate_(trialsData, candidates, {
      scope: scope,
      resolvedScopeOptions: resolvedScopeOptions,
      executionOptions: executionOptions,
      resolverCache: resolverCache
    });
    fastSelection.dedupeSummary = dedupeSummary;
    return fastSelection;
  }

  const validatedCandidates = buildValidatedBenchmarkTrialsWritebackCandidatesForDefaultScope_(candidates);
  const strictScope = resolveBenchmarkTrialsWritebackScope_(validatedCandidates, {
    comparisonGroupKey: resolvedScopeOptions.comparisonGroupKey,
    scopeSelectionSource: resolvedScopeOptions.scopeSelectionSource,
    enforceStrictComparisonGroup: true
  });
  // Automatic green-button writeback intentionally evaluates the entire scoped candidate set
  // (which may span multiple campaigns) after comparison-group scoping has been resolved.
  const bestCandidate = pickBestBenchmarkTrialsWritebackCandidate_(strictScope.scopedCandidates);
  const loadedArtifact = bestCandidate._loadedArtifactForWriteback || loadAndValidateBenchmarkRunArtifactForWritebackWithMode_(bestCandidate, {
    validationMode: 'STRICT_AUDIT',
    selectionStrategy: 'STRICT_FULL_SCAN',
    resolverCache: resolverCache
  });

  return {
    ok: true,
    trialsSheetName: trialsData.sheetName,
    trialsDataRowCount: trialsData.rowCount,
    candidateCount: candidates.length,
    comparisonGroupCount: strictScope.groupCount,
    comparisonGroup: strictScope.selectedGroup,
    requestedComparisonGroupKey: resolvedScopeOptions.comparisonGroupKey || '',
    scopeSelectionMode: strictScope.selectionMode || resolvedScopeOptions.scopeSelectionMode || 'AUTO_SINGLE_GROUP_ONLY',
    scopeSelectionSource: resolvedScopeOptions.scopeSelectionSource || 'AUTO_SINGLE_GROUP_ONLY',
    campaignFolderName: trimmedStringOrBlank_(bestCandidate.CampaignFolderName),
    selectionScopeDescription: 'BEST_OF_ALL_SCOPED_VALID_ROWS',
    selectionStrategy: 'STRICT_FULL_SCAN',
    dedupeSummary: dedupeSummary,
    candidateRow: bestCandidate,
    loadedArtifact: loadedArtifact,
    transportResult: loadedArtifact.transportResult
  };
}

function buildBestBenchmarkTrialsWinnerWritebackLogPayload_(selection, includeTransportResult) {
  const candidate = selection.candidateRow || {};
  const resolved = selection.loadedArtifact ? selection.loadedArtifact.resolvedArtifact : {};
  const transportResult = selection.transportResult || {};
  const bestTrial = transportResult.bestTrial || {};
  const trialSpec = transportResult.trialSpec || {};
  const bestAllocation = transportResult.bestAllocation || {};

  const payload = {
    ok: true,
    trialsSheetName: selection.trialsSheetName,
    trialsDataRowCount: selection.trialsDataRowCount,
    candidateCount: selection.candidateCount,
    comparisonGroupCount: selection.comparisonGroupCount,
    requestedComparisonGroupKey: selection.requestedComparisonGroupKey || null,
    scopeSelectionMode: selection.scopeSelectionMode || null,
    scopeSelectionSource: selection.scopeSelectionSource || null,
    selectionScopeDescription: selection.selectionScopeDescription || null,
    comparisonGroupKey: selection.comparisonGroup ? selection.comparisonGroup.comparisonGroupKey || null : null,
    comparisonStatus: selection.comparisonGroup ? selection.comparisonGroup.comparisonStatus || null : null,
    comparisonStatusReason: selection.comparisonGroup ? selection.comparisonGroup.comparisonStatusReason || null : null,
    chosenRowNumber: candidate._rowNumber || null,
    campaignFolderName: selection.campaignFolderName,
    campaignBatchLabel: candidate.CampaignBatchLabel || null,
    snapshotFileSha256: candidate.SnapshotFileSha256 || null,
    runId: candidate.RunId || null,
    trialCount: isFiniteNumberValue_(candidate.TrialCount) ? Number(candidate.TrialCount) : null,
    repeatIndex: isFiniteNumberValue_(candidate.RepeatIndex) ? Number(candidate.RepeatIndex) : null,
    bestScore: isFiniteNumberValue_(candidate.BestScore) ? Number(candidate.BestScore) : null,
    invocationMode: candidate.InvocationMode || null,
    scorerFingerprint: candidate.ScorerFingerprint || null,
    scorerFingerprintShort: candidate.ScorerFingerprintShort || null,
    scorerFingerprintVersion: candidate.ScorerFingerprintVersion || null,
    scorerSource: candidate.ScorerSource || null,
    runFolderName: resolved.runFolderName || null,
    artifactFileName: resolved.artifactFileName || null,
    artifactFileId: resolved.artifactFileId || null,
    artifactLastUpdated: resolved.artifactLastUpdated || null,
    artifactUrl: resolved.artifactUrl || null,
    transportValidation: selection.loadedArtifact.transportValidation,
    writebackValidation: selection.loadedArtifact.writebackValidation,
    rowArtifactValidation: selection.loadedArtifact.rowArtifactValidation,
    transportSummary: {
      contractVersion: transportResult.contractVersion || null,
      trialCount: isFiniteNumberValue_(trialSpec.trialCount) ? Number(trialSpec.trialCount) : null,
      bestTrialIndex: isFiniteNumberValue_(bestTrial.index) ? Number(bestTrial.index) : null,
      bestScore: isFiniteNumberValue_(bestTrial.score) ? Number(bestTrial.score) : null,
      invocationMode: transportResult.invocationMode || null,
      scorerFingerprint: transportResult.scorerFingerprint || null,
      scorerFingerprintShort: transportResult.scorerFingerprintShort || null,
      scorerFingerprintVersion: transportResult.scorerFingerprintVersion || null,
      scorerSource: transportResult.scorerSource || null,
      allocationDayCount: Array.isArray(bestAllocation.days) ? bestAllocation.days.length : null
    },
    dedupeSummary: selection.dedupeSummary || null,
    failureSummary: selection.failureSummary || null,
    maxAttempts: isFiniteNumberValue_(selection.maxAttempts) ? Number(selection.maxAttempts) : null
  };

  if (includeTransportResult === true) {
    payload.transportResult = transportResult;
  }

  return payload;
}


function normalizeBenchmarkTrialsRunIdOrThrow_(runId) {
  const normalized = trimmedStringOrBlank_(runId);
  if (!normalized) {
    throw new Error('RunId is required.');
  }
  return normalized;
}

function selectBenchmarkTrialsRunIdForWriteback_(runId) {
  const requestedRunId = normalizeBenchmarkTrialsRunIdOrThrow_(runId);
  const trialsData = readBenchmarkTrialsRowsAsObjects_();
  const candidates = buildBenchmarkTrialsWritebackCandidates_(trialsData.rows);
  const requestedRunIdLower = normalizeBenchmarkTrialsRunIdForCompare_(requestedRunId);

  const matches = candidates.filter(function(candidate) {
    return candidate.RunIdNormalized === requestedRunIdLower;
  });

  if (matches.length === 0) {
    throw new Error(
      'No valid BENCHMARK_TRIALS candidate was found for RunId "' + requestedRunId + '". ' +
      'Confirm the imported campaign history contains that exact RunId.'
    );
  }

  assertNoDuplicateBenchmarkTrialsRunIds_(
    matches,
    'the requested RunId "' + requestedRunId + '"'
  );

  const selectedCandidate = matches[0];
  const loadedArtifact = loadAndValidateBenchmarkRunArtifactForWriteback_(selectedCandidate);

  return {
    ok: true,
    requestedRunId: requestedRunId,
    trialsSheetName: trialsData.sheetName,
    trialsDataRowCount: trialsData.rowCount,
    candidateCount: candidates.length,
    campaignFolderName: trimmedStringOrBlank_(selectedCandidate.CampaignFolderName),
    candidateRow: selectedCandidate,
    loadedArtifact: loadedArtifact,
    transportResult: loadedArtifact.transportResult
  };
}

function buildBenchmarkTrialsRunIdWritebackLogPayload_(selection, includeTransportResult) {
  const payload = buildBestBenchmarkTrialsWinnerWritebackLogPayload_(selection, includeTransportResult);
  payload.requestedRunId = selection.requestedRunId || null;
  return payload;
}

function updateBenchmarkUiAppliedMetadataFromSelection_(selection, sourceModeOverride) {
  const candidate = selection && selection.candidateRow ? selection.candidateRow : {};
  const sourceMode = trimmedStringOrBlank_(sourceModeOverride)
    || trimmedStringOrBlank_(candidate.InvocationMode)
    || trimmedStringOrBlank_(selection && selection.transportResult && selection.transportResult.invocationMode)
    || 'BENCHMARK_WRITEBACK';
  const metadataPayload = {
    lastAppliedBestScore: isFiniteNumberValue_(candidate.BestScore) ? Number(candidate.BestScore) : null,
    lastAppliedRunId: trimmedStringOrBlank_(candidate.RunId),
    lastAppliedCampaignFolder: trimmedStringOrBlank_(candidate.CampaignFolderName),
    lastAppliedTimestamp: new Date(),
    lastAppliedSourceMode: sourceMode
  };

  const warnings = [];
  let helperWriteError = null;
  let usedHelper = false;
  let usedFallback = false;

  if (typeof writeBenchmarkUiAppliedRosterMetadata_ === 'function') {
    try {
      writeBenchmarkUiAppliedRosterMetadata_(metadataPayload);
      usedHelper = true;
    } catch (err) {
      helperWriteError = String(err && err.message ? err.message : err);
      warnings.push('writeBenchmarkUiAppliedRosterMetadata_ failed: ' + helperWriteError);
    }
  } else {
    warnings.push('writeBenchmarkUiAppliedRosterMetadata_ unavailable; using SCORER_CONFIG fallback cells B35:B39.');
  }

  try {
    if (!usedHelper) {
      writeBenchmarkUiAppliedRosterMetadataFallback_(metadataPayload);
      usedFallback = true;
    }
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: 'WRITEBACK_UI_METADATA_UPDATE_FAILED',
      message: String(err && err.message ? err.message : err),
      warnings: warnings,
      helperWriteError: helperWriteError,
      helperAvailable: typeof writeBenchmarkUiAppliedRosterMetadata_ === 'function',
      usedFallback: usedFallback
    };
  }

  return {
    ok: true,
    warnings: warnings,
    helperAvailable: typeof writeBenchmarkUiAppliedRosterMetadata_ === 'function',
    usedHelper: usedHelper,
    usedFallback: usedFallback
  };
}

function writeBenchmarkUiAppliedRosterMetadataFallback_(payload) {
  const metadata = payload || {};
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('SCORER_CONFIG');
  if (!sheet) {
    throw new Error('SCORER_CONFIG sheet not found for fallback metadata write.');
  }

  const timestamp = metadata.lastAppliedTimestamp instanceof Date
    ? metadata.lastAppliedTimestamp
    : new Date();
  const values = [
    [
      metadata.lastAppliedBestScore === null || metadata.lastAppliedBestScore === undefined
        ? ''
        : Number(metadata.lastAppliedBestScore)
    ],
    [trimmedStringOrBlank_(metadata.lastAppliedRunId)],
    [trimmedStringOrBlank_(metadata.lastAppliedCampaignFolder)],
    [timestamp],
    [trimmedStringOrBlank_(metadata.lastAppliedSourceMode)]
  ];

  sheet.getRange('B35:B39').setValues(values);
  sheet.getRange('B35').setNumberFormat('0');
  sheet.getRange('B36:B37').setNumberFormat('@');
  sheet.getRange('B38').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('B39').setNumberFormat('@');
}

function readBenchmarkUiAppliedRosterMetadataForWritebackLog_() {
  if (typeof readBenchmarkUiAppliedRosterMetadata_ === 'function') {
    try {
      return {
        ok: true,
        source: 'writeBenchmarkUiAppliedRosterMetadata_',
        metadata: readBenchmarkUiAppliedRosterMetadata_()
      };
    } catch (err) {
      const helperReadError = String(err && err.message ? err.message : err);
      try {
        return {
          ok: true,
          source: 'SCORER_CONFIG!B35:B39',
          metadata: readBenchmarkUiAppliedRosterMetadataFallback_(),
          warning: 'readBenchmarkUiAppliedRosterMetadata_ failed; used SCORER_CONFIG fallback read.',
          helperReadError: helperReadError
        };
      } catch (fallbackErr) {
        return {
          ok: false,
          source: 'SCORER_CONFIG!B35:B39',
          message: String(fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr),
          warning: 'readBenchmarkUiAppliedRosterMetadata_ failed and fallback read also failed.',
          helperReadError: helperReadError
        };
      }
    }
  }

  try {
    return {
      ok: true,
      source: 'SCORER_CONFIG!B35:B39',
      metadata: readBenchmarkUiAppliedRosterMetadataFallback_()
    };
  } catch (err) {
    return {
      ok: false,
      source: 'SCORER_CONFIG!B35:B39',
      message: String(err && err.message ? err.message : err)
    };
  }
}

function readBenchmarkUiAppliedRosterMetadataFallback_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('SCORER_CONFIG');
  if (!sheet) {
    throw new Error('SCORER_CONFIG sheet not found for fallback metadata read.');
  }

  const values = sheet.getRange('B35:B39').getValues();
  const bestScoreRaw = values[0] && values[0].length ? values[0][0] : '';
  const bestScoreNormalized = trimmedStringOrBlank_(bestScoreRaw);
  let bestScore = null;
  if (bestScoreNormalized !== '') {
    const parsedBestScore = Number(bestScoreNormalized);
    bestScore = Number.isFinite(parsedBestScore) ? parsedBestScore : null;
  }

  return {
    lastAppliedBestScore: bestScore,
    lastAppliedRunId: trimmedStringOrBlank_(values[1] && values[1].length ? values[1][0] : ''),
    lastAppliedCampaignFolder: trimmedStringOrBlank_(values[2] && values[2].length ? values[2][0] : ''),
    lastAppliedTimestamp: values[3] && values[3].length ? values[3][0] : '',
    lastAppliedSourceMode: trimmedStringOrBlank_(values[4] && values[4].length ? values[4][0] : '')
  };
}

function debugInspectBenchmarkRunIdForWriteback(runId) {
  const selection = selectBenchmarkTrialsRunIdForWriteback_(runId);
  const payload = buildBenchmarkTrialsRunIdWritebackLogPayload_(selection, false);
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function runWriteBenchmarkRunIdToSheet(runId) {
  const selection = selectBenchmarkTrialsRunIdForWriteback_(runId);
  writeTransportTrialResultToSheet_(selection.transportResult);
  const uiMetadataUpdate = updateBenchmarkUiAppliedMetadataFromSelection_(
    selection,
    'BENCHMARK_WRITEBACK_SPECIFIC_RUN_ID'
  );

  const payload = buildBenchmarkTrialsRunIdWritebackLogPayload_(selection, false);
  payload.message = 'Specified benchmark RunId written to Sheet1 rows 35-38.';
  payload.uiMetadataUpdate = uiMetadataUpdate;
  payload.appliedMetadataAfterWriteback = readBenchmarkUiAppliedRosterMetadataForWritebackLog_();
  if (uiMetadataUpdate && uiMetadataUpdate.ok !== true) {
    payload.warning = 'Roster writeback succeeded, but metadata update had warnings/failure details.';
  }

  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}


function debugInspectBestBenchmarkTrialsWinnerForWriteback() {
  const selection = selectBestBenchmarkTrialsWinnerForWriteback_();
  const payload = buildBestBenchmarkTrialsWinnerWritebackLogPayload_(selection, false);
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function debugInspectBestBenchmarkTrialsWinnerForWritebackStrictAudit() {
  const selection = selectBestBenchmarkTrialsWinnerForWriteback_({
    selectionStrategy: 'STRICT_FULL_SCAN',
    validationMode: 'STRICT_AUDIT'
  });
  const payload = buildBestBenchmarkTrialsWinnerWritebackLogPayload_(selection, false);
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function applyBestBenchmarkWinnerToSheet_(options) {
  const context = options || {};
  const selectionOptions = context.selectionOptions && typeof context.selectionOptions === 'object'
    ? context.selectionOptions
    : {};
  const sourceMode = trimmedStringOrBlank_(context.sourceMode) || 'BENCHMARK_WRITEBACK';
  const fallbackCampaignFolderName = trimmedStringOrBlank_(context.campaignFolderName);

  let selection;
  try {
    selection = selectBestBenchmarkTrialsWinnerForWriteback_(selectionOptions);
  } catch (err) {
    return {
      ok: false,
      applied: false,
      skipped: true,
      reason: 'NO_VALID_BEST_WINNER',
      message: String(err && err.message ? err.message : err)
    };
  }

  let recomputeResult = null;
  try {
    writeTransportTrialResultToSheet_(selection.transportResult);
    if (typeof recomputeMonthlyCallPointsFromFinalRoster_ === 'function') {
      recomputeResult = recomputeMonthlyCallPointsFromFinalRoster_();
    }
  } catch (err) {
    return {
      ok: false,
      applied: true,
      reason: 'WRITE_OR_RECOMPUTE_FAILED',
      message: String(err && err.message ? err.message : err)
    };
  }

  const uiMetadataUpdate = updateBenchmarkUiAppliedMetadataFromSelection_(
    selection,
    sourceMode
  );
  const payload = buildBestBenchmarkTrialsWinnerWritebackLogPayload_(selection, false);
  const candidate = selection && selection.candidateRow ? selection.candidateRow : {};
  payload.message = 'Best benchmark trials winner written to Sheet1 rows 35-38.';
  payload.uiMetadataUpdate = uiMetadataUpdate;
  payload.monthlyCallPointsUpdate = recomputeResult;
  payload.appliedMetadataAfterWriteback = readBenchmarkUiAppliedRosterMetadataForWritebackLog_();
  if (uiMetadataUpdate && uiMetadataUpdate.ok !== true) {
    payload.warning = 'Roster writeback succeeded, but metadata update had warnings/failure details.';
  }

  payload.applied = true;
  payload.lastAppliedBestScore = isFiniteNumberValue_(candidate.BestScore) ? Number(candidate.BestScore) : null;
  payload.runId = trimmedStringOrBlank_(candidate.RunId);
  payload.campaignFolderName = trimmedStringOrBlank_(candidate.CampaignFolderName) || fallbackCampaignFolderName;
  payload.ok = true;

  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function runWriteBestBenchmarkTrialsWinnerToSheet() {
  return applyBestBenchmarkWinnerToSheet_({
    sourceMode: 'BENCHMARK_WRITEBACK_CURRENT_BEST'
  });
}
