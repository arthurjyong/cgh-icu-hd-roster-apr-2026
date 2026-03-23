'use strict';

const CAMPAIGN_STATUS_CONTRACT_VERSION = 'benchmark_campaign_status_v1';

const CAMPAIGN_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

function cloneDeep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toIsoString(value) {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function normalizeNonEmptyString(value, fieldName) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    throw new Error(fieldName + ' is required.');
  }
  return normalized;
}

function normalizeOptionalString(value) {
  const normalized = String(value == null ? '' : value).trim();
  return normalized || null;
}

function normalizeFiniteNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareScores(leftScore, rightScore) {
  const left = Number.isFinite(leftScore) ? leftScore : Number.POSITIVE_INFINITY;
  const right = Number.isFinite(rightScore) ? rightScore : Number.POSITIVE_INFINITY;
  return left - right;
}

function chooseBetterRunRecord(currentBest, challenger) {
  if (!challenger) {
    return cloneDeep(currentBest);
  }
  if (!currentBest) {
    return cloneDeep(challenger);
  }

  const scoreComparison = compareScores(currentBest.bestScore, challenger.bestScore);
  if (scoreComparison > 0) {
    return cloneDeep(challenger);
  }
  if (scoreComparison < 0) {
    return cloneDeep(currentBest);
  }

  const currentTrialCount = Number.isFinite(currentBest.trialCount) ? currentBest.trialCount : Number.POSITIVE_INFINITY;
  const challengerTrialCount = Number.isFinite(challenger.trialCount) ? challenger.trialCount : Number.POSITIVE_INFINITY;
  if (challengerTrialCount < currentTrialCount) {
    return cloneDeep(challenger);
  }
  if (challengerTrialCount > currentTrialCount) {
    return cloneDeep(currentBest);
  }

  const currentRepeatIndex = Number.isFinite(currentBest.repeatIndex) ? currentBest.repeatIndex : Number.POSITIVE_INFINITY;
  const challengerRepeatIndex = Number.isFinite(challenger.repeatIndex) ? challenger.repeatIndex : Number.POSITIVE_INFINITY;
  if (challengerRepeatIndex < currentRepeatIndex) {
    return cloneDeep(challenger);
  }
  if (challengerRepeatIndex > currentRepeatIndex) {
    return cloneDeep(currentBest);
  }

  const currentRunId = String(currentBest.runId || '');
  const challengerRunId = String(challenger.runId || '');
  return challengerRunId < currentRunId ? cloneDeep(challenger) : cloneDeep(currentBest);
}

function normalizeBestRunRecord(input) {
  if (!input) {
    return null;
  }

  return {
    runId: normalizeNonEmptyString(input.runId, 'bestRun.runId'),
    trialCount: normalizeFiniteNumberOrNull(input.trialCount),
    repeatIndex: normalizeFiniteNumberOrNull(input.repeatIndex),
    bestScore: normalizeFiniteNumberOrNull(input.bestScore),
    bestTrialIndex: normalizeFiniteNumberOrNull(input.bestTrialIndex),
    runFolderName: normalizeOptionalString(input.runFolderName),
    artifactFileName: normalizeOptionalString(input.artifactFileName),
    invocationMode: normalizeOptionalString(input.invocationMode),
    scorerFingerprint: normalizeOptionalString(input.scorerFingerprint),
    scorerFingerprintShort: normalizeOptionalString(input.scorerFingerprintShort),
    scorerFingerprintVersion: normalizeOptionalString(input.scorerFingerprintVersion),
    scorerSource: normalizeOptionalString(input.scorerSource)
  };
}

