/**
 * One-off Drive salvage hotfix for campaign artifacts.
 *
 * Goal:
 * - Recover already-generated benchmark campaign artifacts from Drive.
 * - Write recovered run rows into SEARCH_LOG.
 * - Rebuild SEARCH_PROGRESS from SEARCH_LOG.
 *
 * Design notes:
 * - Reuses existing project sheet contracts/helpers when available:
 *   - getPhase12BenchmarkRunsFolder_()
 *   - buildBenchmarkTrialsRowFromObject_()
 *   - appendBenchmarkRows_()
 *   - refreshBenchmarkReviewSheet()
 *   - writeBenchmarkUiCampaignProgress_(), writeBenchmarkUiStatus_() (best effort)
 * - Does NOT call Cloud Run.
 * - Does NOT rerun trials.
 * - Skips malformed runs with explicit Logger logging.
 */

var HOTFIX_RECOVERY_STATUS_LABEL = 'RECOVERED_FROM_DRIVE';
var HOTFIX_DESYNC_STATUS_LABEL = 'DESYNC_RECOVERED';
var HOTFIX_CAMPAIGN_REPORT_FILE = 'benchmark_campaign_report_v1.json';
var HOTFIX_RUNS_FOLDER_NAME = 'runs';
var HOTFIX_RUN_ARTIFACT_CANDIDATES = [
  'global_best.transport_trial_result_v1.json',
  'transport_trial_result_v1.json'
];

/**
 * Manual entry point for the two known impacted campaigns.
 */
function hotfixSalvageKnownCampaigns() {
  var folders = [
    '20260324_155857__batch-ui_target_10000000__20260324_235857__snap-83532a96',
    '20260324_155455__batch-ui_target_1000000__20260324_235454__snap-83532a96'
  ];

  var results = [];
  for (var i = 0; i < folders.length; i++) {
    try {
      results.push(hotfixSalvageCampaignByFolderName(folders[i]));
    } catch (err) {
      results.push({
        ok: false,
        campaignFolderName: folders[i],
        error: hotfixStringifyError_(err)
      });
    }
  }

  Logger.log(JSON.stringify({
    ok: true,
    message: 'Known-campaign salvage run finished.',
    results: results
  }, null, 2));

  return {
    ok: true,
    results: results
  };
}

/**
 * Manual entry point: salvage exactly one campaign by folder name.
 *
 * @param {string} campaignFolderName Campaign folder name under benchmark_runs.
 */
