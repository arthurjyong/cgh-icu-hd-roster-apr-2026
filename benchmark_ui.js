function getBenchmarkUiConfig_() {
  return {
    sheetName: 'SCORER_CONFIG',
    namedRanges: {
      targetMaxTrialCount: 'BENCHMARK_UI_TARGET_MAX_TRIAL_COUNT',
      status: 'BENCHMARK_UI_STATUS',
      campaignFolder: 'BENCHMARK_UI_CAMPAIGN_FOLDER',
      completedRuns: 'BENCHMARK_UI_COMPLETED_RUNS',
      plannedRuns: 'BENCHMARK_UI_PLANNED_RUNS',
      bestRunId: 'BENCHMARK_UI_BEST_RUN_ID',
      bestScore: 'BENCHMARK_UI_BEST_SCORE',
      lastUpdated: 'BENCHMARK_UI_LAST_UPDATED',
      specificRunId: 'BENCHMARK_UI_SPECIFIC_RUN_ID'
    },
    fallbackCells: {
      targetMaxTrialCount: 'O2',
      status: 'O3',
      campaignFolder: 'O4',
      completedRuns: 'O5',
      plannedRuns: 'O6',
      bestRunId: 'O7',
      bestScore: 'O8',
      lastUpdated: 'O9',
      specificRunId: 'O12'
    },
    allowedTargetMaxTrialCounts: [
      1,
      5,
      10,
      50,
      100,
      500,
      1000,
      5000,
      10000,
      50000,
      100000,
      500000,
      1000000,
      5000000
    ],
    defaultStatus: 'IDLE'
  };
}

function getBenchmarkUiSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getBenchmarkUiSheet_() {
  const config = getBenchmarkUiConfig_();
  const spreadsheet = getBenchmarkUiSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error('Benchmark UI sheet not found: "' + config.sheetName + '".');
  }

  return sheet;
}

function getBenchmarkUiAllowedTargetMaxTrialCounts_() {
  return getBenchmarkUiConfig_().allowedTargetMaxTrialCounts.slice();
}


function getBenchmarkUiNamedRangeTargetA1Map_() {
  return {
    targetMaxTrialCount: 'B18',
    specificRunId: 'C22',
    status: 'B25',
    campaignFolder: 'B26',
    bestRunId: 'B27',
    bestScore: 'B28',
    lastUpdated: 'B29',
    completedRuns: 'B30',
    plannedRuns: 'B31'
  };
}

function installBenchmarkUiNamedRanges_() {
  const spreadsheet = getBenchmarkUiSpreadsheet_();
  const sheet = getBenchmarkUiSheet_();
  const config = getBenchmarkUiConfig_();
  const targetMap = getBenchmarkUiNamedRangeTargetA1Map_();
  const controlKeys = Object.keys(targetMap);
  const result = {};

  for (let i = 0; i < controlKeys.length; i++) {
    const controlKey = controlKeys[i];
    const namedRangeName = config.namedRanges[controlKey];
    if (!namedRangeName) {
      throw new Error('Missing named range config for control key: ' + controlKey);
    }

    const range = sheet.getRange(targetMap[controlKey]);
    spreadsheet.setNamedRange(namedRangeName, range);
    result[controlKey] = {
      namedRangeName: namedRangeName,
      a1Notation: range.getA1Notation(),
      sheetName: sheet.getName()
    };
  }

  return {
    ok: true,
    sheetName: sheet.getName(),
    installedNamedRanges: result
  };
}

function getBenchmarkUiNamedRangeOrNull_(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return null;
  }

  const spreadsheet = getBenchmarkUiSpreadsheet_();
  return spreadsheet.getRangeByName(trimmed);
}

