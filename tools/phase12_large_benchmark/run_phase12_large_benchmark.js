#!/usr/bin/env node
'use strict';

const path = require('path');
const { buildLauncherConfig } = require('./launcher_config');
const {
  loadSnapshotFile,
  buildChunkPlan,
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
    }
  ];

  const loaded = {};
  const missing = [];

  for (const spec of moduleSpecs) {
    try {
      const mod = require(spec.relativePath);
      const missingExports = spec.requiredExports.filter((name) => typeof mod[name] !== 'function');

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
    launcherPhase: '12D',
    stage: 'load_execution_modules',
    mode: config.dryRun ? 'DRY_RUN_PLAN_ONLY' : 'EXECUTE',
    message:
      'Execution helpers for Phase 12D are not present yet. ' +
      'Add launcher_runtime.js, launcher_http.js, launcher_consolidate.js, and launcher_artifacts.js before execute mode.',
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
      saveChunkResponses: config.saveChunkResponses
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

function buildFinalSummary(config, snapshotInfo, chunkPlan, state, artifactWriteResult) {
  const successes = state.successes || [];
  const failures = state.failures || [];
  const globalBest = state.globalBest || null;
  const topChunkWinners = state.topChunkWinners || [];

  return {
    ok: failures.length === 0,
    launcherPhase: '12D',
    mode: 'EXECUTE',
    message: failures.length === 0
      ? 'Phase 12 chunk execution completed successfully.'
      : 'Phase 12 chunk execution completed with one or more failed chunks.',
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
      saveChunkResponses: config.saveChunkResponses
    },
    snapshot: {
      contractVersion: snapshotInfo.snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      metadata: snapshotInfo.snapshot.metadata || null
    },
    execution: {
      completedChunks: successes.length,
      failedChunks: failures.length,
      requestedChunks: chunkPlan.chunkCount
    },
    globalBest: globalBest,
    topChunkWinners: topChunkWinners,
    failures: failures,
    artifacts: artifactWriteResult || null
  };
}

async function executeChunkPlan(config, snapshotInfo, chunkPlan, modules) {
  const runtimeGateway = modules.runtime.createRuntimeValidatorGateway();
  const consolidator = modules.consolidate.createChunkConsolidator({ topN: config.topN });
  const artifactWriter = modules.artifacts.createLocalArtifactWriter({
    config,
    snapshotInfo,
    chunkPlan
  });

  if (typeof artifactWriter.initializeRun === 'function') {
    artifactWriter.initializeRun();
  }

  const state = {
    successes: [],
    failures: [],
    globalBest: null,
    topChunkWinners: []
  };

  for (const chunk of chunkPlan.chunks) {
    const execution = await modules.http.runWorkerChunk({
      config,
      snapshot: snapshotInfo.snapshot,
      chunk,
      runtimeGateway
    });

    if (!execution || execution.ok !== true) {
      const failureRecord = {
        chunk: chunk,
        message: execution && execution.message ? execution.message : 'Unknown chunk execution failure.',
        stage: execution && execution.stage ? execution.stage : null,
        statusCode: execution && execution.statusCode ? execution.statusCode : null
      };

      state.failures.push(failureRecord);

      if (typeof artifactWriter.recordChunkFailure === 'function') {
        artifactWriter.recordChunkFailure(failureRecord);
      }

      if (config.failFast) {
        break;
      }

      continue;
    }

    state.successes.push({
      chunk: chunk,
      statusCode: execution.statusCode || null,
      durationMs: execution.durationMs || null,
      bestScore: execution.transportResult
        && execution.transportResult.bestTrial
        && typeof execution.transportResult.bestTrial.score === 'number'
        ? execution.transportResult.bestTrial.score
        : null
    });

    const winnerRecord = extractChunkWinnerRecord(execution);
    consolidator.recordChunkResult(winnerRecord);

    if (typeof artifactWriter.recordChunkSuccess === 'function') {
      artifactWriter.recordChunkSuccess(execution);
    }
  }

  const consolidationState = consolidator.getState();
  const orderedTop = Array.isArray(consolidationState.topChunkWinners)
    ? consolidationState.topChunkWinners.slice().sort(compareChunkWinnerRecords)
    : [];

  state.globalBest = consolidationState.globalBest || null;
  state.topChunkWinners = orderedTop;

  const artifactWriteResult = typeof artifactWriter.writeFinalArtifacts === 'function'
    ? artifactWriter.writeFinalArtifacts({
      successes: state.successes,
      failures: state.failures,
      globalBest: state.globalBest,
      topChunkWinners: state.topChunkWinners
    })
    : null;

  return buildFinalSummary(config, snapshotInfo, chunkPlan, state, artifactWriteResult);
}

async function main() {
  const config = buildLauncherConfig({
    argv: process.argv.slice(2),
    env: process.env
  });

  const snapshotInfo = loadSnapshotFile(config.snapshotPath);
  const chunkPlan = buildChunkPlan(config);
  const dryRunSummary = buildPlanSummary(config, snapshotInfo, chunkPlan);

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
    launcherPhase: '12D',
    stage: 'unhandled_exception',
    message: error && error.message ? error.message : String(error)
  }, process.stderr);

  process.exit(1);
});
