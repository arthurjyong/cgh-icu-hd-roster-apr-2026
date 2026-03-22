'use strict';

const fs = require('fs');
const path = require('path');

function sanitizeFileNamePart(value, fallbackValue) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallbackValue;
  }

  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || fallbackValue;
}

function formatLocalTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    String(date.getFullYear()),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildRunFolderName(config) {
  const timestampPart = formatLocalTimestamp(new Date());
  const seedPart = sanitizeFileNamePart(config.baseSeed, 'seed');
  return `${timestampPart}__t${config.totalTrials}__c${config.chunkTrials}__seed-${seedPart}`;
}

function buildManifestBase(options) {
  const config = options.config;
  const snapshotInfo = options.snapshotInfo;
  const chunkPlan = options.chunkPlan;

  return {
    launcherPhase: '12D',
    createdAtIso: new Date().toISOString(),
    config: {
      snapshotPath: snapshotInfo.file.absolutePath,
      workerUrl: config.workerUrl,
      totalTrials: config.totalTrials,
      chunkTrials: config.chunkTrials,
      chunkCount: chunkPlan.chunkCount,
      baseSeed: config.baseSeed,
      topN: config.topN,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses
    },
    snapshot: {
      contractVersion: snapshotInfo.snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      metadata: snapshotInfo.snapshot.metadata || null
    }
  };
}

function summarizeChunkSuccess(execution) {
  const transportResult = execution.transportResult || {};
  const bestTrial = transportResult.bestTrial || {};

  return {
    chunkNumber: execution.chunk ? execution.chunk.chunkNumber : null,
    startTrialIndex: execution.chunk ? execution.chunk.startTrialIndex : null,
    endTrialIndexExclusive: execution.chunk ? execution.chunk.endTrialIndexExclusive : null,
    trialCount: execution.chunk ? execution.chunk.trialCount : null,
    chunkSeed: execution.chunk ? execution.chunk.chunkSeed : null,
    statusCode: execution.statusCode || null,
    durationMs: execution.durationMs || null,
    bestScore: typeof bestTrial.score === 'number' ? bestTrial.score : null,
    bestTrialIndex: typeof bestTrial.index === 'number' ? bestTrial.index : null
  };
}

function summarizeChunkFailure(failureRecord) {
  return {
    chunkNumber: failureRecord.chunk ? failureRecord.chunk.chunkNumber : null,
    startTrialIndex: failureRecord.chunk ? failureRecord.chunk.startTrialIndex : null,
    endTrialIndexExclusive: failureRecord.chunk ? failureRecord.chunk.endTrialIndexExclusive : null,
    trialCount: failureRecord.chunk ? failureRecord.chunk.trialCount : null,
    chunkSeed: failureRecord.chunk ? failureRecord.chunk.chunkSeed : null,
    stage: failureRecord.stage || null,
    statusCode: failureRecord.statusCode || null,
    message: failureRecord.message || null
  };
}

function summarizeWinnerRecord(record) {
  return {
    chunkNumber: record && record.chunk ? record.chunk.chunkNumber : null,
    startTrialIndex: record && record.chunk ? record.chunk.startTrialIndex : null,
    endTrialIndexExclusive: record && record.chunk ? record.chunk.endTrialIndexExclusive : null,
    trialCount: record && record.chunk ? record.chunk.trialCount : null,
    chunkSeed: record && record.chunk ? record.chunk.chunkSeed : null,
    bestScore: record && typeof record.bestScore === 'number' ? record.bestScore : null,
    bestTrialIndex: record && typeof record.bestTrialIndex === 'number' ? record.bestTrialIndex : null,
    invocationMode: record ? record.invocationMode || null : null,
    message: record ? record.message || null : null,
    meanPoints: record && typeof record.meanPoints === 'number' ? record.meanPoints : null,
    standardDeviation: record && typeof record.standardDeviation === 'number' ? record.standardDeviation : null,
    range: record && typeof record.range === 'number' ? record.range : null,
    totalScore: record && typeof record.totalScore === 'number' ? record.totalScore : null
  };
}