function hotfixSalvageCampaignByFolderName(campaignFolderName) {
  var folderName = hotfixNormalizeString_(campaignFolderName);
  if (!folderName) {
    throw new Error('campaignFolderName is required.');
  }

  Logger.log('[hotfix] Starting Drive salvage for campaign folder: ' + folderName);

  var benchmarkRunsFolder = getPhase12BenchmarkRunsFolder_();
  var campaignFolder = hotfixFindSingleFolderByNameOrThrow_(benchmarkRunsFolder, folderName, 'benchmark_runs');

  var reportInfo = hotfixTryLoadCampaignReport_(campaignFolder);
  var recoveredRunsInfo = null;
  var shouldUseRecoveredRuns = false;
  var runRecords = [];

  if (reportInfo.valid === true && reportInfo.report) {
    // Prefer the report path first. Only attempt runs/ scan for stale-checking.
    runRecords = hotfixBuildRunRecordsFromReport_(reportInfo.report, folderName);

    try {
      recoveredRunsInfo = hotfixRecoverRunsFromRunsFolder_(campaignFolder);
      shouldUseRecoveredRuns = hotfixShouldUseRecoveredRuns_(reportInfo, recoveredRunsInfo);
      if (shouldUseRecoveredRuns) {
        runRecords = recoveredRunsInfo.runs;
      }
    } catch (runsErr) {
      Logger.log(
        '[hotfix] runs/ stale-check skipped; proceeding with valid campaign report. reason=' +
        hotfixStringifyError_(runsErr)
      );
      recoveredRunsInfo = {
        runsFolderId: '',
        totalRunFolders: 0,
        runs: [],
        skipped: [],
        skippedReason: hotfixStringifyError_(runsErr)
      };
      shouldUseRecoveredRuns = false;
    }
  } else {
    // Report missing/invalid: runs/ recovery is required.
    recoveredRunsInfo = hotfixRecoverRunsFromRunsFolder_(campaignFolder);
    shouldUseRecoveredRuns = true;
    runRecords = recoveredRunsInfo.runs;
  }

  if (!runRecords.length) {
    throw new Error(
      'No recoverable run records found for campaign "' + folderName + '". ' +
      'Nothing was written to SEARCH_LOG/SEARCH_PROGRESS.'
    );
  }

  var importTimestamp = new Date();
  var rows = hotfixBuildBenchmarkRowsFromRunRecords_(runRecords, {
    campaignFolderName: folderName,
    importTimestamp: importTimestamp,
    sourceMode: shouldUseRecoveredRuns ? HOTFIX_DESYNC_STATUS_LABEL : HOTFIX_RECOVERY_STATUS_LABEL,
    sourceLabel: shouldUseRecoveredRuns ? 'recovered_from_runs' : 'campaign_report'
  });

  // Use deduping append path when available so retries do not duplicate rows.
  var writeResult = hotfixAppendRowsWithDedupe_(rows);

  var progress = hotfixComputeCampaignProgress_(runRecords);
  hotfixBestEffortWriteUiProgress_(folderName, progress, shouldUseRecoveredRuns);

  var result = {
    ok: true,
    campaignFolderName: folderName,
    writeMode: 'APPEND',
    sourceMode: shouldUseRecoveredRuns ? HOTFIX_DESYNC_STATUS_LABEL : HOTFIX_RECOVERY_STATUS_LABEL,
    importedRunCount: writeResult.rowCount,
    skippedDuplicateRowCount: writeResult.skippedDuplicateRowCount,
    recoveredRunsFolderCount: recoveredRunsInfo.totalRunFolders,
    recoveredRunnableCount: recoveredRunsInfo.runs.length,
    recoveredSkippedCount: recoveredRunsInfo.skipped.length,
    reportFound: reportInfo.found,
    reportValid: reportInfo.valid,
    reportRunCount: reportInfo.report && Array.isArray(reportInfo.report.runs)
      ? reportInfo.report.runs.length
      : 0,
    progress: progress,
    skippedRuns: recoveredRunsInfo.skipped
  };

  Logger.log(JSON.stringify({
    ok: true,
    message: '[hotfix] Campaign salvage completed.',
    result: result
  }, null, 2));

  return result;
}

function hotfixAppendRowsWithDedupe_(rows) {
  var appendRows = Array.isArray(rows) ? rows : [];

  if (typeof writeBenchmarkCampaignRowsToTrialsSheet_ === 'function') {
    var write = writeBenchmarkCampaignRowsToTrialsSheet_(appendRows, {
      writeMode: 'APPEND',
      refreshSummarySheet: true
    });
    var trialsWrite = write && write.trialsWriteResult ? write.trialsWriteResult : {};
    return {
      rowCount: hotfixFiniteOrNull_(trialsWrite.rowCount) || 0,
      skippedDuplicateRowCount: hotfixFiniteOrNull_(trialsWrite.skippedDuplicateRowCount) || 0
    };
  }

  // Fallback when campaign import writer helper is not available.
  if (typeof filterBenchmarkTrialsRowsForAppendDeduping_ === 'function') {
    var dedupe = filterBenchmarkTrialsRowsForAppendDeduping_(appendRows);
    appendBenchmarkRows_(dedupe.rowsToAppend || []);
    refreshBenchmarkReviewSheet();
    return {
      rowCount: dedupe.rowsToAppend ? dedupe.rowsToAppend.length : 0,
      skippedDuplicateRowCount: hotfixFiniteOrNull_(dedupe.skippedDuplicateRowCount) || 0
    };
  }

  appendBenchmarkRows_(appendRows);
  refreshBenchmarkReviewSheet();
  return {
    rowCount: appendRows.length,
    skippedDuplicateRowCount: 0
  };
}

