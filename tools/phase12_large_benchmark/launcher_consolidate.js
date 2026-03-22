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

function createChunkConsolidator(options) {
  const source = options || {};
  const topN = Number.isInteger(source.topN) && source.topN > 0
    ? source.topN
    : 10;

  let globalBest = null;
  let topChunkWinners = [];

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

module.exports = {
  compareWinnerRecords,
  createChunkConsolidator
};
