
function generateRoster() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Example: write dummy assignments into rows 35-38 for columns B to I
  const output = [
    ['Arthur', '', '', 'Matthew', '', '', '', ''],
    ['', 'Jeevan', '', '', '', 'Sylvia', '', ''],
    ['', '', 'Laura', '', 'Sean', '', '', ''],
    ['', '', '', '', '', '', 'Anushka', '']
  ];

  sheet.getRange(35, 2, 4, 8).setValues(output);
  SpreadsheetApp.getActiveSpreadsheet().toast('Dummy roster written');
}

function runDebugCandidatePoolsForFirstDate() {
  debugBuildCandidatePoolsForFirstDate_();
}

function runWriteBestRandomTrialToSheetLocalDirect() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "LOCAL_DIRECT"
  });
}

function runWriteBestRandomTrialToSheetSimulatedExternal() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "LOCAL_SIMULATED_EXTERNAL"
  });
}

function runWriteBestRandomTrialToSheetExternalHttp() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "EXTERNAL_HTTP"
  });
}

function debugLocalDirectTransportTrialResult() {
  debugTransportTrialResultForInvocationMode_("LOCAL_DIRECT");
}

function debugExternalHttpTransportTrialResult() {
  debugTransportTrialResultForInvocationMode_("EXTERNAL_HTTP");
}