function hotfixTryLoadCampaignReport_(campaignFolder) {
  var info = {
    found: false,
    valid: false,
    report: null,
    error: ''
  };

  var fileIter = campaignFolder.getFilesByName(HOTFIX_CAMPAIGN_REPORT_FILE);
  var files = [];
  while (fileIter.hasNext()) {
    files.push(fileIter.next());
  }

  if (files.length === 0) {
    Logger.log('[hotfix] Campaign report not found: ' + HOTFIX_CAMPAIGN_REPORT_FILE);
    return info;
  }

  if (files.length > 1) {
    info.found = true;
    info.error = 'Multiple campaign report files found.';
    Logger.log('[hotfix] ' + info.error + ' Will rebuild from runs/.');
    return info;
  }

  info.found = true;

  try {
    var text = files[0].getBlob().getDataAsString('UTF-8');
    var report = JSON.parse(text);
    info.report = report;

    if (typeof validateBenchmarkCampaignReport_ === 'function') {
      var validation = validateBenchmarkCampaignReport_(report);
      if (validation && validation.ok === true) {
        info.valid = true;
      } else {
        info.error = validation && validation.message
          ? validation.message
          : 'Unknown report validation failure.';
      }
    } else {
      // Fallback validation if helper is unavailable.
      info.valid = hotfixBasicCampaignReportShapeCheck_(report);
      if (!info.valid) {
        info.error = 'Campaign report shape check failed.';
      }
    }
  } catch (err) {
    info.error = hotfixStringifyError_(err);
  }

  if (!info.valid) {
    Logger.log('[hotfix] Campaign report unusable; will rebuild from runs/. reason=' + info.error);
  } else {
    Logger.log('[hotfix] Campaign report loaded and valid. runCount=' +
      (Array.isArray(info.report.runs) ? info.report.runs.length : 0));
  }

  return info;
}

function hotfixBasicCampaignReportShapeCheck_(report) {
  return !!(
    report &&
    report.contractVersion === 'benchmark_campaign_report_v1' &&
    report.campaign &&
    Array.isArray(report.runs)
  );
}

function hotfixRecoverRunsFromRunsFolder_(campaignFolder) {
  var runsFolder = hotfixFindSingleFolderByNameOrThrow_(
    campaignFolder,
    HOTFIX_RUNS_FOLDER_NAME,
    'campaign folder "' + campaignFolder.getName() + '"'
  );

  var runFoldersIter = runsFolder.getFolders();
  var recovered = [];
  var skipped = [];
  var totalRunFolders = 0;

  while (runFoldersIter.hasNext()) {
    var runFolder = runFoldersIter.next();
    totalRunFolders += 1;

    var parsed = hotfixTryRecoverRunFromFolder_(runFolder);
    if (parsed.ok) {
      recovered.push(parsed.run);
      continue;
    }

    skipped.push({
      runFolderName: runFolder.getName(),
      reason: parsed.reason
    });

    Logger.log('[hotfix] Skipping malformed/partial run folder "' + runFolder.getName() + '": ' + parsed.reason);
  }

  recovered.sort(hotfixCompareRecoveredRuns_);

  Logger.log('[hotfix] runs/ scan done for ' + campaignFolder.getName() +
    ' total=' + totalRunFolders +
    ' recovered=' + recovered.length +
    ' skipped=' + skipped.length);

  return {
    runsFolderId: runsFolder.getId(),
    totalRunFolders: totalRunFolders,
    runs: recovered,
    skipped: skipped
  };
}

