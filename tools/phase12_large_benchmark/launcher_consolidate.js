'use strict';

function getComparableScore(record) {
  return record && typeof record.bestScore === 'number'
    ? record.bestScore
    : Number.NEGATIVE_INFINITY;
}

function getComparableChunkNumber(record) {
  return record && record.chunk && typeof record.chunk.chunkNumber === 'number'
    ? record.chunk.chunkNumber
    : Number.MAX_SAFE_INTEGER;
}

function getComparableBestTrialIndex(record) {
  return record && typeof record.bestTrialIndex === 'number'
    ? record.bestTrialIndex
    : Number.MAX_SAFE_INTEGER;
}

function compareWinnerRecords(left, right) {
  const scoreDiff = getComparableScore(right) - getComparableScore(left);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const chunkNumberDiff = getComparableChunkNumber(left) - getComparableChunkNumber(right);
  if (chunkNumberDiff !== 0) {
    return chunkNumberDiff;
  }

  return getComparableBestTrialIndex(left) - getComparableBestTrialIndex(right);
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

function getComparableRunNumber(record) {
  return record && typeof record.runNumber === 'number'
    ? record.runNumber
    : Number.MAX_SAFE_INTEGER;
}

function getComparableRunId(record) {
  return record && typeof record.runId === 'string'
    ? record.runId
    : '￿';
}

function compareCampaignRunRecords(left, right) {
  const scoreDiff = getComparableScore(right) - getComparableScore(left);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const bestTrialIndexDiff = getComparableBestTrialIndex(left) - getComparableBestTrialIndex(right);
  if (bestTrialIndexDiff !== 0) {
    return bestTrialIndexDiff;
  }

  const runNumberDiff = getComparableRunNumber(left) - getComparableRunNumber(right);
  if (runNumberDiff !== 0) {
    return runNumberDiff;
  }

  return getComparableRunId(left).localeCompare(getComparableRunId(right));
}


function normalizeInitialTopChunkWinners(records, topN) {
  const safeRecords = Array.isArray(records)
    ? records.filter((record) => record && typeof record === 'object').map(cloneRecord)
    : [];

  safeRecords.sort(compareWinnerRecords);
  return safeRecords.slice(0, topN);
}

function createChunkConsolidator(options) {
  const source = options || {};
  const topN = Number.isInteger(source.topN) && source.topN > 0
    ? source.topN
    : 10;

  let globalBest = source.initialGlobalBest ? cloneRecord(source.initialGlobalBest) : null;
  let topChunkWinners = normalizeInitialTopChunkWinners(source.initialTopChunkWinners, topN);

  if (!globalBest && topChunkWinners.length > 0) {
    globalBest = cloneRecord(topChunkWinners[0]);
  }

  function recordChunkResult(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Chunk winner record is required.');
    }

    const safeRecord = cloneRecord(record);

    if (!globalBest || compareWinnerRecords(safeRecord, globalBest) < 0) {
      globalBest = safeRecord;
    }

    topChunkWinners.push(safeRecord);
    topChunkWinners.sort(compareWinnerRecords);

    if (topChunkWinners.length > topN) {
      topChunkWinners = topChunkWinners.slice(0, topN);
    }
  }

  function getState() {
    return {
      topN,
      globalBest: globalBest ? cloneRecord(globalBest) : null,
      topChunkWinners: topChunkWinners.map(cloneRecord)
    };
  }

  return {
    recordChunkResult,
    getState
  };
}


function normalizeCampaignRunRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('Campaign run record is required.');
  }

  if (typeof record.runId !== 'string' || !record.runId.trim()) {
    throw new Error('Campaign run record must include a non-empty runId.');
  }

  if (!Number.isInteger(record.trialCount) || record.trialCount < 1) {
    throw new Error(`Campaign run record must include a positive integer trialCount. Received: ${record.trialCount}`);
  }

  if (!Number.isInteger(record.repeatIndex) || record.repeatIndex < 1) {
    throw new Error(`Campaign run record must include a positive integer repeatIndex. Received: ${record.repeatIndex}`);
  }

  const safeRecord = cloneRecord(record);

  if (safeRecord.ok === undefined) {
    safeRecord.ok = typeof safeRecord.bestScore === 'number';
  } else {
    safeRecord.ok = Boolean(safeRecord.ok);
  }

  if (typeof safeRecord.runtimeMs === 'number' && !Number.isNaN(safeRecord.runtimeMs)) {
    if (safeRecord.runtimeSec === undefined || safeRecord.runtimeSec === null) {
      safeRecord.runtimeSec = safeRecord.runtimeMs / 1000;
    }
  } else {
    safeRecord.runtimeMs = null;
    if (safeRecord.runtimeSec === undefined) {
      safeRecord.runtimeSec = null;
    }
  }

  if (typeof safeRecord.bestScore !== 'number' || Number.isNaN(safeRecord.bestScore)) {
    safeRecord.bestScore = null;
  }

  if (!Number.isInteger(safeRecord.bestTrialIndex)) {
    safeRecord.bestTrialIndex = null;
  }

  if (!Number.isInteger(safeRecord.runNumber) || safeRecord.runNumber < 1) {
    safeRecord.runNumber = null;
  }

  if (typeof safeRecord.invocationMode !== 'string' || !safeRecord.invocationMode) {
    safeRecord.invocationMode = null;
  }

  if (typeof safeRecord.seed !== 'string' || !safeRecord.seed) {
    safeRecord.seed = null;
  }

  if (typeof safeRecord.runFolderName !== 'string' || !safeRecord.runFolderName) {
    safeRecord.runFolderName = null;
  }

  if (typeof safeRecord.artifactFileName !== 'string' || !safeRecord.artifactFileName) {
    safeRecord.artifactFileName = null;
  }

  if (typeof safeRecord.failureMessage !== 'string' || !safeRecord.failureMessage) {
    safeRecord.failureMessage = null;
  }

  if (!safeRecord.ok) {
    safeRecord.bestScore = safeRecord.bestScore === null ? null : safeRecord.bestScore;
  }

  return safeRecord;
}

function createCampaignConsolidator(options) {
  const source = options || {};
  const totalPlanned = Number.isInteger(source.totalPlanned) && source.totalPlanned >= 0
    ? source.totalPlanned
    : 0;

  let runs = Array.isArray(source.initialRuns)
    ? source.initialRuns.map(normalizeCampaignRunRecord)
    : [];

  let winnerRunRecord = null;

  function recomputeWinner() {
    winnerRunRecord = null;

    for (const runRecord of runs) {
      if (!runRecord.ok || typeof runRecord.bestScore !== 'number') {
        continue;
      }

      if (!winnerRunRecord || compareCampaignRunRecords(runRecord, winnerRunRecord) < 0) {
        winnerRunRecord = cloneRecord(runRecord);
      }
    }
  }

  recomputeWinner();

  function recordRunResult(record) {
    const safeRecord = normalizeCampaignRunRecord(record);
    runs.push(safeRecord);

    if (
      safeRecord.ok &&
      typeof safeRecord.bestScore === 'number' &&
      (!winnerRunRecord || compareCampaignRunRecords(safeRecord, winnerRunRecord) < 0)
    ) {
      winnerRunRecord = cloneRecord(safeRecord);
    }
  }

  function getState() {
    const completedCount = runs.length;
    const okCount = runs.filter((record) => record.ok).length;
    const failedCount = completedCount - okCount;

    return {
      totalPlanned,
      completedCount,
      okCount,
      failedCount,
      winnerRunRecord: winnerRunRecord ? cloneRecord(winnerRunRecord) : null,
      runs: runs.map(cloneRecord)
    };
  }

  return {
    recordRunResult,
    getState
  };
}

module.exports = {
  cloneRecord,
  compareCampaignRunRecords,
  compareWinnerRecords,
  createCampaignConsolidator,
  createChunkConsolidator
};