function resolveBenchmarkUiControlRange_(controlKey) {
  const config = getBenchmarkUiConfig_();
  const namedRangeName = config.namedRanges[controlKey];
  const fallbackA1 = config.fallbackCells[controlKey];

  if (!fallbackA1) {
    throw new Error('Unknown benchmark UI control key: ' + controlKey);
  }

  const namedRange = getBenchmarkUiNamedRangeOrNull_(namedRangeName);
  if (namedRange) {
    return namedRange;
  }

  const sheet = getBenchmarkUiSheet_();
  return sheet.getRange(fallbackA1);
}

function getBenchmarkUiControlMap_() {
  const config = getBenchmarkUiConfig_();
  const keys = Object.keys(config.fallbackCells);
  const map = {};

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const range = resolveBenchmarkUiControlRange_(key);
    map[key] = {
      key: key,
      range: range,
      a1Notation: range.getA1Notation(),
      sheetName: range.getSheet().getName()
    };
  }

  return map;
}

function normalizeBenchmarkUiString_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function isAllowedBenchmarkUiTargetMaxTrialCount_(value) {
  const allowed = getBenchmarkUiAllowedTargetMaxTrialCounts_();
  for (let i = 0; i < allowed.length; i++) {
    if (allowed[i] === value) {
      return true;
    }
  }
  return false;
}

function parseBenchmarkUiTargetMaxTrialCount_(rawValue) {
  const normalized = normalizeBenchmarkUiString_(rawValue);
  if (!normalized) {
    throw new Error('Target max trial count is required.');
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || Math.floor(numeric) !== numeric) {
    throw new Error('Target max trial count must be an integer.');
  }

  if (!isAllowedBenchmarkUiTargetMaxTrialCount_(numeric)) {
    throw new Error(
      'Target max trial count must be one of: ' +
      getBenchmarkUiAllowedTargetMaxTrialCounts_().join(', ')
    );
  }

  return numeric;
}

function buildBenchmarkTrialCountsUpToTarget_(targetMaxTrialCount) {
  const target = parseBenchmarkUiTargetMaxTrialCount_(targetMaxTrialCount);
  const allowed = getBenchmarkUiAllowedTargetMaxTrialCounts_();
  const ladder = [];

  for (let i = 0; i < allowed.length; i++) {
    const value = allowed[i];
    if (value <= target) {
      ladder.push(value);
    }
  }

  if (ladder.length === 0 || ladder[ladder.length - 1] !== target) {
    throw new Error('Failed to expand ladder to target max trial count: ' + target);
  }

  return ladder;
}

function readBenchmarkUiTargetMaxTrialCount_() {
  const control = resolveBenchmarkUiControlRange_('targetMaxTrialCount');
  return parseBenchmarkUiTargetMaxTrialCount_(control.getValue());
}

function readBenchmarkUiSpecificRunId_() {
  const control = resolveBenchmarkUiControlRange_('specificRunId');
  return normalizeBenchmarkUiString_(control.getValue());
}

function readBenchmarkUiControlState_() {
  const targetMaxTrialCount = readBenchmarkUiTargetMaxTrialCount_();
  return {
    targetMaxTrialCount: targetMaxTrialCount,
    expandedTrialCounts: buildBenchmarkTrialCountsUpToTarget_(targetMaxTrialCount),
    specificRunId: readBenchmarkUiSpecificRunId_()
  };
}

function writeBenchmarkUiControlValue_(controlKey, value) {
  const range = resolveBenchmarkUiControlRange_(controlKey);
  range.setValue(value);
}

function writeBenchmarkUiStatus_(statusValue) {
  const normalized = normalizeBenchmarkUiString_(statusValue) || getBenchmarkUiConfig_().defaultStatus;
  writeBenchmarkUiControlValue_('status', normalized);
  writeBenchmarkUiLastUpdated_(new Date());
  return normalized;
}