function hotfixTryRecoverRunFromFolder_(runFolder) {
  var runFolderName = hotfixNormalizeString_(runFolder.getName());
  if (!runFolderName) {
    return { ok: false, reason: 'Blank run folder name.' };
  }

  var manifest = hotfixTryReadJsonFileByName_(runFolder, 'run_manifest.json');
  var artifact = hotfixTryFindAndReadRunArtifact_(runFolder);

  if (!artifact.found) {
    return {
      ok: false,
      reason: 'No recognized run artifact found (' + HOTFIX_RUN_ARTIFACT_CANDIDATES.join(', ') + ').'
    };
  }

  if (!artifact.json || typeof artifact.json !== 'object') {
    return {
      ok: false,
      reason: 'Run artifact JSON is missing or invalid: ' + artifact.fileName
    };
  }

  var runId = hotfixDeriveRunId_(runFolderName, artifact.json, manifest.json);
  var trialCount = hotfixDeriveTrialCount_(artifact.json, manifest.json, runFolderName);
  var repeatIndex = hotfixDeriveRepeatIndex_(artifact.json, manifest.json, runFolderName);

  if (trialCount === null || repeatIndex === null) {
    return {
      ok: false,
      reason: 'Missing trialCount/repeatIndex after recovery parse.'
    };
  }

  var scoring = hotfixExtractScoringFromTransportResult_(artifact.json);
  var bestScore = hotfixFiniteOrNull_(artifact.json.bestScore);
  if (bestScore === null) {
    bestScore = hotfixFiniteOrNull_(scoring.totalScore);
  }

  var runtimeMs = hotfixDeriveRuntimeMs_(artifact.json, manifest.json);
  var runtimeSec = runtimeMs === null ? null : runtimeMs / 1000;

  var ok = artifact.json.ok === true;
  var failureMessage = ok ? '' : hotfixNormalizeString_(artifact.json.message || 'Recovered artifact reports non-ok status.');

  return {
    ok: true,
    run: {
      runId: runId,
      runFolderName: runFolderName,
      artifactFileName: artifact.fileName,
      trialCount: trialCount,
      repeatIndex: repeatIndex,
      ok: ok,
      bestScore: bestScore,
      bestTrialIndex: hotfixFiniteOrNull_(artifact.json.bestTrialIndex),
      runtimeMs: runtimeMs,
      runtimeSec: runtimeSec,
      invocationMode: 'CAMPAIGN_' + HOTFIX_DESYNC_STATUS_LABEL,
      seed: hotfixDeriveSeed_(artifact.json, manifest.json),
      snapshotFileName: hotfixDeriveSnapshotFileName_(manifest.json),
      snapshotFileSha256: hotfixDeriveSnapshotSha_(artifact.json, manifest.json),
      scorerFingerprint: hotfixDeriveScorerField_(artifact.json, scoring, 'scorerFingerprint'),
      scorerFingerprintShort: hotfixDeriveScorerField_(artifact.json, scoring, 'scorerFingerprintShort'),
      scorerFingerprintVersion: hotfixDeriveScorerField_(artifact.json, scoring, 'scorerFingerprintVersion'),
      scorerSource: hotfixDeriveScorerField_(artifact.json, scoring, 'scorerSource'),
      scoring: scoring,
      summaryMessage: 'Recovered from Drive runs/ artifacts by hotfix.',
      failureMessage: failureMessage
    }
  };
}

function hotfixTryReadJsonFileByName_(folder, fileName) {
  var result = {
    found: false,
    fileName: fileName,
    json: null,
    error: ''
  };

  var iter = folder.getFilesByName(fileName);
  var files = [];
  while (iter.hasNext()) {
    files.push(iter.next());
  }

  if (files.length !== 1) {
    if (files.length > 1) {
      result.error = 'Multiple files named ' + fileName;
    }
    return result;
  }

  result.found = true;

  try {
    result.json = JSON.parse(files[0].getBlob().getDataAsString('UTF-8'));
  } catch (err) {
    result.error = hotfixStringifyError_(err);
  }

  return result;
}

function hotfixTryFindAndReadRunArtifact_(runFolder) {
  for (var i = 0; i < HOTFIX_RUN_ARTIFACT_CANDIDATES.length; i++) {
    var fileName = HOTFIX_RUN_ARTIFACT_CANDIDATES[i];
    var read = hotfixTryReadJsonFileByName_(runFolder, fileName);
    if (read.found && read.json && typeof read.json === 'object') {
      return {
        found: true,
        fileName: fileName,
        json: read.json
      };
    }
  }

  return {
    found: false,
    fileName: '',
    json: null
  };
}

