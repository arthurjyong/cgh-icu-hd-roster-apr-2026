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

function clearDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
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
  const planFingerprint = options.planFingerprint || null;

  return {
    launcherPhase: '12E',
    createdAtIso: new Date().toISOString(),
    planFingerprint,
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
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume,
      runDir: config.runDir || null
    },
    snapshot: {
      contractVersion: snapshotInfo.snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      fileSha256: snapshotInfo.file.fileSha256,
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
    bestTrialIndex: typeof bestTrial.index === 'number' ? bestTrial.index : null,
    startedAtIso: execution.startedAtIso || null,
    completedAtIso: execution.completedAtIso || null
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
  const planFingerprint = source.planFingerprint || null;
  const outputRootDir = path.resolve(config.outputRootDir || path.join(process.cwd(), 'tmp', 'phase12_runs'));
  const runDir = config.runDir
    ? path.resolve(config.runDir)
    : path.join(outputRootDir, buildRunFolderName(config));
  const runFolderName = path.basename(runDir);
  const chunksDir = path.join(runDir, 'chunks');
  const topChunksDir = path.join(runDir, 'top_chunks');
  const checkpointTopChunksDir = path.join(runDir, 'checkpoint_top_chunks');
  const manifestBase = buildManifestBase({ config, snapshotInfo, chunkPlan, planFingerprint });

  const paths = {
    outputRootDir,
    runFolderName,
    runDir,
    chunksDir,
    topChunksDir,
    checkpointTopChunksDir,
    checkpointPath: path.join(runDir, 'checkpoint_state.json'),
    checkpointGlobalBestPath: path.join(runDir, 'checkpoint_global_best.transport_trial_result_v1.json'),
    manifestPath: path.join(runDir, 'run_manifest.json'),
    globalBestPath: path.join(runDir, 'global_best.transport_trial_result_v1.json'),
    topChunkSummaryPath: path.join(runDir, 'top_chunks_summary.json'),
    runStartedPath: path.join(runDir, 'run_started.json')
  };

  let initialized = false;

  function ensureRunDirs() {
    ensureDir(runDir);
    ensureDir(chunksDir);
    ensureDir(topChunksDir);
    ensureDir(checkpointTopChunksDir);
  }

  function initializeRun(optionsForRun) {
    const sourceRun = optionsForRun || {};

    if (!initialized) {
      ensureRunDirs();
      initialized = true;
    }

    if (!fs.existsSync(paths.runStartedPath)) {
      writeJsonFile(paths.runStartedPath, {
        ...manifestBase,
        runDir,
        chunksDir,
        topChunksDir,
        checkpointTopChunksDir,
        startedAtIso: new Date().toISOString(),
        mode: 'EXECUTE',
        resume: !!sourceRun.isResume
      });
    }

    return {
      ok: true,
      ...paths
    };
  }

  function recordChunkSuccess(execution) {
    initializeRun();

    if (config.saveChunkResponses) {
      const summary = summarizeChunkSuccess(execution);
      const fileName = `${String(summary.chunkNumber).padStart(4, '0')}__chunk_${summary.chunkNumber}.transport_trial_result_v1.json`;
      writeJsonFile(path.join(chunksDir, fileName), execution.transportResult);
    }
  }

  function recordChunkFailure() {
    initializeRun();
  }

  function writeCheckpointState(checkpointState) {
    initializeRun();

    const safeState = checkpointState || {};
    const requestedChunkCount = Number.isInteger(safeState.requestedChunkCount)
      ? safeState.requestedChunkCount
      : (chunkPlan.chunkCount || 0);

    const completedChunkNumbers = Array.isArray(safeState.completedChunkNumbers)
      ? safeState.completedChunkNumbers.slice()
      : [];

    let globalBestSummary = null;
    if (safeState.globalBestRecord && safeState.globalBestRecord.transportResult) {
      writeJsonFile(paths.checkpointGlobalBestPath, safeState.globalBestRecord.transportResult);
      globalBestSummary = {
        ...summarizeWinnerRecord(safeState.globalBestRecord),
        transportFileName: path.basename(paths.checkpointGlobalBestPath)
      };
    } else {
      removeFileIfExists(paths.checkpointGlobalBestPath);
    }

    clearDir(checkpointTopChunksDir);
    const topChunkSummaries = Array.isArray(safeState.topChunkWinnerRecords)
      ? safeState.topChunkWinnerRecords.map((record, index) => {
        const rank = String(index + 1).padStart(3, '0');
        const chunkNumber = record && record.chunk && typeof record.chunk.chunkNumber === 'number'
          ? record.chunk.chunkNumber
          : 'unknown';
        const fileName = `${rank}__chunk_${chunkNumber}.transport_trial_result_v1.json`;
        const filePath = path.join(checkpointTopChunksDir, fileName);

        if (record && record.transportResult) {
          writeJsonFile(filePath, record.transportResult);
        }

        return {
          ...summarizeWinnerRecord(record),
          rank: index + 1,
          transportFileName: path.join('checkpoint_top_chunks', fileName)
        };
      })
      : [];

    const checkpointDoc = {
      checkpointVersion: safeState.checkpointVersion || 'phase12_local_checkpoint_v1',
      launcherPhase: safeState.launcherPhase || '12E',
      status: safeState.status || 'RUNNING',
      planFingerprint: safeState.planFingerprint || planFingerprint,
      runDir,
      createdAtIso: safeState.createdAtIso || new Date().toISOString(),
      updatedAtIso: safeState.updatedAtIso || new Date().toISOString(),
      configSummary: safeState.configSummary || manifestBase.config,
      snapshotSummary: safeState.snapshotSummary || manifestBase.snapshot,
      requestedChunkCount,
      execution: {
        requestedChunkCount,
        completedChunkCount: completedChunkNumbers.length,
        failureCount: Array.isArray(safeState.failures) ? safeState.failures.length : 0,
        pendingChunkCount: Math.max(0, requestedChunkCount - completedChunkNumbers.length)
      },
      completedChunkNumbers,
      successes: Array.isArray(safeState.successes) ? safeState.successes : [],
      failures: Array.isArray(safeState.failures) ? safeState.failures : [],
      globalBest: globalBestSummary,
      topChunkWinners: topChunkSummaries
    };

    writeJsonFile(paths.checkpointPath, checkpointDoc);

    return {
      ok: true,
      checkpointPath: paths.checkpointPath,
      checkpointGlobalBestPath: globalBestSummary ? paths.checkpointGlobalBestPath : null,
      checkpointTopChunksDir,
      runDir
    };
  }

  function writeFinalArtifacts(finalState) {
    initializeRun();

    const sourceState = finalState || {};
    const globalBestRecord = sourceState.globalBestRecord || null;
    const topChunkWinnerRecords = Array.isArray(sourceState.topChunkWinnerRecords)
      ? sourceState.topChunkWinnerRecords
      : [];
    const requestedChunkCount = Number.isInteger(sourceState.requestedChunkCount)
      ? sourceState.requestedChunkCount
      : (chunkPlan.chunkCount || 0);

    const manifest = {
      ...manifestBase,
      finishedAtIso: new Date().toISOString(),
      runDir,
      chunksDir,
      topChunksDir,
      checkpointTopChunksDir,
      status: sourceState.status || null,
      execution: {
        successCount: Array.isArray(sourceState.successes) ? sourceState.successes.length : 0,
        failureCount: Array.isArray(sourceState.failures) ? sourceState.failures.length : 0,
        chunkCount: requestedChunkCount,
        completedChunkCount: Array.isArray(sourceState.completedChunkNumbers)
          ? sourceState.completedChunkNumbers.length
          : 0
      },
      completedChunkNumbers: Array.isArray(sourceState.completedChunkNumbers)
        ? sourceState.completedChunkNumbers
        : [],
      successes: Array.isArray(sourceState.successes) ? sourceState.successes : [],
      failures: Array.isArray(sourceState.failures) ? sourceState.failures : [],
      globalBest: globalBestRecord ? summarizeWinnerRecord(globalBestRecord) : null,
      topChunkWinners: topChunkWinnerRecords.map(summarizeWinnerRecord)
    };

    writeJsonFile(paths.manifestPath, manifest);

    if (globalBestRecord && globalBestRecord.transportResult) {
      writeJsonFile(paths.globalBestPath, globalBestRecord.transportResult);
    } else {
      removeFileIfExists(paths.globalBestPath);
    }

    writeJsonFile(paths.topChunkSummaryPath, topChunkWinnerRecords.map(summarizeWinnerRecord));

    clearDir(topChunksDir);
    topChunkWinnerRecords.forEach((record, index) => {
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
      ...paths,
      globalBestPath: globalBestRecord && globalBestRecord.transportResult ? paths.globalBestPath : null,
      topChunkCount: topChunkWinnerRecords.length,
      savedChunkResponses: !!config.saveChunkResponses
    };
  }

  return {
    initializeRun,
    recordChunkSuccess,
    recordChunkFailure,
    writeCheckpointState,
    writeFinalArtifacts
  };
}

module.exports = {
  createLocalArtifactWriter,
  sanitizeFileNamePart,
  summarizeChunkFailure,
  summarizeChunkSuccess,
  summarizeWinnerRecord
};
