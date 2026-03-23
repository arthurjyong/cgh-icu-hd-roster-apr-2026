function getBenchmarkOrchestrationDefaults_() {
  return {
    startPath: '/campaigns/start',
    statusPath: '/campaigns/status',
    artifactFileName: 'benchmark_campaign_report_v1.json',
    pollEveryMinutes: 1,
    repeats: 3,
    statePrefix: 'BENCHMARK_ORCHESTRATION_',
    activeStatusValues: {
      pending: 'PENDING',
      running: 'RUNNING',
      complete: 'COMPLETE',
      failed: 'FAILED',
      cancelled: 'CANCELLED'
    }
  };
}

function getBenchmarkOrchestrationPropertyKeys_() {
  const defaults = getBenchmarkOrchestrationDefaults_();
  const prefix = defaults.statePrefix;
  return {
    orchestratorBaseUrl: 'BENCHMARK_ORCHESTRATOR_BASE_URL',
    orchestratorAuthToken: 'BENCHMARK_ORCHESTRATOR_AUTH_TOKEN',
    startPath: 'BENCHMARK_ORCHESTRATOR_START_PATH',
    statusPath: 'BENCHMARK_ORCHESTRATOR_STATUS_PATH',
    activeCampaignId: prefix + 'ACTIVE_CAMPAIGN_ID',
    activeCampaignFolderName: prefix + 'ACTIVE_CAMPAIGN_FOLDER_NAME',
    activeStatus: prefix + 'ACTIVE_STATUS',
    targetMaxTrialCount: prefix + 'TARGET_MAX_TRIAL_COUNT',
    startedAtIso: prefix + 'STARTED_AT_ISO',
    pollTriggerUniqueId: prefix + 'POLL_TRIGGER_UNIQUE_ID',
    lastPollAtIso: prefix + 'LAST_POLL_AT_ISO',
    campaignSeed: prefix + 'CAMPAIGN_SEED'
  };
}

function normalizeBenchmarkOrchestrationString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function joinBenchmarkOrchestratorUrl_(baseUrl, path) {
  const base = normalizeBenchmarkOrchestrationString_(baseUrl).replace(/\/+$/, '');
  const suffix = normalizeBenchmarkOrchestrationString_(path) || '';
  if (!base) {
    return '';
  }
  if (!suffix) {
    return base;
  }
  if (suffix.charAt(0) === '/') {
    return base + suffix;
  }
  return base + '/' + suffix;
}

function getBenchmarkOrchestratorConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  const defaults = getBenchmarkOrchestrationDefaults_();

  const config = {
    baseUrl: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.orchestratorBaseUrl)),
    authToken: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.orchestratorAuthToken)),
    startPath: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.startPath)) || defaults.startPath,
    statusPath: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.statusPath)) || defaults.statusPath,
    pollEveryMinutes: defaults.pollEveryMinutes,
    repeats: defaults.repeats,
    artifactFileName: defaults.artifactFileName
  };

  config.startUrl = joinBenchmarkOrchestratorUrl_(config.baseUrl, config.startPath);
  config.statusUrl = joinBenchmarkOrchestratorUrl_(config.baseUrl, config.statusPath);
  config.hasAuthToken = Boolean(config.authToken);
  config.isConfigured = Boolean(config.baseUrl && config.hasAuthToken && config.startUrl && config.statusUrl);
  return config;
}

function assertBenchmarkOrchestratorConfigured_() {
  const config = getBenchmarkOrchestratorConfig_();
  if (!config.baseUrl) {
    writeBenchmarkUiStatus_('CONFIG ERROR');
    throw new Error('BENCHMARK_ORCHESTRATOR_BASE_URL script property is required.');
  }
  if (!config.authToken) {
    writeBenchmarkUiStatus_('CONFIG ERROR');
    throw new Error('BENCHMARK_ORCHESTRATOR_AUTH_TOKEN script property is required.');
  }
  return config;
}