function hotfixExtractScoringFromTransportResult_(transportResult) {
  var source = transportResult || {};
  var bestScoring = source.bestScoring && typeof source.bestScoring === 'object'
    ? source.bestScoring
    : {};

  var summary = source.bestTrial && source.bestTrial.scoringSummary && typeof source.bestTrial.scoringSummary === 'object'
    ? source.bestTrial.scoringSummary
    : {};

  var componentScores = {};
  var components = bestScoring.components && typeof bestScoring.components === 'object'
    ? bestScoring.components
    : {};

  var componentKeys = [
    'pointBalanceGlobal',
    'pointBalanceWithinSection',
    'spacingPenalty',
    'crReward',
    'dualEligibleIcuBonus',
    'standbyAdjacencyPenalty',
    'standbyCountFairnessPenalty',
    'preLeavePenalty',
    'unfilledPenalty'
  ];

  for (var i = 0; i < componentKeys.length; i++) {
    var key = componentKeys[i];
    var component = components[key] && typeof components[key] === 'object'
      ? components[key]
      : null;
    componentScores[key] = component && hotfixFiniteOrNull_(component.score) !== null
      ? Number(component.score)
      : null;
  }

  return {
    meanPoints: hotfixFiniteOrNull_(bestScoring.meanPoints, summary.meanPoints),
    standardDeviation: hotfixFiniteOrNull_(bestScoring.standardDeviation, summary.standardDeviation),
    range: hotfixFiniteOrNull_(bestScoring.range, summary.range),
    totalScore: hotfixFiniteOrNull_(bestScoring.totalScore, source.bestScore, source.bestTrial && source.bestTrial.score),
    scorerFingerprint: hotfixNormalizeString_(source.scorerFingerprint || bestScoring.scorerFingerprint || summary.scorerFingerprint),
    scorerFingerprintShort: hotfixNormalizeString_(source.scorerFingerprintShort || bestScoring.scorerFingerprintShort || summary.scorerFingerprintShort),
    scorerFingerprintVersion: hotfixNormalizeString_(source.scorerFingerprintVersion || bestScoring.scorerFingerprintVersion || summary.scorerFingerprintVersion),
    scorerSource: hotfixNormalizeString_(source.scorerSource || bestScoring.scorerSource || summary.scorerSource),
    componentScores: componentScores
  };
}

function hotfixShouldUseRecoveredRuns_(reportInfo, recoveredRunsInfo) {
  if (!reportInfo || reportInfo.valid !== true || !reportInfo.report) {
    return true;
  }

  var reportRuns = Array.isArray(reportInfo.report.runs) ? reportInfo.report.runs : [];
  var recoveredRuns = Array.isArray(recoveredRunsInfo.runs) ? recoveredRunsInfo.runs : [];

  // If report has fewer runs than we can recover from runs/, treat report as stale/incomplete.
  if (recoveredRuns.length > reportRuns.length) {
    Logger.log('[hotfix] Using recovered runs/: report runCount is lower than runs/ recoverable count.');
    return true;
  }

  // If runs/ contains run-folder names not represented by report, treat report as stale.
  var reportRunFolderSet = {};
  for (var i = 0; i < reportRuns.length; i++) {
    var rr = reportRuns[i] || {};
    var key = hotfixNormalizeString_(rr.runFolderName);
    if (key) {
      reportRunFolderSet[key] = true;
    }
  }

  for (var j = 0; j < recoveredRuns.length; j++) {
    var recoveredName = hotfixNormalizeString_(recoveredRuns[j].runFolderName);
    if (recoveredName && !reportRunFolderSet[recoveredName]) {
      Logger.log('[hotfix] Using recovered runs/: report missing runFolderName=' + recoveredName);
      return true;
    }
  }

  return false;
}

