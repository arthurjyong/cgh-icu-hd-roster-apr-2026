'use strict';

const fs = require('fs');
const path = require('path');
const { buildSnapshotSummary } = require('./launcher_plan');

const CHECKPOINT_VERSION = 'phase12_local_checkpoint_v1';
const CHECKPOINT_STATUS = {
  RUNNING: 'RUNNING',
  PAUSED_AFTER_FAILURE: 'PAUSED_AFTER_FAILURE',
  COMPLETED: 'COMPLETED'
};

function readJsonFile(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(rawText);
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function ensureObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value;
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  return value;
}

function normalizeCompletedChunkNumbers(value) {
  const numbers = ensureArray(value, 'completedChunkNumbers')
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  return Array.from(new Set(numbers)).sort((left, right) => left - right);
}

function rebuildChunkFromSummary(summary) {
  return {
    chunkIndex: typeof summary.chunkNumber === 'number' ? summary.chunkNumber - 1 : null,
    chunkNumber: typeof summary.chunkNumber === 'number' ? summary.chunkNumber : null,
    startTrialIndex: typeof summary.startTrialIndex === 'number' ? summary.startTrialIndex : null,
    endTrialIndexExclusive: typeof summary.endTrialIndexExclusive === 'number'
      ? summary.endTrialIndexExclusive
      : null,
    trialCount: typeof summary.trialCount === 'number' ? summary.trialCount : null,
    chunkSeed: typeof summary.chunkSeed === 'string' ? summary.chunkSeed : null
  };
}

function rebuildWinnerRecord(summary, transportResult) {
  const safeSummary = ensureObject(summary, 'winner summary');

  return {
    chunk: rebuildChunkFromSummary(safeSummary),
    bestScore: typeof safeSummary.bestScore === 'number' ? safeSummary.bestScore : null,
    bestTrialIndex: typeof safeSummary.bestTrialIndex === 'number' ? safeSummary.bestTrialIndex : null,
    invocationMode: typeof safeSummary.invocationMode === 'string' ? safeSummary.invocationMode : null,
    message: typeof safeSummary.message === 'string' ? safeSummary.message : null,
    meanPoints: typeof safeSummary.meanPoints === 'number' ? safeSummary.meanPoints : null,
    standardDeviation: typeof safeSummary.standardDeviation === 'number'
      ? safeSummary.standardDeviation
      : null,
    range: typeof safeSummary.range === 'number' ? safeSummary.range : null,
    totalScore: typeof safeSummary.totalScore === 'number' ? safeSummary.totalScore : null,
    scorerFingerprint: typeof safeSummary.scorerFingerprint === 'string' ? safeSummary.scorerFingerprint : null,
    scorerFingerprintShort: typeof safeSummary.scorerFingerprintShort === 'string' ? safeSummary.scorerFingerprintShort : null,
    scorerFingerprintVersion: typeof safeSummary.scorerFingerprintVersion === 'string' ? safeSummary.scorerFingerprintVersion : null,
    scorerSource: typeof safeSummary.scorerSource === 'string' ? safeSummary.scorerSource : null,
    transportResult
  };
}

function loadTransportResultFile(runDir, relativeFileName, fieldName) {
  if (typeof relativeFileName !== 'string' || !relativeFileName.trim()) {
    throw new Error(`${fieldName}.transportFileName is required.`);
  }

  const filePath = path.join(runDir, relativeFileName);
  if (!fileExists(filePath)) {
    throw new Error(`Checkpoint transport file not found: ${filePath}`);
  }

  return readJsonFile(filePath);
}