function validateCampaignState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('Campaign state must be an object.');
  }
  if (state.contractVersion !== CAMPAIGN_STATUS_CONTRACT_VERSION) {
    throw new Error(
      'Unsupported campaign state contractVersion: ' +
        String(state.contractVersion || '') +
        '. Expected ' +
        CAMPAIGN_STATUS_CONTRACT_VERSION + '.'
    );
  }
  normalizeNonEmptyString(state.campaignId, 'campaignId');
  normalizeNonEmptyString(state.campaignFolderName, 'campaignFolderName');
  normalizeNonEmptyString(state.batchLabel, 'batchLabel');
  normalizeNonEmptyString(state.snapshotFileName, 'snapshotFileName');
  normalizeNonEmptyString(state.snapshotFileSha256, 'snapshotFileSha256');
  normalizeNonEmptyString(state.startedAt, 'startedAt');
  normalizeNonEmptyString(state.lastUpdated, 'lastUpdated');

  if (!Object.prototype.hasOwnProperty.call(CAMPAIGN_STATUSES, String(state.status || ''))) {
    throw new Error('Invalid campaign status: ' + String(state.status || ''));
  }

  const plannedRunCount = Number(state.plannedRunCount);
  const completedRunCount = Number(state.completedRunCount);
  const okCount = Number(state.okCount);
  const failedCount = Number(state.failedCount);

  if (!Number.isInteger(plannedRunCount) || plannedRunCount < 0) {
    throw new Error('plannedRunCount must be a non-negative integer.');
  }
  if (!Number.isInteger(completedRunCount) || completedRunCount < 0) {
    throw new Error('completedRunCount must be a non-negative integer.');
  }
  if (!Number.isInteger(okCount) || okCount < 0) {
    throw new Error('okCount must be a non-negative integer.');
  }
  if (!Number.isInteger(failedCount) || failedCount < 0) {
    throw new Error('failedCount must be a non-negative integer.');
  }
  if (completedRunCount > plannedRunCount) {
    throw new Error('completedRunCount cannot exceed plannedRunCount.');
  }
  if (okCount + failedCount > completedRunCount) {
    throw new Error('okCount + failedCount cannot exceed completedRunCount.');
  }

  if (state.currentBestRun) {
    normalizeBestRunRecord(state.currentBestRun);
  }

  return {
    contractVersion: state.contractVersion,
    campaignId: String(state.campaignId),
    campaignFolderName: String(state.campaignFolderName),
    batchLabel: String(state.batchLabel),
    snapshotFileName: String(state.snapshotFileName),
    snapshotFileSha256: String(state.snapshotFileSha256),
    baseSeed: normalizeOptionalString(state.baseSeed),
    status: String(state.status),
    plannedRunCount: plannedRunCount,
    completedRunCount: completedRunCount,
    okCount: okCount,
    failedCount: failedCount,
    currentBestRun: state.currentBestRun ? normalizeBestRunRecord(state.currentBestRun) : null,
    startedAt: String(state.startedAt),
    lastUpdated: String(state.lastUpdated),
    completedAt: normalizeOptionalString(state.completedAt),
    errorMessage: normalizeOptionalString(state.errorMessage)
  };
}

function createInitialCampaignState(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Initial campaign input is required.');
  }

  const startedAt = toIsoString(input.startedAt);

  const state = {
    contractVersion: CAMPAIGN_STATUS_CONTRACT_VERSION,
    campaignId: normalizeNonEmptyString(input.campaignId, 'campaignId'),
    campaignFolderName: normalizeNonEmptyString(input.campaignFolderName, 'campaignFolderName'),
    batchLabel: normalizeNonEmptyString(input.batchLabel, 'batchLabel'),
    snapshotFileName: normalizeNonEmptyString(input.snapshotFileName, 'snapshotFileName'),
    snapshotFileSha256: normalizeNonEmptyString(input.snapshotFileSha256, 'snapshotFileSha256'),
    baseSeed: normalizeOptionalString(input.baseSeed),
    status: CAMPAIGN_STATUSES.PENDING,
    plannedRunCount: Math.max(0, Number(input.plannedRunCount) || 0),
    completedRunCount: 0,
    okCount: 0,
    failedCount: 0,
    currentBestRun: null,
    startedAt: startedAt,
    lastUpdated: startedAt,
    completedAt: null,
    errorMessage: null
  };

  return validateCampaignState(state);
}

function normalizeRunRecord(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Run record is required.');
  }

  return {
    runId: normalizeNonEmptyString(input.runId, 'runRecord.runId'),
    trialCount: normalizeFiniteNumberOrNull(input.trialCount),
    repeatIndex: normalizeFiniteNumberOrNull(input.repeatIndex),
    bestScore: normalizeFiniteNumberOrNull(input.bestScore),
    bestTrialIndex: normalizeFiniteNumberOrNull(input.bestTrialIndex),
    runFolderName: normalizeOptionalString(input.runFolderName),
    artifactFileName: normalizeOptionalString(input.artifactFileName),
    invocationMode: normalizeOptionalString(input.invocationMode),
    scorerFingerprint: normalizeOptionalString(input.scorerFingerprint),
    scorerFingerprintShort: normalizeOptionalString(input.scorerFingerprintShort),
    scorerFingerprintVersion: normalizeOptionalString(input.scorerFingerprintVersion),
    scorerSource: normalizeOptionalString(input.scorerSource),
    ok: input.ok !== false,
    completedAt: toIsoString(input.completedAt)
  };
}