function hotfixBuildRunRecordsFromReport_(report, campaignFolderName) {
  var runs = report && Array.isArray(report.runs) ? report.runs : [];
  var records = [];

  for (var i = 0; i < runs.length; i++) {
    var run = runs[i] || {};
    var scoring = run.scoring && typeof run.scoring === 'object' ? run.scoring : {};

    var record = {
      runId: hotfixNormalizeString_(run.runId),
      runFolderName: hotfixNormalizeString_(run.runFolderName),
      artifactFileName: hotfixNormalizeString_(run.artifactFileName) || 'global_best.transport_trial_result_v1.json',
      trialCount: hotfixFiniteOrNull_(run.trialCount),
      repeatIndex: hotfixFiniteOrNull_(run.repeatIndex),
      ok: run.ok === true,
      bestScore: hotfixFiniteOrNull_(run.bestScore),
      bestTrialIndex: hotfixFiniteOrNull_(run.bestTrialIndex),
      runtimeMs: hotfixFiniteOrNull_(run.runtimeMs),
      runtimeSec: hotfixFiniteOrNull_(run.runtimeSec),
      invocationMode: 'CAMPAIGN_' + HOTFIX_RECOVERY_STATUS_LABEL,
      seed: hotfixNormalizeString_(run.seed),
      snapshotFileName: hotfixNormalizeString_(run.snapshotFileName || (report.campaign && report.campaign.snapshotFileName)),
      snapshotFileSha256: hotfixNormalizeString_(run.snapshotFileSha256 || (report.campaign && report.campaign.snapshotFileSha256)),
      scorerFingerprint: hotfixNormalizeString_(run.scorerFingerprint || scoring.scorerFingerprint),
      scorerFingerprintShort: hotfixNormalizeString_(run.scorerFingerprintShort || scoring.scorerFingerprintShort),
      scorerFingerprintVersion: hotfixNormalizeString_(run.scorerFingerprintVersion || scoring.scorerFingerprintVersion),
      scorerSource: hotfixNormalizeString_(run.scorerSource || scoring.scorerSource),
      scoring: {
        meanPoints: hotfixFiniteOrNull_(scoring.meanPoints),
        standardDeviation: hotfixFiniteOrNull_(scoring.standardDeviation),
        range: hotfixFiniteOrNull_(scoring.range),
        totalScore: hotfixFiniteOrNull_(scoring.totalScore, run.bestScore),
        componentScores: hotfixNormalizeComponentScores_(scoring.componentScores)
      },
      summaryMessage: 'Recovered from Drive campaign report by hotfix.',
      failureMessage: hotfixNormalizeString_(run.failureMessage)
    };

    if (record.runId && record.runFolderName && record.trialCount !== null && record.repeatIndex !== null) {
      records.push(record);
    } else {
      Logger.log('[hotfix] Skipping report run missing required fields at index=' + i);
    }
  }

  records.sort(hotfixCompareRecoveredRuns_);

  Logger.log('[hotfix] Campaign report run extraction done for ' + campaignFolderName + ': ' + records.length + ' usable rows.');

  return records;
}

function hotfixNormalizeComponentScores_(componentScores) {
  var source = componentScores && typeof componentScores === 'object' ? componentScores : {};
  var keys = [
    'pointBalanceGlobal',
    'pointBalanceWithinSection',
    'spacingPenalty',
    'crReward',
    'dualEligibleIcuBonus',
    'standbyAdjacencyPenalty',
    'standbyCountFairnessPenalty',
    'preLeavePenalty',
    'unfilledPenalty'
  ];

  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    out[key] = hotfixFiniteOrNull_(source[key]);
  }
  return out;
}