function getActiveBenchmarkCampaignState_() {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  return {
    campaignId: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.activeCampaignId)),
    campaignFolderName: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.activeCampaignFolderName)),
    status: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.activeStatus)),
    targetMaxTrialCount: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.targetMaxTrialCount)),
    startedAtIso: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.startedAtIso)),
    pollTriggerUniqueId: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.pollTriggerUniqueId)),
    lastPollAtIso: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.lastPollAtIso)),
    campaignSeed: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.campaignSeed))
  };
}

function setActiveBenchmarkCampaignState_(state) {
  const payload = state || {};
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  const values = {};
  values[keys.activeCampaignId] = normalizeBenchmarkOrchestrationString_(payload.campaignId);
  values[keys.activeCampaignFolderName] = normalizeBenchmarkOrchestrationString_(payload.campaignFolderName);
  values[keys.activeStatus] = normalizeBenchmarkOrchestrationString_(payload.status);
  values[keys.targetMaxTrialCount] = normalizeBenchmarkOrchestrationString_(payload.targetMaxTrialCount);
  values[keys.startedAtIso] = normalizeBenchmarkOrchestrationString_(payload.startedAtIso);
  values[keys.pollTriggerUniqueId] = normalizeBenchmarkOrchestrationString_(payload.pollTriggerUniqueId);
  values[keys.lastPollAtIso] = normalizeBenchmarkOrchestrationString_(payload.lastPollAtIso);
  values[keys.campaignSeed] = normalizeBenchmarkOrchestrationString_(payload.campaignSeed);
  properties.setProperties(values, false);
}

function clearActiveBenchmarkCampaignState_() {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  properties.deleteProperty(keys.activeCampaignId);
  properties.deleteProperty(keys.activeCampaignFolderName);
  properties.deleteProperty(keys.activeStatus);
  properties.deleteProperty(keys.targetMaxTrialCount);
  properties.deleteProperty(keys.startedAtIso);
  properties.deleteProperty(keys.pollTriggerUniqueId);
  properties.deleteProperty(keys.lastPollAtIso);
  properties.deleteProperty(keys.campaignSeed);
}

function getBenchmarkCampaignPollTriggerFunctionName_() {
  return 'pollActiveBenchmarkCampaign';
}

function removeBenchmarkCampaignPollTrigger_() {
  const functionName = getBenchmarkCampaignPollTriggerFunctionName_();
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      removedCount += 1;
    }
  }
  const state = getActiveBenchmarkCampaignState_();
  state.pollTriggerUniqueId = '';
  setActiveBenchmarkCampaignState_(state);
  return removedCount;
}

function installBenchmarkCampaignPollTrigger_() {
  removeBenchmarkCampaignPollTrigger_();
  const trigger = ScriptApp.newTrigger(getBenchmarkCampaignPollTriggerFunctionName_())
    .timeBased()
    .everyMinutes(getBenchmarkOrchestrationDefaults_().pollEveryMinutes)
    .create();
  const state = getActiveBenchmarkCampaignState_();
  state.pollTriggerUniqueId = trigger.getUniqueId ? trigger.getUniqueId() : '';
  setActiveBenchmarkCampaignState_(state);
  return state.pollTriggerUniqueId;
}

function buildBenchmarkCampaignBatchLabelFromUi_(targetMaxTrialCount) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  return 'ui_target_' + String(targetMaxTrialCount) + '__' + timestamp;
}

function generateBenchmarkCampaignSeed_() {
  const now = Date.now();
  const randomPart = Math.floor(Math.random() * 1000);
  return String((now * 1000) + randomPart);
}

function resolveBenchmarkCampaignSeedFromUi_(uiState) {
  const ui = uiState || readBenchmarkUiControlState_();
  const seedOverride = normalizeBenchmarkOrchestrationString_(ui.seedOverride);
  if (seedOverride) {
    const numeric = Number(seedOverride);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new Error('Seed override must be a positive integer.');
    }
    return String(numeric);
  }

  return generateBenchmarkCampaignSeed_();
}