function createLocalArtifactWriter(options) {
  const source = options || {};
  const config = source.config || {};
  const snapshotInfo = source.snapshotInfo || {};
  const chunkPlan = source.chunkPlan || {};
  const runFolderName = buildRunFolderName(config);
  const outputRootDir = path.resolve(config.outputRootDir || path.join(process.cwd(), 'tmp', 'phase12_runs'));
  const runDir = path.join(outputRootDir, runFolderName);
  const chunksDir = path.join(runDir, 'chunks');
  const topChunksDir = path.join(runDir, 'top_chunks');
  const manifestBase = buildManifestBase({ config, snapshotInfo, chunkPlan });

  const state = {
    initialized: false,
    successSummaries: [],
    failureSummaries: []
  };

  function initializeRun() {
    if (state.initialized) {
      return {
        ok: true,
        runDir,
        chunksDir,
        topChunksDir
      };
    }

    ensureDir(runDir);
    ensureDir(chunksDir);
    ensureDir(topChunksDir);

    writeJsonFile(path.join(runDir, 'run_started.json'), {
      ...manifestBase,
      runDir,
      chunksDir,
      topChunksDir,
      startedAtIso: new Date().toISOString(),
      mode: 'EXECUTE'
    });

    state.initialized = true;
    return {
      ok: true,
      runDir,
      chunksDir,
      topChunksDir
    };
  }

  function recordChunkSuccess(execution) {
    initializeRun();

    const summary = summarizeChunkSuccess(execution);
    state.successSummaries.push(summary);

    if (config.saveChunkResponses) {
      const fileName = `${String(summary.chunkNumber).padStart(4, '0')}__chunk_${summary.chunkNumber}.transport_trial_result_v1.json`;
      writeJsonFile(path.join(chunksDir, fileName), execution.transportResult);
    }
  }

  function recordChunkFailure(failureRecord) {
    initializeRun();
    state.failureSummaries.push(summarizeChunkFailure(failureRecord));
  }

  function writeFinalArtifacts(finalState) {
    initializeRun();

    const sourceState = finalState || {};
    const globalBest = sourceState.globalBest || null;
    const topChunkWinners = Array.isArray(sourceState.topChunkWinners)
      ? sourceState.topChunkWinners
      : [];

    const manifest = {
      ...manifestBase,
      finishedAtIso: new Date().toISOString(),
      runDir,
      chunksDir,
      topChunksDir,
      execution: {
        successCount: state.successSummaries.length,
        failureCount: state.failureSummaries.length,
        chunkCount: chunkPlan.chunkCount || null
      },
      successes: state.successSummaries,
      failures: state.failureSummaries,
      globalBest: globalBest ? summarizeWinnerRecord(globalBest) : null,
      topChunkWinners: topChunkWinners.map(summarizeWinnerRecord)
    };

    writeJsonFile(path.join(runDir, 'run_manifest.json'), manifest);

    if (globalBest && globalBest.transportResult) {
      writeJsonFile(
        path.join(runDir, 'global_best.transport_trial_result_v1.json'),
        globalBest.transportResult
      );
    }

    writeJsonFile(
      path.join(runDir, 'top_chunks_summary.json'),
      topChunkWinners.map(summarizeWinnerRecord)
    );

    topChunkWinners.forEach((record, index) => {
      if (!record || !record.transportResult) {
        return;
      }

      const rank = String(index + 1).padStart(3, '0');
      const chunkNumber = record.chunk && typeof record.chunk.chunkNumber === 'number'
        ? record.chunk.chunkNumber
        : 'unknown';
      const fileName = `${rank}__chunk_${chunkNumber}.transport_trial_result_v1.json`;

      writeJsonFile(path.join(topChunksDir, fileName), record.transportResult);
    });

    return {
      ok: true,
      outputRootDir,
      runFolderName,
      runDir,
      chunksDir,
      topChunksDir,
      manifestPath: path.join(runDir, 'run_manifest.json'),
      globalBestPath: globalBest && globalBest.transportResult
        ? path.join(runDir, 'global_best.transport_trial_result_v1.json')
        : null,
      topChunkCount: topChunkWinners.length,
      savedChunkResponses: !!config.saveChunkResponses
    };
  }

  return {
    initializeRun,
    recordChunkSuccess,
    recordChunkFailure,
    writeFinalArtifacts
  };
}

module.exports = {
  createLocalArtifactWriter,
  sanitizeFileNamePart,
  summarizeWinnerRecord
};