function createFreshCheckpointState(options) {
  const source = options || {};
  const config = source.config;
  const snapshotInfo = source.snapshotInfo;
  const chunkPlan = source.chunkPlan;
  const planFingerprint = source.planFingerprint;
  const runDir = source.runDir || null;
  const nowIso = new Date().toISOString();

  if (!config) {
    throw new Error('config is required to create a fresh checkpoint state.');
  }

  if (!snapshotInfo) {
    throw new Error('snapshotInfo is required to create a fresh checkpoint state.');
  }

  if (!chunkPlan) {
    throw new Error('chunkPlan is required to create a fresh checkpoint state.');
  }

  if (typeof planFingerprint !== 'string' || !planFingerprint.trim()) {
    throw new Error('planFingerprint is required to create a fresh checkpoint state.');
  }

  return {
    checkpointVersion: CHECKPOINT_VERSION,
    launcherPhase: '12E',
    status: CHECKPOINT_STATUS.RUNNING,
    planFingerprint,
    runDir,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    configSummary: {
      snapshotPath: snapshotInfo.file.absolutePath,
      workerUrl: config.workerUrl,
      totalTrials: config.totalTrials,
      chunkTrials: config.chunkTrials,
      chunkCount: chunkPlan.chunkCount,
      baseSeed: config.baseSeed,
      topN: config.topN,
      outputRootDir: config.outputRootDir,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume
    },
    snapshotSummary: buildSnapshotSummary(snapshotInfo),
    requestedChunkCount: chunkPlan.chunkCount,
    completedChunkNumbers: [],
    successes: [],
    failures: [],
    globalBestRecord: null,
    topChunkWinnerRecords: []
  };
}

function loadCheckpointState(options) {
  const source = options || {};
  const runDir = path.resolve(source.runDir || '');
  const expectedPlanFingerprint = source.planFingerprint;
  const checkpointFilePath = path.join(runDir, 'checkpoint_state.json');

  if (!runDir || runDir === path.resolve('')) {
    throw new Error('runDir is required to load checkpoint state.');
  }

  if (!fileExists(checkpointFilePath)) {
    throw new Error(`Checkpoint state file not found: ${checkpointFilePath}`);
  }

  const doc = ensureObject(readJsonFile(checkpointFilePath), 'checkpoint state');

  if (doc.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new Error(
      `Unsupported checkpointVersion. Expected ${CHECKPOINT_VERSION}, received ${doc.checkpointVersion}`
    );
  }

  if (typeof expectedPlanFingerprint === 'string'
      && expectedPlanFingerprint.trim()
      && doc.planFingerprint !== expectedPlanFingerprint) {
    throw new Error(
      `Checkpoint plan fingerprint mismatch. Expected ${expectedPlanFingerprint}, received ${doc.planFingerprint}`
    );
  }

  const allowedStatuses = Object.values(CHECKPOINT_STATUS);
  if (!allowedStatuses.includes(doc.status)) {
    throw new Error(`Unsupported checkpoint status: ${doc.status}`);
  }

  const completedChunkNumbers = normalizeCompletedChunkNumbers(doc.completedChunkNumbers || []);
  const successes = ensureArray(doc.successes || [], 'successes').map((entry) => ensureObject(entry, 'success entry'));
  const failures = ensureArray(doc.failures || [], 'failures').map((entry) => ensureObject(entry, 'failure entry'));

  let globalBestRecord = null;
  if (doc.globalBest) {
    const globalBestSummary = ensureObject(doc.globalBest, 'globalBest');
    const transportResult = loadTransportResultFile(runDir, globalBestSummary.transportFileName, 'globalBest');
    globalBestRecord = rebuildWinnerRecord(globalBestSummary, transportResult);
  }

  const topChunkWinnerRecords = ensureArray(doc.topChunkWinners || [], 'topChunkWinners').map((entry) => {
    const safeEntry = ensureObject(entry, 'top chunk winner entry');
    const transportResult = loadTransportResultFile(runDir, safeEntry.transportFileName, 'topChunkWinners entry');
    return rebuildWinnerRecord(safeEntry, transportResult);
  });

  return {
    checkpointFilePath,
    state: {
      checkpointVersion: doc.checkpointVersion,
      launcherPhase: doc.launcherPhase || '12E',
      status: doc.status,
      planFingerprint: doc.planFingerprint,
      runDir,
      createdAtIso: doc.createdAtIso || null,
      updatedAtIso: doc.updatedAtIso || null,
      configSummary: ensureObject(doc.configSummary || {}, 'configSummary'),
      snapshotSummary: ensureObject(doc.snapshotSummary || {}, 'snapshotSummary'),
      requestedChunkCount: Number.isInteger(doc.requestedChunkCount)
        ? doc.requestedChunkCount
        : (doc.execution && Number.isInteger(doc.execution.requestedChunkCount)
            ? doc.execution.requestedChunkCount
            : null),
      completedChunkNumbers,
      successes,
      failures,
      globalBestRecord,
      topChunkWinnerRecords
    }
  };
}

module.exports = {
  CHECKPOINT_STATUS,
  CHECKPOINT_VERSION,
  createFreshCheckpointState,
  loadCheckpointState
};