function buildBenchmarkCampaignStartPayload_(snapshotExportResult, uiState) {
  if (!snapshotExportResult || snapshotExportResult.ok !== true) {
    throw new Error('A successful snapshot export result is required.');
  }
  const ui = uiState || readBenchmarkUiControlState_();
  const exportInfo = snapshotExportResult.export || {};
  const baseSeed = resolveBenchmarkCampaignSeedFromUi_(ui);
  return {
    mode: 'CAMPAIGN',
    source: 'APPS_SCRIPT_UI',
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    spreadsheetName: SpreadsheetApp.getActive().getName(),
    sheetName: SpreadsheetApp.getActiveSheet().getName(),
    targetMaxTrialCount: ui.targetMaxTrialCount,
    campaignTrialCounts: ui.expandedTrialCounts,
    campaignRepeats: getBenchmarkOrchestrationDefaults_().repeats,
    baseSeed: baseSeed,
    campaignBatchLabel: buildBenchmarkCampaignBatchLabelFromUi_(ui.targetMaxTrialCount),
    snapshot: {
      contractVersion: snapshotExportResult.contractVersion || null,
      fileId: exportInfo.fileId || null,
      fileName: exportInfo.fileName || null,
      exportedAtIso: exportInfo.exportedAtIso || null
    },
    resolvedBaseSeed: baseSeed
  };
}

function parseBenchmarkOrchestrationHttpResponse_(response, contextLabel) {
  const label = contextLabel || 'backend request';
  if (!response) {
    throw new Error(label + ' returned no response.');
  }
  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(label + ' returned non-JSON response. HTTP ' + code + '.');
  }
  if (code < 200 || code >= 300 || !data || data.ok !== true) {
    const message =
      (data && (data.errorMessage || data.error || data.message)) ||
      (label + ' failed. HTTP ' + code + '.');
    throw new Error(message);
  }
  return data;
}

function buildBenchmarkOrchestratorHeaders_(config) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (config && config.authToken) {
    headers.Authorization = 'Bearer ' + config.authToken;
  }
  return headers;
}

function callBenchmarkOrchestratorStart_(payload) {
  const config = assertBenchmarkOrchestratorConfigured_();
  const response = UrlFetchApp.fetch(config.startUrl, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: buildBenchmarkOrchestratorHeaders_(config),
    payload: JSON.stringify(payload)
  });
  return parseBenchmarkOrchestrationHttpResponse_(response, 'Benchmark orchestrator start');
}

function callBenchmarkOrchestratorStatus_(campaignId) {
  const trimmed = normalizeBenchmarkOrchestrationString_(campaignId);
  if (!trimmed) {
    throw new Error('campaignId is required to poll benchmark orchestrator status.');
  }
  const config = assertBenchmarkOrchestratorConfigured_();
  const url = config.statusUrl + '?campaignId=' + encodeURIComponent(trimmed);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: buildBenchmarkOrchestratorHeaders_(config)
  });
  return parseBenchmarkOrchestrationHttpResponse_(response, 'Benchmark orchestrator status');
}

function extractBenchmarkProgressPayload_(statusResponse) {
  const response = statusResponse || {};
  return {
    status: response.status || '',
    campaignFolderName: response.campaignFolderName || '',
    completedRunCount: response.completedRunCount,
    plannedRunCount: response.plannedRunCount,
    currentBestRunId: response.currentBestRunId || '',
    currentBestScore: response.currentBestScore,
    currentBestScorerFingerprint: response.currentBestScorerFingerprint || '',
    currentBestScorerFingerprintShort: response.currentBestScorerFingerprintShort || '',
    currentBestScorerFingerprintVersion: response.currentBestScorerFingerprintVersion || '',
    currentBestScorerSource: response.currentBestScorerSource || '',
    campaignSeed: response.baseSeed != null ? String(response.baseSeed) : ''
  };
}