function hotfixBuildBenchmarkRowsFromRunRecords_(runRecords, options) {
  var rows = [];
  var source = options || {};
  var importTimestamp = source.importTimestamp || new Date();
  var campaignFolderName = hotfixNormalizeString_(source.campaignFolderName);
  var sourceMode = hotfixNormalizeString_(source.sourceMode);
  var sourceLabel = hotfixNormalizeString_(source.sourceLabel);

  for (var i = 0; i < runRecords.length; i++) {
    var run = runRecords[i] || {};
    var scoring = run.scoring || {};
    var summarySuffix = '[' + sourceMode + '|' + sourceLabel + ']';

    rows.push(buildBenchmarkTrialsRowFromObject_({
      ImportTimestamp: importTimestamp,
      CampaignBatchLabel: sourceMode,
      CampaignFolderName: campaignFolderName,
      SnapshotLabel: hotfixNormalizeString_(run.snapshotFileName),
      SnapshotFileSha256: hotfixNormalizeString_(run.snapshotFileSha256),
      TrialCount: hotfixValueOrBlank_(run.trialCount),
      RepeatIndex: hotfixValueOrBlank_(run.repeatIndex),
      RunId: hotfixNormalizeString_(run.runId),
      Ok: run.ok === true,
      BestScore: hotfixValueOrBlank_(run.bestScore),
      BestTrialIndex: hotfixValueOrBlank_(run.bestTrialIndex),
      RuntimeMs: hotfixValueOrBlank_(run.runtimeMs),
      RuntimeSec: hotfixValueOrBlank_(run.runtimeSec),
      InvocationMode: hotfixNormalizeString_(run.invocationMode) || sourceMode,
      Seed: hotfixNormalizeString_(run.seed),
      RunFolderName: hotfixNormalizeString_(run.runFolderName),
      ArtifactFileName: hotfixNormalizeString_(run.artifactFileName),
      ScorerFingerprint: hotfixNormalizeString_(run.scorerFingerprint),
      ScorerFingerprintShort: hotfixNormalizeString_(run.scorerFingerprintShort),
      ScorerFingerprintVersion: hotfixNormalizeString_(run.scorerFingerprintVersion),
      ScorerSource: hotfixNormalizeString_(run.scorerSource),
      MeanPoints: hotfixValueOrBlank_(scoring.meanPoints),
      StandardDeviation: hotfixValueOrBlank_(scoring.standardDeviation),
      Range: hotfixValueOrBlank_(scoring.range),
      TotalScore: hotfixValueOrBlank_(scoring.totalScore),
      PointBalanceGlobal: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.pointBalanceGlobal),
      PointBalanceWithinSection: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.pointBalanceWithinSection),
      SpacingPenalty: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.spacingPenalty),
      CrReward: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.crReward),
      DualEligibleIcuBonus: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.dualEligibleIcuBonus),
      StandbyAdjacencyPenalty: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.standbyAdjacencyPenalty),
      StandbyCountFairnessPenalty: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.standbyCountFairnessPenalty),
      PreLeavePenalty: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.preLeavePenalty),
      UnfilledPenalty: hotfixValueOrBlank_(scoring.componentScores && scoring.componentScores.unfilledPenalty),
      SummaryMessage: hotfixBuildSummaryMessage_(run.summaryMessage, summarySuffix),
      FailureMessage: hotfixNormalizeString_(run.failureMessage)
    }));
  }

  return rows;
}

function hotfixComputeCampaignProgress_(runRecords) {
  var rows = Array.isArray(runRecords) ? runRecords : [];
  var completed = rows.length;
  var okCount = 0;
  var failedCount = 0;
  var best = null;

  for (var i = 0; i < rows.length; i++) {
    var run = rows[i] || {};
    if (run.ok === true) {
      okCount += 1;
      if (hotfixFiniteOrNull_(run.bestScore) !== null) {
        if (!best || Number(run.bestScore) < Number(best.bestScore)) {
          best = {
            runId: hotfixNormalizeString_(run.runId),
            bestScore: Number(run.bestScore)
          };
        }
      }
    } else {
      failedCount += 1;
    }
  }

  return {
    plannedRunCount: completed,
    completedRunCount: completed,
    okCount: okCount,
    failedCount: failedCount,
    bestRunId: best ? best.runId : '',
    bestScore: best ? best.bestScore : ''
  };
}

function hotfixBestEffortWriteUiProgress_(campaignFolderName, progress, recoveredFromRuns) {
  var statusText = recoveredFromRuns ? HOTFIX_DESYNC_STATUS_LABEL : HOTFIX_RECOVERY_STATUS_LABEL;

  try {
    if (typeof writeBenchmarkUiCampaignProgress_ === 'function') {
      writeBenchmarkUiCampaignProgress_({
        status: statusText,
        campaignFolderName: campaignFolderName,
        completedRunCount: progress.completedRunCount,
        plannedRunCount: progress.plannedRunCount,
        currentBestRunId: progress.bestRunId,
        currentBestScore: progress.bestScore
      });
    }

    if (typeof writeBenchmarkUiStatus_ === 'function') {
      writeBenchmarkUiStatus_(statusText);
    }

    Logger.log('[hotfix] UI progress/status updated with ' + statusText);
  } catch (err) {
    Logger.log('[hotfix] UI progress write skipped: ' + hotfixStringifyError_(err));
  }
}

function hotfixBuildSummaryMessage_(message, suffix) {
  var base = hotfixNormalizeString_(message);
  var marker = hotfixNormalizeString_(suffix);

  if (!base) {
    return marker;
  }

  if (!marker) {
    return base;
  }

  return base + ' ' + marker;
}

function hotfixDeriveRunId_(runFolderName, transportResult, manifest) {
  var fromTransport = hotfixNormalizeString_(transportResult && transportResult.runId);
  if (fromTransport) {
    return fromTransport;
  }

  var fromManifest = hotfixNormalizeString_(manifest && manifest.runId);
  if (fromManifest) {
    return fromManifest;
  }

  // Fallback: run folder names in this campaign flow already use cmp_..._rNN ids.
  return runFolderName;
}

