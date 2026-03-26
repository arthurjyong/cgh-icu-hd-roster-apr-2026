function getBenchmarkOrchestrationDefaults_() {
  return {
    startPath: '/campaigns/start',
    statusPath: '/campaigns/status',
    artifactFileName: 'benchmark_campaign_report_v1.json',
    pollEveryMinutes: 10,
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
    campaignSeed: prefix + 'CAMPAIGN_SEED',
    chainStateJson: prefix + 'CHAIN_STATE_JSON'
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

function getBenchmarkCampaignChainState_() {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  const raw = normalizeBenchmarkOrchestrationString_(properties.getProperty(keys.chainStateJson));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function setBenchmarkCampaignChainState_(chainState) {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  if (!chainState) {
    properties.deleteProperty(keys.chainStateJson);
    return;
  }
  properties.setProperty(keys.chainStateJson, JSON.stringify(chainState));
}

function clearBenchmarkCampaignChainState_() {
  const properties = PropertiesService.getScriptProperties();
  const keys = getBenchmarkOrchestrationPropertyKeys_();
  properties.deleteProperty(keys.chainStateJson);
}

function getBenchmarkCampaignMaxTrialsPerSegment_() {
  return 1000000;
}

function deriveBenchmarkCampaignSegmentTargets_(targetMaxTrialCount) {
  const target = Number(targetMaxTrialCount);
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error('Target max trial count must be a positive number.');
  }
  const maxPerSegment = getBenchmarkCampaignMaxTrialsPerSegment_();
  const segments = [];
  let remaining = Math.floor(target);
  while (remaining > 0) {
    const current = Math.min(maxPerSegment, remaining);
    segments.push(current);
    remaining -= current;
  }
  return segments;
}

function buildBenchmarkCampaignChainProgressText_(segmentIndex, totalSegments) {
  const index = Number(segmentIndex);
  const total = Number(totalSegments);
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 0) {
    return 'Single cycle run';
  }
  if (total <= 1) {
    return 'Single cycle run';
  }
  return 'Cycle ' + String(index + 1) + ' of ' + String(total) + ' (1M-trial batches)';
}

function computeBenchmarkCampaignSegmentSeed_(baseSeed, segmentIndex) {
  const parsedBase = Number(baseSeed);
  const parsedIndex = Number(segmentIndex);
  if (!Number.isInteger(parsedBase) || !Number.isInteger(parsedIndex)) {
    return String(baseSeed);
  }
  return String(parsedBase + parsedIndex);
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

function buildBenchmarkCampaignStartPayload_(snapshotExportResult, uiState, options) {
  if (!snapshotExportResult || snapshotExportResult.ok !== true) {
    throw new Error('A successful snapshot export result is required.');
  }
  const ui = uiState || readBenchmarkUiControlState_();
  const source = options || {};
  const exportInfo = snapshotExportResult.export || {};
  const requestedTarget = source.targetMaxTrialCount != null
    ? Number(source.targetMaxTrialCount)
    : Number(ui.targetMaxTrialCount);
  if (!Number.isFinite(requestedTarget) || requestedTarget <= 0) {
    throw new Error('targetMaxTrialCount must be a positive integer.');
  }
  const baseSeed = source.baseSeed != null
    ? String(source.baseSeed)
    : resolveBenchmarkCampaignSeedFromUi_(ui);
  const chunkPlan = deriveBenchmarkCampaignChunkPlanFromTarget_(requestedTarget);
  const campaignTrialCounts = chunkPlan.campaignTrialCounts;
  const campaignRepeats = chunkPlan.campaignRepeats;
  const campaignBatchLabel = normalizeBenchmarkOrchestrationString_(source.campaignBatchLabel) ||
    buildBenchmarkCampaignBatchLabelFromUi_(ui.targetMaxTrialCount);

  return {
    mode: 'CAMPAIGN',
    source: 'APPS_SCRIPT_UI',
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    spreadsheetName: SpreadsheetApp.getActive().getName(),
    sheetName: SpreadsheetApp.getActiveSheet().getName(),
    targetMaxTrialCount: requestedTarget,
    campaignTrialCounts: campaignTrialCounts,
    campaignRepeats: campaignRepeats,
    baseSeed: baseSeed,
    campaignBatchLabel: campaignBatchLabel,
    snapshot: {
      contractVersion: snapshotExportResult.contractVersion || null,
      fileId: exportInfo.fileId || null,
      fileName: exportInfo.fileName || null,
      exportedAtIso: exportInfo.exportedAtIso || null
    },
    resolvedBaseSeed: baseSeed
  };
}

function startBenchmarkCampaignSegment_(context) {
  const source = context || {};
  const snapshotExport = source.snapshotExport;
  const uiState = source.uiState || readBenchmarkUiControlState_();
  const segmentTarget = Number(source.segmentTargetMaxTrialCount);
  if (!Number.isFinite(segmentTarget) || segmentTarget <= 0) {
    throw new Error('segmentTargetMaxTrialCount must be a positive integer.');
  }
  const payload = buildBenchmarkCampaignStartPayload_(snapshotExport, uiState, {
    targetMaxTrialCount: segmentTarget,
    baseSeed: source.baseSeed,
    campaignBatchLabel: source.campaignBatchLabel
  });
  const started = callBenchmarkOrchestratorStart_(payload);
  const nowIso = new Date().toISOString();
  const requestedTarget = source.requestedTargetMaxTrialCount != null
    ? Number(source.requestedTargetMaxTrialCount)
    : segmentTarget;
  setActiveBenchmarkCampaignState_({
    campaignId: started.campaignId || '',
    campaignFolderName: started.campaignFolderName || '',
    status: 'STARTING',
    backendStatus: started.status || 'RUNNING',
    targetMaxTrialCount: String(requestedTarget),
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
    baseSeed: started.baseSeed != null ? String(started.baseSeed) : String(payload.baseSeed),
    chainProgressText: normalizeBenchmarkOrchestrationString_(source.chainProgressText)
  }));

  return {
    payload: payload,
    started: started
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
    campaignSeed: response.baseSeed != null ? String(response.baseSeed) : '',
    chainProgressText: response.chainProgressText || ''
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

function getBenchmarkSearchLogRunCountForCampaignFolder_(campaignFolderName) {
  if (typeof readBenchmarkTrialsRowsAsObjects_ !== 'function') {
    return {
      ok: false,
      count: null,
      message: 'readBenchmarkTrialsRowsAsObjects_ unavailable.'
    };
  }

  const folderName = normalizeBenchmarkOrchestrationString_(campaignFolderName);
  const rowsData = readBenchmarkTrialsRowsAsObjects_();
  const rows = rowsData && Array.isArray(rowsData.rows) ? rowsData.rows : [];
  const uniqueRunIds = {};
  let count = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const rowFolder = normalizeBenchmarkOrchestrationString_(row.CampaignFolderName);
    if (!rowFolder || rowFolder !== folderName) {
      continue;
    }
    const runIdKey = normalizeBenchmarkOrchestrationString_(row.RunId).toLowerCase();
    if (!runIdKey || uniqueRunIds[runIdKey]) {
      continue;
    }
    uniqueRunIds[runIdKey] = true;
    count += 1;
  }

  return {
    ok: true,
    count: count
  };
}

function getBenchmarkScorerConfigProgressSnapshot_() {
  if (typeof resolveBenchmarkUiControlRange_ !== 'function') {
    return {
      ok: false,
      completedRuns: null,
      plannedRuns: null,
      message: 'resolveBenchmarkUiControlRange_ unavailable.'
    };
  }

  const completedRaw = resolveBenchmarkUiControlRange_('completedRuns').getValue();
  const plannedRaw = resolveBenchmarkUiControlRange_('plannedRuns').getValue();
  const completedRuns = completedRaw === '' || completedRaw === null || completedRaw === undefined
    ? null
    : Number(completedRaw);
  const plannedRuns = plannedRaw === '' || plannedRaw === null || plannedRaw === undefined
    ? null
    : Number(plannedRaw);

  return {
    ok: true,
    completedRuns: Number.isFinite(completedRuns) ? completedRuns : null,
    plannedRuns: Number.isFinite(plannedRuns) ? plannedRuns : null
  };
}

function evaluateBenchmarkTerminalReconciliationGate_(context) {
  const source = context || {};
  const expectedCompleted = Number(source.expectedCompleted);
  const expectedPlanned = Number(source.expectedPlanned);
  const campaignFolderName = normalizeBenchmarkOrchestrationString_(source.campaignFolderName);
  const searchLog = getBenchmarkSearchLogRunCountForCampaignFolder_(campaignFolderName);
  const scorerConfig = getBenchmarkScorerConfigProgressSnapshot_();

  const checks = {
    backendTerminalCounts: Number.isFinite(expectedCompleted) && Number.isFinite(expectedPlanned) &&
      expectedCompleted === expectedPlanned && expectedPlanned >= 0,
    searchLogMatched: searchLog.ok === true && Number(searchLog.count) === expectedPlanned,
    scorerConfigMatched: scorerConfig.ok === true &&
      Number(scorerConfig.completedRuns) === expectedCompleted &&
      Number(scorerConfig.plannedRuns) === expectedPlanned
  };

  const issues = [];
  if (!checks.backendTerminalCounts) {
    issues.push('Backend terminal counts are not confirmed.');
  }
  if (!checks.searchLogMatched) {
    issues.push('SEARCH_LOG campaign run count mismatch. expected=' + expectedPlanned + ', actual=' + searchLog.count + '.');
  }
  if (!checks.scorerConfigMatched) {
    issues.push(
      'SCORER_CONFIG progress mismatch. expected completed/planned=' +
      expectedCompleted + '/' + expectedPlanned +
      ', actual=' + scorerConfig.completedRuns + '/' + scorerConfig.plannedRuns + '.'
    );
  }

  return {
    ok: issues.length === 0,
    issues: issues,
    checks: checks,
    searchLog: searchLog,
    scorerConfig: scorerConfig,
    signature: JSON.stringify({
      searchLogCount: searchLog.count,
      scorerCompletedRuns: scorerConfig.completedRuns,
      scorerPlannedRuns: scorerConfig.plannedRuns,
      expectedCompleted: expectedCompleted,
      expectedPlanned: expectedPlanned
    })
  };
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
  if (reconciliationState === 'DESYNC') {
    return 'DESYNC_DETECTED';
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
  const importedRunCount = importSummary && importSummary.importedRunCount !== undefined && importSummary.importedRunCount !== null
    ? Number(importSummary.importedRunCount)
    : null;
  const reportCompletedCount = importSummary && importSummary.completedCount !== undefined && importSummary.completedCount !== null
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
  let winnerSource = '';
  const importedSummary = imported && imported.summary ? imported.summary : null;
  const importedWinnerRunId = normalizeBenchmarkOrchestrationString_(importedSummary && importedSummary.winnerRunId);
  const importedWinnerBestScore = importedSummary && importedSummary.winnerBestScore !== undefined
    ? importedSummary.winnerBestScore
    : null;
  if (importedWinnerRunId) {
    bestWinner = {
      ok: true,
      runId: importedWinnerRunId,
      bestScore: importedWinnerBestScore,
      campaignFolderName: folderName
    };
    winnerSource = 'IMPORTED_REPORT_WINNER';
  }

  if (!bestWinner) {
    try {
      const scoped = findBenchmarkTrialsBestCandidateForCampaignFolder_(folderName);
      if (scoped && scoped.ok === true) {
        bestWinner = {
          ok: true,
          runId: scoped.runId || '',
          bestScore: scoped.bestScore,
          campaignFolderName: folderName,
          matchedCandidateCount: scoped.matchedCandidateCount,
          rowNumber: scoped.rowNumber
        };
        winnerSource = 'SEARCH_LOG_CAMPAIGN_SCOPED_MIN_BEST_SCORE';
      } else {
        bestWinner = {
          ok: false,
          skipped: true,
          reason: scoped && scoped.reason ? scoped.reason : 'NO_CAMPAIGN_WINNER_FOUND',
          message: scoped && scoped.message
            ? scoped.message
            : 'No campaign-scoped winner found in SEARCH_LOG.'
        };
      }
    } catch (err) {
      bestWinner = { ok: false, message: String(err && err.message ? err.message : err) };
    }
  }

  if (bestWinner && bestWinner.ok === true) {
    const chainState = getBenchmarkCampaignChainState_();
    writeBenchmarkUiCampaignProgress_({
      campaignFolderName: folderName,
      currentBestRunId: bestWinner.runId || '',
      currentBestScore: bestWinner.bestScore,
      campaignSeed: getActiveBenchmarkCampaignState_().campaignSeed || '',
      chainProgressText: buildBenchmarkCampaignChainProgressText_(
        chainState ? Number(chainState.currentSegmentIndex || 0) : 0,
        chainState ? Number(chainState.totalSegments || 1) : 1
      )
    });
  }

  return {
    ok: true,
    campaignFolderName: folderName,
    winnerSource: winnerSource,
    bestWinner: bestWinner,
    loaded: imported && imported.loaded ? imported.loaded : null,
    summary: imported && imported.summary ? imported.summary : null,
    writeResult: imported && imported.writeResult ? imported.writeResult : null
  };
}

function buildCompactBenchmarkCampaignStateSummary_(state) {
  const active = state || getActiveBenchmarkCampaignState_();
  const chainState = getBenchmarkCampaignChainState_();
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
    campaignSeed: active.campaignSeed || '',
    chainProgressText: buildBenchmarkCampaignChainProgressText_(
      chainState ? Number(chainState.currentSegmentIndex || 0) : 0,
      chainState ? Number(chainState.totalSegments || 1) : 1
    )
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
  const result = applyBestBenchmarkWinnerToSheet_({
    sourceMode: context.sourceMode || 'OPERATIONAL_RED_BUTTON',
    campaignFolderName: context.campaignFolderName || ''
  });
  if (result && result.ok !== true) {
    writeBenchmarkUiStatus_('RUNNING: AUTO-APPLY ERROR');
    Logger.log(JSON.stringify({
      ok: false,
      stage: 'auto_apply_operational_best',
      message: result.message || 'Unknown auto-apply error.'
    }, null, 2));
  }
  return result;
}

function maybeAdvanceBenchmarkCampaignChainOnComplete_(state) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const chainState = getBenchmarkCampaignChainState_();
    if (!chainState || chainState.active !== true) {
      clearBenchmarkCampaignChainState_();
      return { ok: true, advanced: false };
    }
    const segmentTargets = Array.isArray(chainState.segmentTargets) ? chainState.segmentTargets.slice() : [];
    const totalSegments = Number(chainState.totalSegments || segmentTargets.length || 0);
    const currentIndex = Number(chainState.currentSegmentIndex || 0);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= totalSegments || nextIndex >= segmentTargets.length) {
      clearBenchmarkCampaignChainState_();
      return { ok: true, advanced: false };
    }

    const snapshot = chainState.snapshot || {};
    const snapshotFileId = normalizeBenchmarkOrchestrationString_(snapshot.fileId);
    if (!snapshotFileId) {
      throw new Error('Chain snapshot fileId is missing; cannot continue next cycle.');
    }

    const snapshotExportLike = {
      ok: true,
      contractVersion: snapshot.contractVersion || null,
      export: {
        fileId: snapshotFileId,
        fileName: snapshot.fileName || null,
        exportedAtIso: snapshot.exportedAtIso || null
      }
    };
    const uiState = readBenchmarkUiControlState_();
    const segmentTarget = Number(segmentTargets[nextIndex]);
    const chainProgressText = buildBenchmarkCampaignChainProgressText_(nextIndex, totalSegments);
    const segmentBaseSeed = computeBenchmarkCampaignSegmentSeed_(chainState.baseSeed, nextIndex);
    const campaignBatchLabel = normalizeBenchmarkOrchestrationString_(chainState.campaignBatchLabel) ||
      buildBenchmarkCampaignBatchLabelFromUi_(chainState.requestedTargetMaxTrialCount || uiState.targetMaxTrialCount);

    const segmentStart = startBenchmarkCampaignSegment_({
      snapshotExport: snapshotExportLike,
      uiState: uiState,
      segmentTargetMaxTrialCount: segmentTarget,
      requestedTargetMaxTrialCount: chainState.requestedTargetMaxTrialCount || uiState.targetMaxTrialCount,
      baseSeed: segmentBaseSeed,
      campaignBatchLabel: campaignBatchLabel,
      chainProgressText: chainProgressText
    });

    const started = segmentStart.started;
    chainState.currentSegmentIndex = nextIndex;
    chainState.lastAdvancedAtIso = new Date().toISOString();
    setBenchmarkCampaignChainState_(chainState);

    const compact = {
      ok: true,
      campaignId: started.campaignId || '',
      campaignFolderName: started.campaignFolderName || '',
      status: started.status || 'RUNNING',
      backendStatus: started.status || 'RUNNING',
      completedRunCount: started.completedRunCount,
      plannedRunCount: started.plannedRunCount,
      currentBestRunId: started.currentBestRunId || '',
      currentBestScore: started.currentBestScore,
      errorMessage: '',
      statusSource: 'ORCHESTRATOR_RUNTIME',
      freshness: 'FRESH',
      reconciliationState: 'PENDING',
      warning: '',
      lastBackendConfirmedAt: '',
      importOk: true,
      importMessage: '',
      autoApplyOk: true,
      autoApplyApplied: false,
      autoApplyMessage: '',
      chainProgressText: chainProgressText,
      segmentIndex: nextIndex + 1,
      segmentTotal: totalSegments
    };
    Logger.log(JSON.stringify({
      ok: true,
      stage: 'campaign_chain_advanced',
      fromSegmentIndex: currentIndex + 1,
      toSegmentIndex: nextIndex + 1,
      totalSegments: totalSegments,
      campaignId: compact.campaignId,
      campaignFolderName: compact.campaignFolderName
    }, null, 2));
    return {
      ok: true,
      advanced: true,
      compact: compact
    };
  } finally {
    lock.releaseLock();
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
  const segmentTargets = deriveBenchmarkCampaignSegmentTargets_(target);
  const baseSeed = resolveBenchmarkCampaignSeedFromUi_(uiState);
  const campaignBatchLabel = buildBenchmarkCampaignBatchLabelFromUi_(target);
  const chainState = segmentTargets.length > 1
    ? {
      active: true,
      requestedTargetMaxTrialCount: target,
      segmentTargets: segmentTargets.slice(),
      currentSegmentIndex: 0,
      totalSegments: segmentTargets.length,
      baseSeed: String(baseSeed),
      campaignBatchLabel: campaignBatchLabel,
      snapshot: {
        contractVersion: snapshotExport.contractVersion || null,
        fileId: snapshotExport.export ? snapshotExport.export.fileId || null : null,
        fileName: snapshotExport.export ? snapshotExport.export.fileName || null : null,
        exportedAtIso: snapshotExport.export ? snapshotExport.export.exportedAtIso || null : null
      }
    }
    : null;
  if (chainState) {
    setBenchmarkCampaignChainState_(chainState);
  } else {
    clearBenchmarkCampaignChainState_();
  }

  const segmentIndex = chainState ? chainState.currentSegmentIndex : 0;
  const chainProgressText = buildBenchmarkCampaignChainProgressText_(
    segmentIndex,
    chainState ? chainState.totalSegments : 1
  );
  const segmentBaseSeed = computeBenchmarkCampaignSegmentSeed_(baseSeed, segmentIndex);
  const segmentStart = startBenchmarkCampaignSegment_({
    snapshotExport: snapshotExport,
    uiState: uiState,
    segmentTargetMaxTrialCount: segmentTargets[segmentIndex],
    requestedTargetMaxTrialCount: target,
    baseSeed: segmentBaseSeed,
    campaignBatchLabel: campaignBatchLabel,
    chainProgressText: chainProgressText
  });
  const payload = segmentStart.payload;
  const started = segmentStart.started;
  writeBenchmarkUiControlValue_('seedOverride', '');

  const compact = {
    ok: true,
    status: started.status || 'RUNNING',
    campaignId: started.campaignId || '',
    campaignFolderName: started.campaignFolderName || '',
    plannedRunCount: started.plannedRunCount,
    baseSeed: started.baseSeed != null ? String(started.baseSeed) : String(payload.baseSeed),
    targetMaxTrialCount: target,
    segmentTargetMaxTrialCount: segmentTargets[segmentIndex],
    segmentIndex: segmentIndex + 1,
    segmentTotal: segmentTargets.length,
    chainProgressText: chainProgressText,
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
    clearBenchmarkCampaignChainState_();
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
  if (storedStatusUpper === 'STOPPED') {
    ensureBenchmarkCampaignPollTriggerHygiene_(false);
    writeBenchmarkUiOperationalHealth_({
      statusSource: 'MANUAL_STOP',
      freshness: 'UNKNOWN',
      reconciliationState: 'UNKNOWN',
      warning: 'Polling is manually stopped.',
      lastBackendConfirmedAt: ''
    });
    return {
      ok: true,
      skipped: true,
      message: 'Polling is manually stopped.'
    };
  }

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

  const chainState = getBenchmarkCampaignChainState_();
  const chainProgressText = buildBenchmarkCampaignChainProgressText_(
    chainState ? Number(chainState.currentSegmentIndex || 0) : 0,
    chainState ? Number(chainState.totalSegments || 1) : 1
  );
  writeBenchmarkUiCampaignProgress_(extractBenchmarkProgressPayload_({
    status: statusResponse.status,
    campaignFolderName: statusResponse.campaignFolderName,
    completedRunCount: statusResponse.completedRunCount,
    plannedRunCount: statusResponse.plannedRunCount,
    currentBestRunId: statusResponse.currentBestRunId,
    currentBestScore: statusResponse.currentBestScore,
    currentBestScorerFingerprint: statusResponse.currentBestScorerFingerprint,
    currentBestScorerFingerprintShort: statusResponse.currentBestScorerFingerprintShort,
    currentBestScorerFingerprintVersion: statusResponse.currentBestScorerFingerprintVersion,
    currentBestScorerSource: statusResponse.currentBestScorerSource,
    baseSeed: statusResponse.baseSeed,
    chainProgressText: chainProgressText
  }));

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
  let projectedState = buildBenchmarkStatusProjectionState_({
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
  if (statusResponse.statusInference) {
    warningMessages.push('Status inference: ' + statusResponse.statusInference);
  }

  let operationalReconciliationState = reconciliation.reconciliationState;
  if (projectedState === 'COMPLETE') {
    const gate = evaluateBenchmarkTerminalReconciliationGate_({
      campaignFolderName: state.campaignFolderName,
      expectedCompleted: completedRunCount,
      expectedPlanned: plannedRunCount
    });
    if (gate.ok !== true) {
      const details = gate.issues.join(' | ');
      warningMessages.push('Completion reconciliation pending: ' + details);
      projectedState = 'RUNNING';
      operationalReconciliationState = 'PENDING';
    }
  }

  writeBenchmarkUiOperationalHealth_({
    statusSource: statusResponse.contractVersion ? 'BACKEND_STATUS_FILE' : 'ORCHESTRATOR_RUNTIME',
    freshness: freshness.bucket,
    reconciliationState: operationalReconciliationState,
    warning: warningMessages.join(' | '),
    lastBackendConfirmedAt: statusResponse.lastUpdated || statusResponse.completedAt || ''
  });

  if (projectedState === 'COMPLETE') {
    let finalAutoApplyResult = null;
    let finalAutoApplyWarning = '';
    try {
      finalAutoApplyResult = maybeAutoApplyOperationalBestWinner_({
        campaignFolderName: state.campaignFolderName,
        sourceMode: 'OPERATIONAL_FINAL'
      });
    } catch (err) {
      finalAutoApplyResult = {
        ok: false,
        applied: false,
        message: String(err && err.message ? err.message : err)
      };
      finalAutoApplyWarning = 'Final auto-apply failed: ' + finalAutoApplyResult.message;
      warningMessages.push(finalAutoApplyWarning);
      Logger.log(JSON.stringify({
        ok: false,
        stage: 'auto_apply_operational_final_uncaught',
        campaignId: state.campaignId || '',
        message: finalAutoApplyResult.message
      }, null, 2));
    }
    if (finalAutoApplyWarning) {
      writeBenchmarkUiOperationalHealth_({
        statusSource: statusResponse.contractVersion ? 'BACKEND_STATUS_FILE' : 'ORCHESTRATOR_RUNTIME',
        freshness: freshness.bucket,
        reconciliationState: reconciliation.reconciliationState,
        warning: warningMessages.join(' | '),
        lastBackendConfirmedAt: statusResponse.lastUpdated || statusResponse.completedAt || ''
      });
    }
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
          : (importResult && importResult.bestWinner ? importResult.bestWinner.bestScore : null),
      chainProgressText: chainProgressText
    }));

    const chainAdvance = maybeAdvanceBenchmarkCampaignChainOnComplete_(state);
    if (chainAdvance && chainAdvance.ok === true && chainAdvance.advanced === true) {
      writeBenchmarkUiOperationalHealth_({
        statusSource: 'ORCHESTRATOR_RUNTIME',
        freshness: 'FRESH',
        reconciliationState: 'PENDING',
        warning: '',
        lastBackendConfirmedAt: ''
      });
      return chainAdvance.compact;
    }
  }

  if (
    projectedState === 'COMPLETE' ||
    projectedState === 'FAILED' ||
    projectedState === 'CANCELLED'
  ) {
    if (projectedState !== 'COMPLETE') {
      clearBenchmarkCampaignChainState_();
    }
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
    reconciliationState: operationalReconciliationState,
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
  clearBenchmarkCampaignChainState_();
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
  clearBenchmarkCampaignChainState_();
  writeBenchmarkUiCampaignProgress_({ chainProgressText: '' });
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