function refreshBenchmarkTablesFromCampaignFolder_(campaignFolderName) {
  const folderName = normalizeBenchmarkOrchestrationString_(campaignFolderName);
  if (!folderName) {
    return { ok: false, skipped: true, message: 'campaignFolderName is blank.' };
  }
  setPhase13CampaignImportSelectedCampaignFolder(folderName);
  setPhase13CampaignImportSelectedArtifactFileName(getBenchmarkOrchestrationDefaults_().artifactFileName);
  runReplaceBenchmarkTrialsWithSelectedCampaignReport();

  let bestWinner = null;
  try {
    bestWinner = debugInspectBestBenchmarkTrialsWinnerForWriteback();
  } catch (err) {
    bestWinner = { ok: false, message: String(err && err.message ? err.message : err) };
  }

  if (bestWinner && bestWinner.ok === true) {
    writeBenchmarkUiCampaignProgress_({
      campaignFolderName: folderName,
      currentBestRunId: bestWinner.runId || '',
      currentBestScore: bestWinner.bestScore,
      campaignSeed: getActiveBenchmarkCampaignState_().campaignSeed || ''
    });
  }

  return {
    ok: true,
    campaignFolderName: folderName,
    bestWinner: bestWinner
  };
}

function buildCompactBenchmarkCampaignStateSummary_(state) {
  const active = state || getActiveBenchmarkCampaignState_();
  return {
    ok: true,
    campaignId: active.campaignId || '',
    campaignFolderName: active.campaignFolderName || '',
    status: active.status || '',
    targetMaxTrialCount: active.targetMaxTrialCount || '',
    startedAtIso: active.startedAtIso || '',
    pollTriggerUniqueId: active.pollTriggerUniqueId || '',
    lastPollAtIso: active.lastPollAtIso || '',
    campaignSeed: active.campaignSeed || ''
  };
}