function hotfixDeriveTrialCount_(transportResult, manifest, runFolderName) {
  var direct = hotfixFiniteOrNull_(
    transportResult && transportResult.trialSpec && transportResult.trialSpec.trialCount,
    transportResult && transportResult.runLevelPromotion && transportResult.runLevelPromotion.runTrialCount,
    manifest && manifest.trialCount,
    manifest && manifest.plan && manifest.plan.trialCount
  );

  if (direct !== null) {
    return Number(direct);
  }

  var fromName = /_tc_(\d+)_/i.exec(runFolderName || '');
  if (fromName) {
    return Number(fromName[1]);
  }

  return null;
}

function hotfixDeriveRepeatIndex_(transportResult, manifest, runFolderName) {
  var direct = hotfixFiniteOrNull_(
    transportResult && transportResult.repeatIndex,
    manifest && manifest.repeatIndex,
    manifest && manifest.plan && manifest.plan.repeatIndex
  );

  if (direct !== null) {
    return Number(direct);
  }

  var fromName = /_r(\d+)$/i.exec(runFolderName || '');
  if (fromName) {
    return Number(fromName[1]);
  }

  return null;
}

function hotfixDeriveRuntimeMs_(transportResult, manifest) {
  return hotfixFiniteOrNull_(
    transportResult && transportResult.runtimeMs,
    manifest && manifest.runtimeMs,
    manifest && manifest.execution && manifest.execution.durationMs
  );
}

function hotfixDeriveSeed_(transportResult, manifest) {
  return hotfixNormalizeString_(
    (transportResult && transportResult.trialSpec && transportResult.trialSpec.seed) ||
    (transportResult && transportResult.rng && transportResult.rng.normalizedSeed) ||
    (manifest && manifest.seed)
  );
}

function hotfixDeriveSnapshotFileName_(manifest) {
  return hotfixNormalizeString_(manifest && manifest.snapshot && manifest.snapshot.fileName);
}

function hotfixDeriveSnapshotSha_(transportResult, manifest) {
  return hotfixNormalizeString_(
    (transportResult && transportResult.snapshotFileSha256) ||
    (manifest && manifest.snapshot && manifest.snapshot.fileSha256)
  );
}

function hotfixDeriveScorerField_(transportResult, scoring, key) {
  return hotfixNormalizeString_(
    (transportResult && transportResult[key]) ||
    (scoring && scoring[key])
  );
}

function hotfixFindSingleFolderByNameOrThrow_(parentFolder, folderName, contextLabel) {
  var iter = parentFolder.getFoldersByName(folderName);
  var matches = [];

  while (iter.hasNext() && matches.length < 2) {
    matches.push(iter.next());
  }

  if (matches.length === 0) {
    throw new Error('Folder not found: "' + folderName + '" in ' + contextLabel + '.');
  }

  if (matches.length > 1 || iter.hasNext()) {
    throw new Error('Multiple folders named "' + folderName + '" in ' + contextLabel + '.');
  }

  return matches[0];
}

function hotfixCompareRecoveredRuns_(left, right) {
  var a = left || {};
  var b = right || {};

  var tDiff = Number(a.trialCount || 0) - Number(b.trialCount || 0);
  if (tDiff !== 0) {
    return tDiff;
  }

  var rDiff = Number(a.repeatIndex || 0) - Number(b.repeatIndex || 0);
  if (rDiff !== 0) {
    return rDiff;
  }

  return hotfixNormalizeString_(a.runId).localeCompare(hotfixNormalizeString_(b.runId));
}

function hotfixFiniteOrNull_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (typeof value === 'number' && isFinite(value)) {
      return Number(value);
    }
    if (typeof value === 'string' && value.trim()) {
      var parsed = Number(value);
      if (isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function hotfixValueOrBlank_(value) {
  return value === null || value === undefined ? '' : value;
}

function hotfixNormalizeString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function hotfixStringifyError_(err) {
  if (!err) {
    return 'Unknown error';
  }
  return err && err.message ? String(err.message) : String(err);
}
