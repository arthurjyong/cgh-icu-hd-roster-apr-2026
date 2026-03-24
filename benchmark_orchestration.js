function getBenchmarkOrchestrationDefaults_() {
  return {
    startPath: '/campaigns/start',
    statusPath: '/campaigns/status',
    artifactFileName: 'benchmark_campaign_report_v1.json',
    pollEveryMinutes: 1,
    repeats: 1,
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
    activeBackendStatus: prefix + 'ACTIVE_BACKEND_STATUS',
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
    backendStatus: normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.activeBackendStatus)),
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
  values[keys.activeBackendStatus] = normalizeBenchmarkOrchestrationString_(payload.backendStatus);
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
  properties.deleteProperty(keys.activeBackendStatus);
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

function countBenchmarkCampaignPollTriggers_() {
  const functionName = getBenchmarkCampaignPollTriggerFunctionName_();
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === functionName) {
      count += 1;
    }
  }
  return count;
}

function ensureBenchmarkCampaignPollTriggerHygiene_(hasActiveCampaign) {
  const active = hasActiveCampaign === true;
  const triggerCount = countBenchmarkCampaignPollTriggers_();
  if (!active && triggerCount > 0) {
    removeBenchmarkCampaignPollTrigger_();
    return {
      cleaned: true,
      removed: triggerCount,
      installed: false
    };
  }

  if (active && triggerCount !== 1) {
    installBenchmarkCampaignPollTrigger_();
    return {
      cleaned: true,
      removed: Math.max(0, triggerCount - 1),
      installed: true
    };
  }

  return {
    cleaned: false,
    removed: 0,
    installed: false
  };
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
  const chunkPlan = deriveBenchmarkCampaignChunkPlanFromTarget_(ui.targetMaxTrialCount);
  const campaignTrialCounts = chunkPlan.campaignTrialCounts;
  const campaignRepeats = chunkPlan.campaignRepeats;

  return {
    mode: 'CAMPAIGN',
    source: 'APPS_SCRIPT_UI',
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    spreadsheetName: SpreadsheetApp.getActive().getName(),
    sheetName: SpreadsheetApp.getActiveSheet().getName(),
    targetMaxTrialCount: ui.targetMaxTrialCount,
    campaignTrialCounts: campaignTrialCounts,
    campaignRepeats: campaignRepeats,
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

function parseBenchmarkIsoDateOrNull_(value) {
  const normalized = normalizeBenchmarkOrchestrationString_(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function computeBenchmarkFreshnessBucket_(lastBackendConfirmedAtIso) {
  const lastConfirmed = parseBenchmarkIsoDateOrNull_(lastBackendConfirmedAtIso);
  if (!lastConfirmed) {
    return {
      bucket: 'UNKNOWN',
      ageMinutes: null
    };
  }

  const ageMs = Math.max(0, Date.now() - lastConfirmed.getTime());
  const ageMinutes = ageMs / 60000;
  const intervalMinutes = Math.max(1, Number(getBenchmarkOrchestrationDefaults_().pollEveryMinutes || 1));
  if (ageMinutes <= intervalMinutes * 2) {
    return { bucket: 'FRESH', ageMinutes: ageMinutes };
  }
  if (ageMinutes <= intervalMinutes * 5) {
    return { bucket: 'AGING', ageMinutes: ageMinutes };
  }
  return { bucket: 'STALE', ageMinutes: ageMinutes };
}

function buildBenchmarkStatusProjectionState_(payload) {
  const source = payload || {};
  const backendStatus = normalizeBenchmarkOrchestrationString_(source.backendStatus).toUpperCase();
  const activeStatuses = getBenchmarkOrchestrationDefaults_().activeStatusValues;
  const importAttempted = source.importAttempted === true;
  const importOk = source.importOk === true;
  const reconciliationState = normalizeBenchmarkOrchestrationString_(source.reconciliationState).toUpperCase();

  if (backendStatus === activeStatuses.failed) {
    return 'FAILED';
  }
  if (backendStatus === activeStatuses.cancelled) {
    return 'CANCELLED';
  }
  if (backendStatus === activeStatuses.complete) {
    if (!importAttempted) {
      return 'BACKEND_COMPLETE_UNIMPORTED';
    }
    if (!importOk) {
      return 'IMPORT_FAILED';
    }
    if (reconciliationState === 'FAILED') {
      return 'RECONCILIATION_FAILED';
    }
    if (reconciliationState === 'DESYNC') {
      return 'DESYNC_DETECTED';
    }
    return 'COMPLETE';
  }

  if (backendStatus === activeStatuses.pending || backendStatus === activeStatuses.running) {
    if (importAttempted && !importOk) {
      return 'IMPORT_FAILED';
    }
    return 'RUNNING';
  }

  return backendStatus || 'RUNNING';
}

function buildBenchmarkReconciliationResult_(context) {
  const source = context || {};
  const issues = [];
  const activeStatuses = getBenchmarkOrchestrationDefaults_().activeStatusValues;
  const statusResponse = source.statusResponse || {};
  const importResult = source.importResult || null;
  const activeCampaignFolderName = normalizeBenchmarkOrchestrationString_(source.activeCampaignFolderName);
  const backendStatus = normalizeBenchmarkOrchestrationString_(statusResponse.status).toUpperCase();
  const completedRunCount = statusResponse.completedRunCount;
  const plannedRunCount = statusResponse.plannedRunCount;
  const backendCountsKnown = completedRunCount !== null && completedRunCount !== undefined &&
    plannedRunCount !== null && plannedRunCount !== undefined;
  const backendCountsTerminal = backendCountsKnown ? (
    Number(completedRunCount) === Number(plannedRunCount) && Number(plannedRunCount) >= 0
  ) : true;

  const importAttempted = !!importResult;
  const importOk = !!(importResult && importResult.ok === true);
  const importSummary = importResult && importResult.summary ? importResult.summary : null;
  const importedRunCount = importSummary && importSummary.importedRunCount !== undefined
    ? Number(importSummary.importedRunCount)
    : null;
  const reportCompletedCount = importSummary && importSummary.completedCount !== undefined
    ? Number(importSummary.completedCount)
    : null;
  const importedCampaignFolderName = normalizeBenchmarkOrchestrationString_(
    importResult && importResult.loaded ? importResult.loaded.campaignFolderName : ''
  );

  if (importAttempted && !importOk) {
    issues.push(importResult.message || 'Import failed.');
  }

  if (importOk && activeCampaignFolderName && importedCampaignFolderName && importedCampaignFolderName !== activeCampaignFolderName) {
    issues.push(
      'Imported campaign folder "' + importedCampaignFolderName + '" does not match active campaign folder "' + activeCampaignFolderName + '".'
    );
  }

  if (backendStatus === activeStatuses.complete || backendStatus === 'COMPLETE') {
    if (!importAttempted) {
      issues.push('Backend is COMPLETE but campaign report import has not been attempted yet.');
    } else if (!importOk) {
      issues.push('Backend is COMPLETE but campaign report import failed.');
    }
    if (!backendCountsTerminal) {
      issues.push('Backend is COMPLETE but completed/planned counts are inconsistent.');
    }
    if (importOk && backendCountsKnown && importedRunCount !== null && importedRunCount !== Number(plannedRunCount)) {
      issues.push(
        'Imported run count (' + importedRunCount + ') does not match planned run count (' + Number(plannedRunCount) + ').'
      );
    }
    if (importOk && backendCountsKnown && reportCompletedCount !== null && reportCompletedCount !== Number(completedRunCount)) {
      issues.push(
        'Report completed count (' + reportCompletedCount + ') does not match backend completed count (' + Number(completedRunCount) + ').'
      );
    }
  }

  return {
    ok: issues.length === 0,
    reconciliationState: issues.length === 0
      ? 'PASSED'
      : (!importOk ? 'FAILED' : (backendStatus === activeStatuses.complete ? 'FAILED' : 'DESYNC')),
    warning: issues.length > 0 ? issues[0] : '',
    issues: issues,
    importAttempted: importAttempted,
    importOk: importOk
  };
}

function refreshBenchmarkTablesFromCampaignFolder_(campaignFolderName) {
  const folderName = normalizeBenchmarkOrchestrationString_(campaignFolderName);
  if (!folderName) {
    return { ok: false, skipped: true, message: 'campaignFolderName is blank.' };
  }
  setPhase13CampaignImportSelectedCampaignFolder(folderName);
  setPhase13CampaignImportSelectedArtifactFileName(getBenchmarkOrchestrationDefaults_().artifactFileName);
  let imported = null;
  try {
    imported = runAppendSelectedBenchmarkCampaignReportToTrialsSheet();
  } catch (err) {
    return {
      ok: false,
      campaignFolderName: folderName,
      message: String(err && err.message ? err.message : err),
      bestWinner: null
    };
  }

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
    bestWinner: bestWinner,
    loaded: imported && imported.loaded ? imported.loaded : null,
    summary: imported && imported.summary ? imported.summary : null,
    writeResult: imported && imported.writeResult ? imported.writeResult : null
  };
}

function buildCompactBenchmarkCampaignStateSummary_(state) {
  const active = state || getActiveBenchmarkCampaignState_();
  return {
    ok: true,
    campaignId: active.campaignId || '',
    campaignFolderName: active.campaignFolderName || '',
    status: active.status || '',
    backendStatus: active.backendStatus || '',
    targetMaxTrialCount: active.targetMaxTrialCount || '',
    startedAtIso: active.startedAtIso || '',
    pollTriggerUniqueId: active.pollTriggerUniqueId || '',
    lastPollAtIso: active.lastPollAtIso || '',
    campaignSeed: active.campaignSeed || ''
  };
}

function ensureBenchmarkTabsCompleteOrReset_() {
  const spreadsheet = SpreadsheetApp.getActive();
  const trialsSheetName = getBenchmarkTrialsSheetName_();
  const reviewSheetName = getBenchmarkReviewSheetName_();
  const requiredSheetNames = [trialsSheetName, reviewSheetName];
  const missingSheetNames = [];
  for (let i = 0; i < requiredSheetNames.length; i++) {
    const requiredName = requiredSheetNames[i];
    if (!spreadsheet.getSheetByName(requiredName)) {
      missingSheetNames.push(requiredName);
    }
  }

  const missingTrialsSheet = missingSheetNames.indexOf(trialsSheetName) !== -1;
  const missingReviewSheet = missingSheetNames.indexOf(reviewSheetName) !== -1;

  if (missingTrialsSheet) {
    resetBenchmarkSheets();
    return {
      ok: true,
      resetTriggered: true,
      missingSheetNames: missingSheetNames
    };
  }

  if (missingReviewSheet) {
    refreshBenchmarkReviewSheet();
  }

  return {
    ok: true,
    resetTriggered: false,
    missingSheetNames: missingSheetNames
  };
}

function maybeAutoApplyOperationalBestWinner_(options) {
  const context = options || {};
  let selection;
  try {
    selection = selectBestBenchmarkTrialsWinnerForWriteback_();
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      reason: 'NO_VALID_BEST_WINNER',
      message: String(err && err.message ? err.message : err)
    };
  }

  const candidate = selection && selection.candidateRow ? selection.candidateRow : {};
  const newBestScore = candidate && typeof candidate.BestScore === 'number' ? candidate.BestScore : null;
  if (newBestScore === null) {
    return {
      ok: false,
      skipped: true,
      reason: 'BEST_SCORE_MISSING',
      message: 'Best candidate is missing numeric BestScore.'
    };
  }

  const metadata = readBenchmarkUiAppliedRosterMetadata_();
  const previousAppliedScore = metadata.lastAppliedBestScore;
  const shouldApply = previousAppliedScore === null || newBestScore < previousAppliedScore;
  if (!shouldApply) {
    return {
      ok: true,
      skipped: true,
      reason: 'STRICT_LOWER_REQUIRED',
      lastAppliedBestScore: previousAppliedScore,
      candidateBestScore: newBestScore
    };
  }

  try {
    writeTransportTrialResultToSheet_(selection.transportResult);
    writeBenchmarkUiAppliedRosterMetadata_({
      lastAppliedBestScore: newBestScore,
      lastAppliedRunId: candidate.RunId || '',
      lastAppliedCampaignFolder: candidate.CampaignFolderName || context.campaignFolderName || '',
      lastAppliedTimestamp: new Date(),
      lastAppliedSourceMode: context.sourceMode || 'OPERATIONAL_RED_BUTTON'
    });
    return {
      ok: true,
      applied: true,
      lastAppliedBestScore: newBestScore,
      runId: candidate.RunId || '',
      campaignFolderName: candidate.CampaignFolderName || context.campaignFolderName || ''
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    writeBenchmarkUiStatus_('RUNNING: AUTO-APPLY ERROR');
    Logger.log(JSON.stringify({
      ok: false,
      stage: 'auto_apply_operational_best',
      message: message
    }, null, 2));
    return {
      ok: false,
      applied: false,
      message: message
    };
  }
}

function startBenchmarkCampaignFromUi_() {
  const benchmarkTabGuard = ensureBenchmarkTabsCompleteOrReset_();
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
  writeBenchmarkUiOperationalHealth_({
    statusSource: 'APPS_SCRIPT_START',
    freshness: 'UNKNOWN',
    reconciliationState: 'PENDING',
    warning: '',
    lastBackendConfirmedAt: ''
  });
  const config = assertBenchmarkOrchestratorConfigured_();
  const payload = buildBenchmarkCampaignStartPayload_(snapshotExport, uiState);
  const started = callBenchmarkOrchestratorStart_(payload);
  const nowIso = new Date().toISOString();

  setActiveBenchmarkCampaignState_({
    campaignId: started.campaignId || '',
    campaignFolderName: started.campaignFolderName || '',
    status: 'STARTING',
    backendStatus: started.status || 'RUNNING',
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
    pollTriggerUniqueId: getActiveBenchmarkCampaignState_().pollTriggerUniqueId,
    benchmarkTabGuard: benchmarkTabGuard
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function pollActiveBenchmarkCampaign_() {
  const state = getActiveBenchmarkCampaignState_();
  if (!state.campaignId) {
    ensureBenchmarkCampaignPollTriggerHygiene_(false);
    writeBenchmarkUiStatus_('IDLE');
    writeBenchmarkUiOperationalHealth_({
      statusSource: 'NO_ACTIVE_CAMPAIGN',
      freshness: 'UNKNOWN',
      reconciliationState: 'UNKNOWN',
      warning: 'No active campaign metadata; cleaned up poll trigger.',
      lastBackendConfirmedAt: ''
    });
    return {
      ok: false,
      skipped: true,
      message: 'No active benchmark campaign is stored in Script Properties.'
    };
  }

  const storedStatusUpper = normalizeBenchmarkOrchestrationString_(state.status).toUpperCase();
  const activeStatuses = getBenchmarkOrchestrationDefaults_().activeStatusValues;
  if (
    storedStatusUpper === activeStatuses.complete ||
    storedStatusUpper === activeStatuses.failed ||
    storedStatusUpper === activeStatuses.cancelled
  ) {
    removeBenchmarkCampaignPollTrigger_();
    writeBenchmarkUiOperationalHealth_({
      statusSource: 'SCRIPT_PROPERTIES_TERMINAL',
      freshness: 'UNKNOWN',
      reconciliationState: 'UNKNOWN',
      warning: 'Terminal projected state stored; cleaned up poll trigger.',
      lastBackendConfirmedAt: ''
    });
    return {
      ok: true,
      skipped: true,
      message: 'Terminal campaign state already stored; poll trigger removed.'
    };
  }

  ensureBenchmarkCampaignPollTriggerHygiene_(true);

  const statusResponse = callBenchmarkOrchestratorStatus_(state.campaignId);
  const nowIso = new Date().toISOString();
  state.campaignFolderName = normalizeBenchmarkOrchestrationString_(statusResponse.campaignFolderName) || state.campaignFolderName;
  state.backendStatus = normalizeBenchmarkOrchestrationString_(statusResponse.status) || state.backendStatus;
  state.campaignSeed = normalizeBenchmarkOrchestrationString_(statusResponse.baseSeed) || state.campaignSeed;
  state.lastPollAtIso = nowIso;

  writeBenchmarkUiCampaignProgress_(extractBenchmarkProgressPayload_(statusResponse));

  let importResult = null;
  let autoApplyResult = null;
  let importAttempted = false;
  if (state.campaignFolderName) {
    try {
      importAttempted = true;
      writeBenchmarkUiStatus_('IMPORTING');
      importResult = refreshBenchmarkTablesFromCampaignFolder_(state.campaignFolderName);
      if (importResult && importResult.ok === true) {
        autoApplyResult = maybeAutoApplyOperationalBestWinner_({
          campaignFolderName: state.campaignFolderName,
          sourceMode: 'OPERATIONAL_MID_RUN'
        });
      } else {
        autoApplyResult = {
          ok: false,
          skipped: true,
          reason: 'IMPORT_NOT_OK',
          message: importResult && importResult.message
            ? importResult.message
            : 'Skipped auto-apply because campaign import was not successful.'
        };
      }
    } catch (err) {
      importResult = {
        ok: false,
        message: String(err && err.message ? err.message : err)
      };
      autoApplyResult = {
        ok: false,
        skipped: true,
        reason: 'IMPORT_EXCEPTION',
        message: importResult.message
      };
    }
  }

  const statusUpper = normalizeBenchmarkOrchestrationString_(statusResponse.status).toUpperCase();
  const completedRunCount = statusResponse.completedRunCount;
  const plannedRunCount = statusResponse.plannedRunCount;
  const reconciliation = buildBenchmarkReconciliationResult_({
    statusResponse: statusResponse,
    importResult: importResult,
    activeCampaignFolderName: state.campaignFolderName
  });
  const projectedState = buildBenchmarkStatusProjectionState_({
    backendStatus: statusUpper,
    importAttempted: importAttempted,
    importOk: importResult ? importResult.ok === true : false,
    reconciliationState: reconciliation.reconciliationState
  });

  const freshness = computeBenchmarkFreshnessBucket_(statusResponse.lastUpdated || statusResponse.completedAt || '');
  const staleWarning = freshness.bucket === 'STALE'
    ? 'Status may be stale; last backend confirmation at ' + (statusResponse.lastUpdated || statusResponse.completedAt || 'unknown') + '.'
    : '';
  const warningMessages = [];
  if (reconciliation.warning) {
    warningMessages.push(reconciliation.warning);
  }
  if (staleWarning) {
    warningMessages.push(staleWarning);
  }

  writeBenchmarkUiOperationalHealth_({
    statusSource: statusResponse.contractVersion ? 'BACKEND_STATUS_FILE' : 'ORCHESTRATOR_RUNTIME',
    freshness: freshness.bucket,
    reconciliationState: reconciliation.reconciliationState,
    warning: warningMessages.join(' | '),
    lastBackendConfirmedAt: statusResponse.lastUpdated || statusResponse.completedAt || ''
  });

  if (projectedState === 'COMPLETE') {
    const finalAutoApplyResult = maybeAutoApplyOperationalBestWinner_({
      campaignFolderName: state.campaignFolderName,
      sourceMode: 'OPERATIONAL_FINAL'
    });
    if (!autoApplyResult) {
      autoApplyResult = finalAutoApplyResult;
    }
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
    projectedState === 'COMPLETE' ||
    projectedState === 'FAILED' ||
    projectedState === 'CANCELLED'
  ) {
    removeBenchmarkCampaignPollTrigger_();
    if (projectedState === 'COMPLETE') {
      writeBenchmarkUiStatus_('COMPLETE');
    } else if (projectedState === 'FAILED') {
      writeBenchmarkUiStatus_(statusResponse.errorMessage ? 'FAILED: ' + statusResponse.errorMessage : 'FAILED');
    } else {
      writeBenchmarkUiStatus_('CANCELLED');
    }
    const finishedState = state;
    finishedState.status = projectedState;
    finishedState.backendStatus = statusUpper;
    setActiveBenchmarkCampaignState_(finishedState);
  } else {
    state.status = projectedState;
    setActiveBenchmarkCampaignState_(state);
    writeBenchmarkUiStatus_(projectedState);
  }

  const compact = {
    ok: true,
    campaignId: state.campaignId,
    campaignFolderName: state.campaignFolderName,
    status: projectedState,
    backendStatus: statusUpper || state.backendStatus,
    completedRunCount: completedRunCount,
    plannedRunCount: plannedRunCount,
    currentBestRunId: statusResponse.currentBestRunId ||
      (importResult && importResult.bestWinner && importResult.bestWinner.runId) || '',
    currentBestScore: statusResponse.currentBestScore !== undefined &&
      statusResponse.currentBestScore !== null
        ? statusResponse.currentBestScore
        : (importResult && importResult.bestWinner ? importResult.bestWinner.bestScore : null),
    errorMessage: statusResponse.errorMessage || statusResponse.error || '',
    statusSource: statusResponse.contractVersion ? 'BACKEND_STATUS_FILE' : 'ORCHESTRATOR_RUNTIME',
    freshness: freshness.bucket,
    reconciliationState: reconciliation.reconciliationState,
    warning: warningMessages.join(' | '),
    lastBackendConfirmedAt: statusResponse.lastUpdated || statusResponse.completedAt || '',
    importOk: importResult ? importResult.ok === true : false,
    importMessage: importResult && importResult.ok !== true ? importResult.message || '' : '',
    autoApplyOk: autoApplyResult ? autoApplyResult.ok === true : false,
    autoApplyApplied: autoApplyResult ? autoApplyResult.applied === true : false,
    autoApplyMessage: autoApplyResult && autoApplyResult.ok !== true ? autoApplyResult.message || '' : ''
  };
  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function clearActiveBenchmarkCampaignUiAndState_() {
  removeBenchmarkCampaignPollTrigger_();
  clearActiveBenchmarkCampaignState_();
  clearBenchmarkUiCampaignProgress_();
  writeBenchmarkUiOperationalHealth_({
    statusSource: '',
    freshness: '',
    reconciliationState: '',
    warning: '',
    lastBackendConfirmedAt: ''
  });
  return { ok: true };
}

function runBenchmarkLadderFromUi() {
  return startBenchmarkCampaignFromUi_();
}

function runBenchmarkCampaignFromUi() {
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
  writeBenchmarkUiOperationalHealth_({
    statusSource: 'MANUAL_STOP',
    freshness: 'UNKNOWN',
    reconciliationState: 'UNKNOWN',
    warning: 'Polling manually stopped.',
    lastBackendConfirmedAt: ''
  });
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