function startBenchmarkCampaignFromUi_() {
  initializeBenchmarkUiControls_();
  const uiState = readBenchmarkUiControlState_();
  const target = uiState.targetMaxTrialCount;
  if (!target) {
    writeBenchmarkUiStatus_('INPUT ERROR');
    throw new Error('Target max trial count is required.');
  }

  writeBenchmarkUiStatus_('EXPORTING');
  const snapshotExport = exportPhase12BenchmarkSnapshotToDrive_();
  if (!snapshotExport || snapshotExport.ok !== true) {
    writeBenchmarkUiStatus_('EXPORT ERROR');
    throw new Error(snapshotExport && snapshotExport.message ? snapshotExport.message : 'Snapshot export failed.');
  }

  writeBenchmarkUiStatus_('STARTING');
  const config = assertBenchmarkOrchestratorConfigured_();
  const payload = buildBenchmarkCampaignStartPayload_(snapshotExport, uiState);
  const started = callBenchmarkOrchestratorStart_(payload);
  const nowIso = new Date().toISOString();

  setActiveBenchmarkCampaignState_({
    campaignId: started.campaignId || '',
    campaignFolderName: started.campaignFolderName || '',
    status: started.status || 'RUNNING',
    targetMaxTrialCount: String(target),
    startedAtIso: started.startedAt || nowIso,
    pollTriggerUniqueId: '',
    lastPollAtIso: nowIso,
    campaignSeed: started.baseSeed != null ? String(started.baseSeed) : String(payload.baseSeed)
  });

  installBenchmarkCampaignPollTrigger_();
  writeBenchmarkUiStatus_(started.status || 'RUNNING');
  writeBenchmarkUiCampaignProgress_(extractBenchmarkProgressPayload_({
    status: started.status || 'RUNNING',
    campaignFolderName: started.campaignFolderName || '',
    completedRunCount: started.completedRunCount,
    plannedRunCount: started.plannedRunCount,
    currentBestRunId: started.currentBestRunId || '',
    currentBestScore: started.currentBestScore,
    baseSeed: started.baseSeed != null ? String(started.baseSeed) : String(payload.baseSeed)
  }));
  writeBenchmarkUiControlValue_('seedOverride', '');

  const compact = {
    ok: true,
    status: started.status || 'RUNNING',
    campaignId: started.campaignId || '',
    campaignFolderName: started.campaignFolderName || '',
    plannedRunCount: started.plannedRunCount,
    baseSeed: started.baseSeed != null ? String(started.baseSeed) : String(payload.baseSeed),
    targetMaxTrialCount: target,
    expandedTrialCounts: uiState.expandedTrialCounts,
    snapshotFileName: snapshotExport.export ? snapshotExport.export.fileName : '',
    snapshotFileId: snapshotExport.export ? snapshotExport.export.fileId : '',
    orchestratorBaseUrl: config.baseUrl,
    pollTriggerUniqueId: getActiveBenchmarkCampaignState_().pollTriggerUniqueId
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function pollActiveBenchmarkCampaign_() {
  const state = getActiveBenchmarkCampaignState_();
  if (!state.campaignId) {
    return {
      ok: false,
      skipped: true,
      message: 'No active benchmark campaign is stored in Script Properties.'
    };
  }

  const statusResponse = callBenchmarkOrchestratorStatus_(state.campaignId);
  const nowIso = new Date().toISOString();
  state.campaignFolderName = normalizeBenchmarkOrchestrationString_(statusResponse.campaignFolderName) || state.campaignFolderName;
  state.status = normalizeBenchmarkOrchestrationString_(statusResponse.status) || state.status;
  state.campaignSeed = normalizeBenchmarkOrchestrationString_(statusResponse.baseSeed) || state.campaignSeed;
  state.lastPollAtIso = nowIso;
  setActiveBenchmarkCampaignState_(state);

  writeBenchmarkUiCampaignProgress_(extractBenchmarkProgressPayload_(statusResponse));

  let importResult = null;
  if (state.campaignFolderName) {
    try {
      importResult = refreshBenchmarkTablesFromCampaignFolder_(state.campaignFolderName);
    } catch (err) {
      importResult = {
        ok: false,
        message: String(err && err.message ? err.message : err)
      };
    }
  }

  const statusUpper = normalizeBenchmarkOrchestrationString_(statusResponse.status).toUpperCase();
  const activeStatuses = getBenchmarkOrchestrationDefaults_().activeStatusValues;

  const completedRunCount = statusResponse.completedRunCount;
  const plannedRunCount = statusResponse.plannedRunCount;
  const countsShowComplete =
    completedRunCount !== null &&
    completedRunCount !== undefined &&
    plannedRunCount !== null &&
    plannedRunCount !== undefined &&
    Number(completedRunCount) >= Number(plannedRunCount) &&
    Number(plannedRunCount) > 0;
  const bestResultExists =
    normalizeBenchmarkOrchestrationString_(statusResponse.currentBestRunId) ||
    (importResult &&
      importResult.bestWinner &&
      importResult.bestWinner.ok === true &&
      normalizeBenchmarkOrchestrationString_(importResult.bestWinner.runId));
  const importShowsComplete = importResult && importResult.ok === true && countsShowComplete && !!bestResultExists;

  const effectiveStatusUpper =
    statusUpper === activeStatuses.complete ||
    statusUpper === activeStatuses.failed ||
    statusUpper === activeStatuses.cancelled
      ? statusUpper
      : (importShowsComplete ? activeStatuses.complete : statusUpper);

  if (effectiveStatusUpper === activeStatuses.complete) {
    writeBenchmarkUiCampaignProgress_(extractBenchmarkProgressPayload_({
      status: activeStatuses.complete,
      campaignFolderName: state.campaignFolderName,
      completedRunCount: completedRunCount,
      plannedRunCount: plannedRunCount,
      baseSeed: statusResponse.baseSeed != null ? statusResponse.baseSeed : state.campaignSeed,
      currentBestRunId: statusResponse.currentBestRunId ||
        (importResult && importResult.bestWinner && importResult.bestWinner.runId) || '',
      currentBestScore: statusResponse.currentBestScore !== undefined &&
        statusResponse.currentBestScore !== null
          ? statusResponse.currentBestScore
          : (importResult && importResult.bestWinner ? importResult.bestWinner.bestScore : null)
    }));
  }

  if (
    effectiveStatusUpper === activeStatuses.complete ||
    effectiveStatusUpper === activeStatuses.failed ||
    effectiveStatusUpper === activeStatuses.cancelled
  ) {
    removeBenchmarkCampaignPollTrigger_();
    if (effectiveStatusUpper === activeStatuses.complete) {
      writeBenchmarkUiStatus_('COMPLETE');
    } else if (effectiveStatusUpper === activeStatuses.failed) {
      writeBenchmarkUiStatus_(statusResponse.errorMessage ? 'FAILED: ' + statusResponse.errorMessage : 'FAILED');
    } else {
      writeBenchmarkUiStatus_('CANCELLED');
    }
    const finishedState = getActiveBenchmarkCampaignState_();
    finishedState.status = effectiveStatusUpper;
    setActiveBenchmarkCampaignState_(finishedState);
  }

  const compact = {
    ok: true,
    campaignId: state.campaignId,
    campaignFolderName: state.campaignFolderName,
    status: effectiveStatusUpper || state.status,
    completedRunCount: completedRunCount,
    plannedRunCount: plannedRunCount,
    currentBestRunId: statusResponse.currentBestRunId ||
      (importResult && importResult.bestWinner && importResult.bestWinner.runId) || '',
    currentBestScore: statusResponse.currentBestScore !== undefined &&
      statusResponse.currentBestScore !== null
        ? statusResponse.currentBestScore
        : (importResult && importResult.bestWinner ? importResult.bestWinner.bestScore : null),
    errorMessage: statusResponse.errorMessage || statusResponse.error || '',
    importOk: importResult ? importResult.ok === true : false,
    importMessage: importResult && importResult.ok !== true ? importResult.message || '' : ''
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function clearActiveBenchmarkCampaignUiAndState_() {
  removeBenchmarkCampaignPollTrigger_();
  clearActiveBenchmarkCampaignState_();
  clearBenchmarkUiCampaignProgress_();
  return { ok: true };
}

function runBenchmarkLadderFromUi() {
  return startBenchmarkCampaignFromUi_();
}

function refreshActiveBenchmarkCampaignStatus() {
  return pollActiveBenchmarkCampaign_();
}

function pollActiveBenchmarkCampaign() {
  return pollActiveBenchmarkCampaign_();
}

function stopActiveBenchmarkCampaignPolling() {
  const removedCount = removeBenchmarkCampaignPollTrigger_();
  writeBenchmarkUiStatus_('STOPPED');
  const state = getActiveBenchmarkCampaignState_();
  state.status = 'STOPPED';
  setActiveBenchmarkCampaignState_(state);
  const compact = {
    ok: true,
    removedTriggerCount: removedCount,
    state: buildCompactBenchmarkCampaignStateSummary_(state)
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function debugBenchmarkOrchestratorConfig() {
  const config = getBenchmarkOrchestratorConfig_();
  const compact = {
    ok: true,
    baseUrl: config.baseUrl,
    startUrl: config.startUrl,
    statusUrl: config.statusUrl,
    hasAuthToken: Boolean(config.authToken),
    isConfigured: config.isConfigured,
    pollEveryMinutes: config.pollEveryMinutes,
    repeats: config.repeats,
    baseSeed: config.baseSeed
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function debugActiveBenchmarkCampaignState() {
  const compact = buildCompactBenchmarkCampaignStateSummary_();
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}