function applyRunCompletion(stateInput, runRecordInput) {
  const state = validateCampaignState(cloneDeep(stateInput));
  const runRecord = normalizeRunRecord(runRecordInput);

  state.status = CAMPAIGN_STATUSES.RUNNING;
  state.completedRunCount += 1;
  state.lastUpdated = runRecord.completedAt;
  state.completedAt = null;
  state.errorMessage = null;

  if (runRecord.ok) {
    state.okCount += 1;
    state.currentBestRun = chooseBetterRunRecord(
      state.currentBestRun,
      {
        runId: runRecord.runId,
        trialCount: runRecord.trialCount,
        repeatIndex: runRecord.repeatIndex,
        bestScore: runRecord.bestScore,
        bestTrialIndex: runRecord.bestTrialIndex,
        runFolderName: runRecord.runFolderName,
        artifactFileName: runRecord.artifactFileName,
        invocationMode: runRecord.invocationMode,
        scorerFingerprint: runRecord.scorerFingerprint,
        scorerFingerprintShort: runRecord.scorerFingerprintShort,
        scorerFingerprintVersion: runRecord.scorerFingerprintVersion,
        scorerSource: runRecord.scorerSource
      }
    );
  } else {
    state.failedCount += 1;
  }

  return validateCampaignState(state);
}

function markCampaignComplete(stateInput, extra) {
  const state = validateCampaignState(cloneDeep(stateInput));
  const completedAt = toIsoString(extra && extra.completedAt);

  state.status = CAMPAIGN_STATUSES.COMPLETE;
  state.completedAt = completedAt;
  state.lastUpdated = completedAt;
  state.errorMessage = null;

  return validateCampaignState(state);
}

function markCampaignFailed(stateInput, errorInfo) {
  const state = validateCampaignState(cloneDeep(stateInput));
  const failedAt = toIsoString(errorInfo && errorInfo.failedAt);

  state.status = CAMPAIGN_STATUSES.FAILED;
  state.completedAt = failedAt;
  state.lastUpdated = failedAt;
  state.errorMessage = normalizeOptionalString(
    errorInfo && (errorInfo.errorMessage || errorInfo.message || errorInfo.error)
  ) || 'Campaign execution failed.';

  return validateCampaignState(state);
}

function serializeCampaignState(stateInput) {
  const state = validateCampaignState(cloneDeep(stateInput));
  return JSON.stringify(state, null, 2);
}

function parseCampaignState(jsonText) {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    throw new Error('Campaign state JSON text is required.');
  }
  const parsed = JSON.parse(jsonText);
  return validateCampaignState(parsed);
}

function buildCampaignStatusFilename() {
  return CAMPAIGN_STATUS_CONTRACT_VERSION + '.json';
}

function buildCampaignStatusSummary(stateInput) {
  const state = validateCampaignState(cloneDeep(stateInput));
  return {
    ok: true,
    contractVersion: state.contractVersion,
    campaignId: state.campaignId,
    campaignFolderName: state.campaignFolderName,
    batchLabel: state.batchLabel,
    snapshotFileName: state.snapshotFileName,
    snapshotFileSha256: state.snapshotFileSha256,
    baseSeed: state.baseSeed,
    status: state.status,
    plannedRunCount: state.plannedRunCount,
    completedRunCount: state.completedRunCount,
    okCount: state.okCount,
    failedCount: state.failedCount,
    currentBestRunId: state.currentBestRun ? state.currentBestRun.runId : null,
    currentBestScore: state.currentBestRun ? state.currentBestRun.bestScore : null,
    currentBestTrialCount: state.currentBestRun ? state.currentBestRun.trialCount : null,
    currentBestRepeatIndex: state.currentBestRun ? state.currentBestRun.repeatIndex : null,
    currentBestScorerFingerprint: state.currentBestRun ? state.currentBestRun.scorerFingerprint : null,
    currentBestScorerFingerprintShort: state.currentBestRun ? state.currentBestRun.scorerFingerprintShort : null,
    currentBestScorerFingerprintVersion: state.currentBestRun ? state.currentBestRun.scorerFingerprintVersion : null,
    currentBestScorerSource: state.currentBestRun ? state.currentBestRun.scorerSource : null,
    startedAt: state.startedAt,
    lastUpdated: state.lastUpdated,
    completedAt: state.completedAt,
    errorMessage: state.errorMessage
  };
}

module.exports = {
  CAMPAIGN_STATUS_CONTRACT_VERSION,
  CAMPAIGN_STATUSES,
  buildCampaignStatusFilename,
  buildCampaignStatusSummary,
  createInitialCampaignState,
  applyRunCompletion,
  markCampaignComplete,
  markCampaignFailed,
  serializeCampaignState,
  parseCampaignState,
  validateCampaignState
};