function debugBuildComputeSnapshotForExternalHttp() {
  const result = buildDebugComputeSnapshotForInvocation_({
    trialCount: 200,
    seed: 12345
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugWriteComputeSnapshotForExternalHttpToDrive() {
  const result = writeDebugComputeSnapshotForInvocationToDrive_({
    trialCount: 200,
    seed: 12345
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function exportPhase12BenchmarkSnapshotToDrive() {
  const result = exportPhase12BenchmarkSnapshotToDrive_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Benchmark')
    .addItem('Initialize control panel', 'initializeBenchmarkControlPanel')
    .addItem('Inspect control panel state', 'inspectBenchmarkControlPanelState')
    .addSeparator()
    .addItem('Import latest uploaded campaign to tables', 'importLatestBenchmarkCampaignToTables')
    .addItem('Import selected campaign to tables', 'importSelectedBenchmarkCampaignToTables')
    .addSeparator()
    .addItem('Inspect current best winner', 'inspectCurrentBestBenchmarkWinner')
    .addItem('Apply current best roster to Sheet1', 'applyCurrentBestBenchmarkRoster')
    .addItem('Inspect specific RunId from UI', 'inspectSpecificBenchmarkRunIdFromUi')
    .addItem('Apply specific RunId from UI', 'applySpecificBenchmarkRunIdFromUi')
    .addToUi();
}

function initializeBenchmarkControlPanel() {
  const result = initializeBenchmarkUiControls_();
  logBenchmarkUiActionResult_('Initialize control panel', result);
  return result;
}

function inspectBenchmarkControlPanelState() {
  const result = debugReadBenchmarkUiControlState_();
  logBenchmarkUiActionResult_('Inspect control panel state', result);
  return result;
}

function inspectBenchmarkControlPanelMap() {
  const result = debugBenchmarkUiControlMap_();
  logBenchmarkUiActionResult_('Inspect control panel map', result);
  return result;
}

function installBenchmarkControlPanelNamedRanges() {
  const result = installBenchmarkUiNamedRanges_();
  logBenchmarkUiActionResult_('Install benchmark control panel named ranges', result);
  return result;
}

function importLatestBenchmarkCampaignToTables() {
  const result = runReplaceBenchmarkTrialsWithLatestCampaignReport();
  logBenchmarkUiActionResult_('Import latest benchmark campaign to tables', result);
  return result;
}

function importSelectedBenchmarkCampaignToTables() {
  const result = runReplaceBenchmarkTrialsWithSelectedCampaignReport();
  logBenchmarkUiActionResult_('Import selected benchmark campaign to tables', result);
  return result;
}

function inspectCurrentBestBenchmarkWinner() {
  const result = debugInspectBestBenchmarkTrialsWinnerForWriteback();
  logBenchmarkUiActionResult_('Inspect current best benchmark winner', result);
  return result;
}

function applyCurrentBestBenchmarkRoster() {
  const result = runWriteBestBenchmarkTrialsWinnerToSheet();
  logBenchmarkUiActionResult_('Apply current best benchmark roster', result);
  return result;
}

function inspectSpecificBenchmarkRunIdFromUi() {
  const state = readBenchmarkUiControlState_();
  const runId = normalizeBenchmarkUiString_(state.specificRunId);
  if (!runId) {
    throw new Error('Specific RunId override is blank in the UI control panel.');
  }

  const result = debugInspectBenchmarkRunIdForWriteback(runId);
  logBenchmarkUiActionResult_('Inspect specific benchmark RunId from UI', result);
  return result;
}

function applySpecificBenchmarkRunIdFromUi() {
  const state = readBenchmarkUiControlState_();
  const runId = normalizeBenchmarkUiString_(state.specificRunId);
  if (!runId) {
    throw new Error('Specific RunId override is blank in the UI control panel.');
  }

  const result = runWriteBenchmarkRunIdToSheet(runId);
  logBenchmarkUiActionResult_('Apply specific benchmark RunId from UI', result);
  return result;
}

function logBenchmarkUiActionResult_(actionLabel, result) {
  const summary = summarizeBenchmarkUiActionResult_(result);
  Logger.log('%s\n%s', actionLabel, JSON.stringify(summary, null, 2));
  return summary;
}

function summarizeBenchmarkUiActionResult_(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const summary = {};

  copyDefinedBenchmarkUiFields_(result, summary, [
    'ok',
    'message',
    'sheetName',
    'sheetNames',
    'selectionMode',
    'campaignFolderName',
    'campaignBatchLabel',
    'artifactFileName',
    'artifactFileId',
    'artifactLastUpdated',
    'artifactUrl',
    'contractVersion',
    'status',
    'currentBestRunId',
    'currentBestScore',
    'plannedRunCount',
    'completedRunCount',
    'importedRunCount',
    'trialsSheetName',
    'trialsDataRowCount',
    'candidateCount',
    'chosenRowNumber',
    'runId',
    'requestedRunId',
    'trialCount',
    'repeatIndex',
    'bestScore',
    'invocationMode',
    'runFolderName',
    'summaryRowCount'
  ]);

  if (result.summary && typeof result.summary === 'object') {
    summary.summary = {};
    copyDefinedBenchmarkUiFields_(result.summary, summary.summary, [
      'selectionMode',
      'campaignFolderName',
      'batchLabel',
      'snapshotFileName',
      'snapshotFileSha256',
      'plannedRunCount',
      'importedRunCount',
      'completedCount',
      'okCount',
      'failedCount',
      'winnerRunId',
      'winnerTrialCount',
      'winnerRepeatIndex',
      'winnerBestScore'
    ]);
  }

  if (result.writeResult && typeof result.writeResult === 'object') {
    summary.writeResult = {};
    copyDefinedBenchmarkUiFields_(result.writeResult, summary.writeResult, [
      'ok',
      'writeMode'
    ]);

    if (result.writeResult.trialsWriteResult && typeof result.writeResult.trialsWriteResult === 'object') {
      summary.writeResult.trialsWriteResult = {};
      copyDefinedBenchmarkUiFields_(result.writeResult.trialsWriteResult, summary.writeResult.trialsWriteResult, [
        'ok',
        'sheetName',
        'writeMode',
        'rowCount'
      ]);
    }

    if (result.writeResult.summaryWriteResult && typeof result.writeResult.summaryWriteResult === 'object') {
      summary.writeResult.summaryWriteResult = {};
      copyDefinedBenchmarkUiFields_(result.writeResult.summaryWriteResult, summary.writeResult.summaryWriteResult, [
        'ok',
        'sheetName',
        'summaryRowCount'
      ]);
    }
  }

  if (result.reportValidation && typeof result.reportValidation === 'object') {
    summary.reportValidation = {};
    copyDefinedBenchmarkUiFields_(result.reportValidation, summary.reportValidation, [
      'ok',
      'runCount'
    ]);
  }

  if (result.transportValidation && typeof result.transportValidation === 'object') {
    summary.transportValidation = {};
    copyDefinedBenchmarkUiFields_(result.transportValidation, summary.transportValidation, [
      'ok',
      'contractKind',
      'contractVersion',
      'trialCount',
      'seed',
      'bestTrialIndex',
      'bestScore',
      'hasBestAllocation',
      'hasBestScoring'
    ]);
  }

  if (result.writebackValidation && typeof result.writebackValidation === 'object') {
    summary.writebackValidation = {};
    copyDefinedBenchmarkUiFields_(result.writebackValidation, summary.writebackValidation, [
      'ok',
      'contractKind',
      'contractVersion',
      'dayCount'
    ]);
  }

  if (result.rowArtifactValidation && typeof result.rowArtifactValidation === 'object') {
    summary.rowArtifactValidation = {};
    copyDefinedBenchmarkUiFields_(result.rowArtifactValidation, summary.rowArtifactValidation, [
      'ok',
      'message'
    ]);
  }

  if (result.transportSummary && typeof result.transportSummary === 'object') {
    summary.transportSummary = {};
    copyDefinedBenchmarkUiFields_(result.transportSummary, summary.transportSummary, [
      'contractVersion',
      'trialCount',
      'bestTrialIndex',
      'bestScore',
      'invocationMode',
      'allocationDayCount'
    ]);
  }

  if (result.state && typeof result.state === 'object') {
    summary.state = {};
    copyDefinedBenchmarkUiFields_(result.state, summary.state, [
      'targetMaxTrialCount',
      'specificRunId',
      'status',
      'campaignFolder',
      'bestRunId',
      'bestScore',
      'completedRuns',
      'plannedRuns',
      'lastUpdated'
    ]);
    if (Array.isArray(result.state.expandedTrialCounts)) {
      summary.state.expandedTrialCounts = result.state.expandedTrialCounts.slice();
    }
  }

  if (result.controlMap && typeof result.controlMap === 'object') {
    summary.controlMap = {};
    Object.keys(result.controlMap).forEach(function(key) {
      const item = result.controlMap[key];
      if (!item || typeof item !== 'object') {
        return;
      }
      summary.controlMap[key] = {
        a1Notation: item.a1Notation || null,
        sheetName: item.sheetName || null
      };
    });
  }

  return summary;
}

function copyDefinedBenchmarkUiFields_(source, target, keys) {
  keys.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      target[key] = source[key];
    }
  });
}
