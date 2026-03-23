function getBenchmarkUiConfig_() {
  return {
    sheetName: 'SCORER_CONFIG',
    specificRunIdPlaceholder: '<insert_RunID>',
    defaultWritebackComparisonGroupKeyPlaceholder: '<auto_if_single_group>',
    namedRanges: {
      targetMaxTrialCount: 'BENCHMARK_UI_TARGET_MAX_TRIAL_COUNT',
      seedOverride: 'BENCHMARK_UI_SEED_OVERRIDE',
      status: 'BENCHMARK_UI_STATUS',
      campaignFolder: 'BENCHMARK_UI_CAMPAIGN_FOLDER',
      completedRuns: 'BENCHMARK_UI_COMPLETED_RUNS',
      plannedRuns: 'BENCHMARK_UI_PLANNED_RUNS',
      bestRunId: 'BENCHMARK_UI_BEST_RUN_ID',
      bestScore: 'BENCHMARK_UI_BEST_SCORE',
      lastUpdated: 'BENCHMARK_UI_LAST_UPDATED',
      specificRunId: 'BENCHMARK_UI_SPECIFIC_RUN_ID',
      defaultWritebackComparisonGroupKey: 'BENCHMARK_UI_DEFAULT_WRITEBACK_COMPARISON_GROUP_KEY',
      campaignSeed: 'BENCHMARK_UI_CAMPAIGN_SEED'
    },
    fallbackCells: {
      targetMaxTrialCount: 'O2',
      seedOverride: 'O3',
      status: 'O4',
      campaignFolder: 'O5',
      completedRuns: 'O6',
      plannedRuns: 'O7',
      bestRunId: 'O8',
      bestScore: 'O9',
      lastUpdated: 'O10',
      specificRunId: 'O12',
      defaultWritebackComparisonGroupKey: 'O11',
      campaignSeed: 'O13'
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
    seedOverride: 'B19',
    defaultWritebackComparisonGroupKey: 'C22',
    specificRunId: 'C23',
    status: 'B26',
    campaignFolder: 'B27',
    bestRunId: 'B28',
    bestScore: 'B29',
    lastUpdated: 'B30',
    completedRuns: 'B31',
    plannedRuns: 'B32',
    campaignSeed: 'B33'
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
  const normalized = normalizeBenchmarkUiString_(control.getValue());
  return normalized === getBenchmarkUiConfig_().specificRunIdPlaceholder ? '' : normalized;
}

function readBenchmarkUiDefaultWritebackComparisonGroupKey_() {
  const control = resolveBenchmarkUiControlRange_('defaultWritebackComparisonGroupKey');
  const normalized = normalizeBenchmarkUiString_(control.getValue());
  return normalized === getBenchmarkUiConfig_().defaultWritebackComparisonGroupKeyPlaceholder ? '' : normalized;
}

function readBenchmarkUiSeedOverride_() {
  const control = resolveBenchmarkUiControlRange_('seedOverride');
  return normalizeBenchmarkUiString_(control.getValue());
}

function readBenchmarkUiControlState_() {
  const targetMaxTrialCount = readBenchmarkUiTargetMaxTrialCount_();
  return {
    targetMaxTrialCount: targetMaxTrialCount,
    expandedTrialCounts: buildBenchmarkTrialCountsUpToTarget_(targetMaxTrialCount),
    specificRunId: readBenchmarkUiSpecificRunId_(),
    defaultWritebackComparisonGroupKey: readBenchmarkUiDefaultWritebackComparisonGroupKey_(),
    seedOverride: readBenchmarkUiSeedOverride_()
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

  if (Object.prototype.hasOwnProperty.call(payload, 'campaignSeed')) {
    writeBenchmarkUiControlValue_('campaignSeed', normalizeBenchmarkUiString_(payload.campaignSeed));
  }

  writeBenchmarkUiLastUpdated_(new Date());
}

function clearBenchmarkUiCampaignProgress_() {
  writeBenchmarkUiControlValue_('campaignFolder', '');
  writeBenchmarkUiControlValue_('completedRuns', '');
  writeBenchmarkUiControlValue_('plannedRuns', '');
  writeBenchmarkUiControlValue_('bestRunId', '');
  writeBenchmarkUiControlValue_('bestScore', '');
  writeBenchmarkUiControlValue_('campaignSeed', '');
  writeBenchmarkUiControlValue_('seedOverride', '');
  writeBenchmarkUiControlValue_('specificRunId', getBenchmarkUiConfig_().specificRunIdPlaceholder);
  writeBenchmarkUiStatus_(getBenchmarkUiConfig_().defaultStatus);
}

function ensureBenchmarkUiTextControlPlaceholder_(controlKey, placeholder) {
  const range = resolveBenchmarkUiControlRange_(controlKey);
  range.setNumberFormat('@');
  range.setWrap(true);

  if (!normalizeBenchmarkUiString_(range.getValue())) {
    range.setValue(placeholder);
  }

  return range;
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

  const seedOverrideRange = resolveBenchmarkUiControlRange_('seedOverride');
  seedOverrideRange.setNumberFormat('@');

  const bestRunIdRange = resolveBenchmarkUiControlRange_('bestRunId');
  bestRunIdRange.setNumberFormat('@');
  bestRunIdRange.setWrap(true);

  const specificRunIdRange = ensureBenchmarkUiTextControlPlaceholder_(
    'specificRunId',
    getBenchmarkUiConfig_().specificRunIdPlaceholder
  );
  const defaultWritebackComparisonGroupKeyRange = ensureBenchmarkUiTextControlPlaceholder_(
    'defaultWritebackComparisonGroupKey',
    getBenchmarkUiConfig_().defaultWritebackComparisonGroupKeyPlaceholder
  );

  const campaignSeedRange = resolveBenchmarkUiControlRange_('campaignSeed');
  campaignSeedRange.setNumberFormat('@');

  writeBenchmarkUiLastUpdated_(new Date());

  return {
    ok: true,
    sheetName: getBenchmarkUiSheet_().getName(),
    targetMaxTrialCountCell: targetRange.getA1Notation(),
    seedOverrideCell: seedOverrideRange.getA1Notation(),
    bestRunIdCell: bestRunIdRange.getA1Notation(),
    specificRunIdCell: specificRunIdRange.getA1Notation(),
    defaultWritebackComparisonGroupKeyCell: defaultWritebackComparisonGroupKeyRange.getA1Notation(),
    campaignSeedCell: campaignSeedRange.getA1Notation(),
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

function restoreBenchmarkUiPlaceholdersOnEdit_(e) {
  if (!e || !e.range || typeof e.range.getA1Notation !== 'function') {
    return;
  }

  const range = e.range;
  const sheet = range.getSheet ? range.getSheet() : null;
  if (!sheet || sheet.getName() !== getBenchmarkUiConfig_().sheetName) {
    return;
  }

  const config = getBenchmarkUiConfig_();
  const placeholderControls = [
    {
      controlKey: 'specificRunId',
      placeholder: config.specificRunIdPlaceholder
    },
    {
      controlKey: 'defaultWritebackComparisonGroupKey',
      placeholder: config.defaultWritebackComparisonGroupKeyPlaceholder
    }
  ];

  for (let i = 0; i < placeholderControls.length; i++) {
    const control = placeholderControls[i];
    const controlRange = resolveBenchmarkUiControlRange_(control.controlKey);
    if (range.getSheet().getSheetId() !== controlRange.getSheet().getSheetId()) {
      continue;
    }
    if (range.getA1Notation() !== controlRange.getA1Notation()) {
      continue;
    }

    if (!normalizeBenchmarkUiString_(range.getValue())) {
      range.setValue(control.placeholder);
    }
    return;
  }
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

function onEdit(e) {
  restoreBenchmarkUiPlaceholdersOnEdit_(e);
}