function writeBenchmarkUiLastUpdated_(value) {
  const range = resolveBenchmarkUiControlRange_('lastUpdated');
  const timestamp = value instanceof Date ? value : new Date();
  range.setValue(timestamp);
  range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function writeBenchmarkUiCampaignProgress_(statusPayload) {
  const payload = statusPayload || {};

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    writeBenchmarkUiControlValue_('status', normalizeBenchmarkUiString_(payload.status) || getBenchmarkUiConfig_().defaultStatus);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'campaignFolderName')) {
    writeBenchmarkUiControlValue_('campaignFolder', normalizeBenchmarkUiString_(payload.campaignFolderName));
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'completedRunCount')) {
    writeBenchmarkUiControlValue_('completedRuns', payload.completedRunCount === null || payload.completedRunCount === undefined ? '' : payload.completedRunCount);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'plannedRunCount')) {
    writeBenchmarkUiControlValue_('plannedRuns', payload.plannedRunCount === null || payload.plannedRunCount === undefined ? '' : payload.plannedRunCount);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'currentBestRunId')) {
    writeBenchmarkUiControlValue_('bestRunId', normalizeBenchmarkUiString_(payload.currentBestRunId));
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'currentBestScore')) {
    writeBenchmarkUiControlValue_('bestScore', payload.currentBestScore === null || payload.currentBestScore === undefined ? '' : payload.currentBestScore);
  }

  writeBenchmarkUiLastUpdated_(new Date());
}

function clearBenchmarkUiCampaignProgress_() {
  writeBenchmarkUiControlValue_('campaignFolder', '');
  writeBenchmarkUiControlValue_('completedRuns', '');
  writeBenchmarkUiControlValue_('plannedRuns', '');
  writeBenchmarkUiControlValue_('bestRunId', '');
  writeBenchmarkUiControlValue_('bestScore', '');
  writeBenchmarkUiControlValue_('specificRunId', '');
  writeBenchmarkUiStatus_(getBenchmarkUiConfig_().defaultStatus);
}

function initializeBenchmarkUiControls_() {
  const installResult = installBenchmarkUiNamedRanges_();
  const allowed = getBenchmarkUiAllowedTargetMaxTrialCounts_();
  const targetRange = resolveBenchmarkUiControlRange_('targetMaxTrialCount');
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(allowed.map(String), true)
    .setAllowInvalid(false)
    .build();

  targetRange.setDataValidation(validation);
  if (!normalizeBenchmarkUiString_(targetRange.getValue())) {
    targetRange.setValue(String(allowed[0]));
  }

  const statusRange = resolveBenchmarkUiControlRange_('status');
  if (!normalizeBenchmarkUiString_(statusRange.getValue())) {
    statusRange.setValue(getBenchmarkUiConfig_().defaultStatus);
  }

  const specificRunIdRange = resolveBenchmarkUiControlRange_('specificRunId');
  specificRunIdRange.setNumberFormat('@');

  writeBenchmarkUiLastUpdated_(new Date());

  return {
    ok: true,
    sheetName: getBenchmarkUiSheet_().getName(),
    targetMaxTrialCountCell: targetRange.getA1Notation(),
    specificRunIdCell: specificRunIdRange.getA1Notation(),
    allowedTargetMaxTrialCounts: allowed,
    installResult: installResult
  };
}

function debugBenchmarkUiControlMap_() {
  const map = getBenchmarkUiControlMap_();
  Logger.log(JSON.stringify({ ok: true, controlMap: map }, null, 2));
  return map;
}

function debugReadBenchmarkUiControlState_() {
  const state = readBenchmarkUiControlState_();
  Logger.log(JSON.stringify({ ok: true, state: state }, null, 2));
  return state;
}


function installBenchmarkUiNamedRanges() {
  return installBenchmarkUiNamedRanges_();
}

function initializeBenchmarkUiControls() {
  return initializeBenchmarkUiControls_();
}

function debugBenchmarkUiControlMap() {
  return debugBenchmarkUiControlMap_();
}

function debugReadBenchmarkUiControlState() {
  return debugReadBenchmarkUiControlState_();
}