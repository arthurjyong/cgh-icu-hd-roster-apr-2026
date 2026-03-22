#!/usr/bin/env node
'use strict';

const { buildLauncherConfig } = require('./launcher_config');
const {
  loadSnapshotFile,
  buildChunkPlan,
  buildPlanFingerprint,
  buildPlanSummary
} = require('./launcher_plan');

function emitJson(value, stream) {
  const target = stream || process.stdout;
  target.write(`${JSON.stringify(value, null, 2)}\n`);
}

function loadExecutionModules() {
  const moduleSpecs = [
    {
      key: 'runtime',
      relativePath: './launcher_runtime',
      requiredExports: ['createRuntimeValidatorGateway']
    },
    {
      key: 'http',
      relativePath: './launcher_http',
      requiredExports: ['runWorkerChunk']
    },
    {
      key: 'consolidate',
      relativePath: './launcher_consolidate',
      requiredExports: ['createChunkConsolidator']
    },
    {
      key: 'artifacts',
      relativePath: './launcher_artifacts',
      requiredExports: ['createLocalArtifactWriter']
    },
    {
      key: 'checkpoint',
      relativePath: './launcher_checkpoint',
      requiredExports: ['createFreshCheckpointState', 'loadCheckpointState', 'CHECKPOINT_STATUS']
    }
  ];

  const loaded = {};
  const missing = [];

  for (const spec of moduleSpecs) {
    try {
      const mod = require(spec.relativePath);
      const missingExports = spec.requiredExports.filter((name) => typeof mod[name] === 'undefined');

      if (missingExports.length > 0) {
        missing.push({
          module: spec.relativePath,
          reason: `Missing required exports: ${missingExports.join(', ')}`
        });
        continue;
      }

      loaded[spec.key] = mod;
    } catch (error) {
      missing.push({
        module: spec.relativePath,
        reason: error && error.message ? error.message : String(error)
      });
    }
  }

  return {
    ok: missing.length === 0,
    modules: loaded,
    missing
  };
}

function buildExecutionMissingError(config, snapshotInfo, chunkPlan, loadResult) {
  return {
    ok: false,
    launcherPhase: '12E',
    stage: 'load_execution_modules',
    mode: config.dryRun ? 'DRY_RUN_PLAN_ONLY' : 'EXECUTE',
    message:
      'Execution helpers for Phase 12E are not present yet. ' +
      'Add launcher_runtime.js, launcher_http.js, launcher_consolidate.js, launcher_artifacts.js, and launcher_checkpoint.js before execute mode.',
    config: {
      snapshotPath: snapshotInfo.file.absolutePath,
      totalTrials: config.totalTrials,
      chunkTrials: config.chunkTrials,
      chunkCount: chunkPlan.chunkCount,
      baseSeed: config.baseSeed,
      topN: config.topN,
      outputRootDir: config.outputRootDir,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume,
      runDir: config.runDir || null
    },
    missingModules: loadResult.missing
  };
}

function compareChunkWinnerRecords(left, right) {
  const leftScore = left && left.bestScore;
  const rightScore = right && right.bestScore;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftChunkNumber = left && left.chunk ? left.chunk.chunkNumber : Number.MAX_SAFE_INTEGER;
  const rightChunkNumber = right && right.chunk ? right.chunk.chunkNumber : Number.MAX_SAFE_INTEGER;

  if (leftChunkNumber !== rightChunkNumber) {
    return leftChunkNumber - rightChunkNumber;
  }

  const leftTrialIndex = left && typeof left.bestTrialIndex === 'number'
    ? left.bestTrialIndex
    : Number.MAX_SAFE_INTEGER;
  const rightTrialIndex = right && typeof right.bestTrialIndex === 'number'
    ? right.bestTrialIndex
    : Number.MAX_SAFE_INTEGER;

  return leftTrialIndex - rightTrialIndex;
}

function summarizeWinnerRecordForOutput(record) {
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

function summarizeFailureRecord(failureRecord) {
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

function summarizeSuccessExecution(execution) {
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

function extractChunkWinnerRecord(execution) {
  const transport = execution.transportResult || {};
  const bestTrial = transport.bestTrial || {};
  const scoringSummary = bestTrial.scoringSummary || {};
  const allocationSummary = bestTrial.allocationSummary || {};

  return {
    chunk: execution.chunk || null,
    bestScore: typeof bestTrial.score === 'number' ? bestTrial.score : null,
    bestTrialIndex: typeof bestTrial.index === 'number' ? bestTrial.index : null,
    invocationMode: transport.invocationMode || null,
    message: transport.message || null,
    meanPoints: typeof allocationSummary.meanPoints === 'number' ? allocationSummary.meanPoints : null,
    standardDeviation: typeof allocationSummary.standardDeviation === 'number'
      ? allocationSummary.standardDeviation
      : null,
    range: typeof allocationSummary.range === 'number' ? allocationSummary.range : null,
    totalScore: typeof scoringSummary.totalScore === 'number' ? scoringSummary.totalScore : null,
    transportResult: transport
  };
}

function upsertSuccessSummary(state, successSummary) {
  const chunkNumber = successSummary.chunkNumber;
  state.successes = Array.isArray(state.successes) ? state.successes : [];
  state.successes = state.successes.filter((entry) => entry.chunkNumber !== chunkNumber);
  state.successes.push(successSummary);
  state.successes.sort((left, right) => left.chunkNumber - right.chunkNumber);

  state.completedChunkNumbers = Array.isArray(state.completedChunkNumbers)
    ? state.completedChunkNumbers.filter((entry) => entry !== chunkNumber)
    : [];
  state.completedChunkNumbers.push(chunkNumber);
  state.completedChunkNumbers = Array.from(new Set(state.completedChunkNumbers)).sort((left, right) => left - right);

  state.failures = Array.isArray(state.failures)
    ? state.failures.filter((entry) => entry.chunkNumber !== chunkNumber)
    : [];
}

function upsertFailureSummary(state, failureSummary) {
  const chunkNumber = failureSummary.chunkNumber;
  state.failures = Array.isArray(state.failures) ? state.failures : [];
  state.failures = state.failures.filter((entry) => entry.chunkNumber !== chunkNumber);
  state.failures.push(failureSummary);
  state.failures.sort((left, right) => {
    const leftChunk = typeof left.chunkNumber === 'number' ? left.chunkNumber : Number.MAX_SAFE_INTEGER;
    const rightChunk = typeof right.chunkNumber === 'number' ? right.chunkNumber : Number.MAX_SAFE_INTEGER;
    return leftChunk - rightChunk;
  });
}

function getPendingChunks(chunkPlan, completedChunkNumbers) {
  const completed = new Set(Array.isArray(completedChunkNumbers) ? completedChunkNumbers : []);
  return chunkPlan.chunks.filter((chunk) => !completed.has(chunk.chunkNumber));
}

function buildCompactSummary(config, snapshotInfo, chunkPlan, planFingerprint, state, artifactWriteResult, message, mode) {
  const pendingChunkCount = Math.max(
    0,
    chunkPlan.chunkCount - (Array.isArray(state.completedChunkNumbers) ? state.completedChunkNumbers.length : 0)
  );

  return {
    ok: state.status === 'COMPLETED' && pendingChunkCount === 0 && (!state.failures || state.failures.length === 0),
    launcherPhase: '12E',
    mode: mode || 'EXECUTE',
    message,
    planFingerprint,
    config: {
      snapshotPath: snapshotInfo.file.absolutePath,
      totalTrials: config.totalTrials,
      chunkTrials: config.chunkTrials,
      chunkCount: chunkPlan.chunkCount,
      baseSeed: config.baseSeed,
      topN: config.topN,
      outputRootDir: config.outputRootDir,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume,
      runDir: config.runDir || (artifactWriteResult ? artifactWriteResult.runDir : null)
    },
    snapshot: {
      contractVersion: snapshotInfo.snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      fileSha256: snapshotInfo.file.fileSha256,
      metadata: snapshotInfo.snapshot.metadata || null
    },
    execution: {
      completedChunks: Array.isArray(state.completedChunkNumbers) ? state.completedChunkNumbers.length : 0,
      failedChunks: Array.isArray(state.failures) ? state.failures.length : 0,
      pendingChunks: pendingChunkCount,
      requestedChunks: chunkPlan.chunkCount,
      status: state.status || null
    },
    globalBest: state.globalBestRecord ? summarizeWinnerRecordForOutput(state.globalBestRecord) : null,
    topChunkWinners: Array.isArray(state.topChunkWinnerRecords)
      ? state.topChunkWinnerRecords.slice().sort(compareChunkWinnerRecords).map(summarizeWinnerRecordForOutput)
      : [],
    failures: Array.isArray(state.failures) ? state.failures : [],
    artifacts: artifactWriteResult || null
  };
}

async function executeChunkPlan(config, snapshotInfo, chunkPlan, planFingerprint, modules) {
  const checkpointModule = modules.checkpoint;
  const checkpointLoadResult = config.resume
    ? checkpointModule.loadCheckpointState({
      runDir: config.runDir,
      planFingerprint
    })
    : null;

  const checkpointState = config.resume
    ? checkpointLoadResult.state
    : checkpointModule.createFreshCheckpointState({
      config,
      snapshotInfo,
      chunkPlan,
      planFingerprint,
      runDir: config.runDir || null
    });

  const runtimeGateway = modules.runtime.createRuntimeValidatorGateway();
  const consolidator = modules.consolidate.createChunkConsolidator({
    topN: config.topN,
    initialGlobalBest: checkpointState.globalBestRecord,
    initialTopChunkWinners: checkpointState.topChunkWinnerRecords
  });

  const artifactWriter = modules.artifacts.createLocalArtifactWriter({
    config,
    snapshotInfo,
    chunkPlan,
    planFingerprint
  });

  const initialConsolidationState = consolidator.getState();
  checkpointState.globalBestRecord = initialConsolidationState.globalBest || null;
  checkpointState.topChunkWinnerRecords = Array.isArray(initialConsolidationState.topChunkWinners)
    ? initialConsolidationState.topChunkWinners.slice().sort(compareChunkWinnerRecords)
    : [];
  checkpointState.configSummary = {
    ...(checkpointState.configSummary || {}),
    workerUrl: config.workerUrl,
    topN: config.topN,
    outputRootDir: config.outputRootDir,
    requestTimeoutMs: config.requestTimeoutMs,
    failFast: config.failFast,
    saveChunkResponses: config.saveChunkResponses,
    resume: !!config.resume
  };

  const initResult = artifactWriter.initializeRun({
    checkpointState,
    isResume: !!config.resume
  });

  checkpointState.runDir = initResult.runDir;
  checkpointState.updatedAtIso = new Date().toISOString();
  artifactWriter.writeCheckpointState(checkpointState);

  const pendingChunks = getPendingChunks(chunkPlan, checkpointState.completedChunkNumbers);

  if (pendingChunks.length === 0 && checkpointState.status === checkpointModule.CHECKPOINT_STATUS.COMPLETED) {
    const artifactWriteResult = artifactWriter.writeFinalArtifacts(checkpointState);
    return buildCompactSummary(
      config,
      snapshotInfo,
      chunkPlan,
      planFingerprint,
      checkpointState,
      artifactWriteResult,
      'Phase 12 run was already complete. No pending chunks were executed.',
      'EXECUTE'
    );
  }

  checkpointState.status = checkpointModule.CHECKPOINT_STATUS.RUNNING;
  checkpointState.updatedAtIso = new Date().toISOString();
  artifactWriter.writeCheckpointState(checkpointState);

  for (const chunk of pendingChunks) {
    const execution = await modules.http.runWorkerChunk({
      config,
      snapshot: snapshotInfo.snapshot,
      chunk,
      runtimeGateway
    });

    if (!execution || execution.ok !== true) {
      const failureRecord = {
        chunk,
        message: execution && execution.message ? execution.message : 'Unknown chunk execution failure.',
        stage: execution && execution.stage ? execution.stage : null,
        statusCode: execution && execution.statusCode ? execution.statusCode : null
      };

      artifactWriter.recordChunkFailure(failureRecord);
      upsertFailureSummary(checkpointState, summarizeFailureRecord(failureRecord));
      checkpointState.status = config.failFast
        ? checkpointModule.CHECKPOINT_STATUS.PAUSED_AFTER_FAILURE
        : checkpointModule.CHECKPOINT_STATUS.RUNNING;
      checkpointState.updatedAtIso = new Date().toISOString();
      artifactWriter.writeCheckpointState(checkpointState);

      if (config.failFast) {
        break;
      }

      continue;
    }

    artifactWriter.recordChunkSuccess(execution);
    upsertSuccessSummary(checkpointState, summarizeSuccessExecution(execution));

    const winnerRecord = extractChunkWinnerRecord(execution);
    consolidator.recordChunkResult(winnerRecord);

    const consolidationState = consolidator.getState();
    checkpointState.globalBestRecord = consolidationState.globalBest || null;
    checkpointState.topChunkWinnerRecords = Array.isArray(consolidationState.topChunkWinners)
      ? consolidationState.topChunkWinners.slice().sort(compareChunkWinnerRecords)
      : [];
    checkpointState.status = checkpointModule.CHECKPOINT_STATUS.RUNNING;
    checkpointState.updatedAtIso = new Date().toISOString();

    artifactWriter.writeCheckpointState(checkpointState);
  }

  const remainingChunks = getPendingChunks(chunkPlan, checkpointState.completedChunkNumbers);
  if (remainingChunks.length === 0 && (!checkpointState.failures || checkpointState.failures.length === 0)) {
    checkpointState.status = checkpointModule.CHECKPOINT_STATUS.COMPLETED;
  } else if (checkpointState.failures && checkpointState.failures.length > 0) {
    checkpointState.status = checkpointModule.CHECKPOINT_STATUS.PAUSED_AFTER_FAILURE;
  }

  checkpointState.updatedAtIso = new Date().toISOString();
  artifactWriter.writeCheckpointState(checkpointState);

  const artifactWriteResult = artifactWriter.writeFinalArtifacts(checkpointState);
  const message = checkpointState.status === checkpointModule.CHECKPOINT_STATUS.COMPLETED
    ? 'Phase 12 chunk execution completed successfully.'
    : 'Phase 12 chunk execution paused with remaining or failed chunks. Resume is required to finish the run.';

  return buildCompactSummary(
    config,
    snapshotInfo,
    chunkPlan,
    planFingerprint,
    checkpointState,
    artifactWriteResult,
    message,
    'EXECUTE'
  );
}

async function main() {
  const config = buildLauncherConfig({
    argv: process.argv.slice(2),
    env: process.env
  });

  const snapshotInfo = loadSnapshotFile(config.snapshotPath);
  const chunkPlan = buildChunkPlan(config);
  const planFingerprint = buildPlanFingerprint({ snapshotInfo, config });
  const dryRunSummary = buildPlanSummary(config, snapshotInfo, chunkPlan, { planFingerprint });

  if (config.dryRun) {
    emitJson(dryRunSummary);
    return;
  }

  const loadResult = loadExecutionModules();
  if (!loadResult.ok) {
    emitJson(buildExecutionMissingError(config, snapshotInfo, chunkPlan, loadResult), process.stderr);
    process.exit(1);
    return;
  }

  const finalSummary = await executeChunkPlan(
    config,
    snapshotInfo,
    chunkPlan,
    planFingerprint,
    loadResult.modules
  );

  emitJson(finalSummary, finalSummary.ok ? process.stdout : process.stderr);

  if (!finalSummary.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  emitJson({
    ok: false,
    launcherPhase: '12E',
    stage: 'unhandled_exception',
    message: error && error.message ? error.message : String(error)
  }, process.stderr);

  process.exit(1);
});
