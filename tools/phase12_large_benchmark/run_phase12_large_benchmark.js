#!/usr/bin/env node
'use strict';

const path = require('path');

const { buildLauncherConfig } = require('./launcher_config');
const {
  loadSnapshotFile,
  buildChunkPlan,
  buildPlanFingerprint,
  buildPlanSummary,
  buildCampaignPlan,
  buildCampaignPlanFingerprint,
  buildCampaignPlanSummary
} = require('./launcher_plan');

function emitJson(value, stream) {
  const target = stream || process.stdout;
  target.write(`${JSON.stringify(value, null, 2)}\n`);
}

function loadExecutionModules(options) {
  const source = options || {};
  const includeDriveModules = !!source.includeDriveModules;

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
      requiredExports: ['createChunkConsolidator', 'createCampaignConsolidator']
    },
    {
      key: 'artifacts',
      relativePath: './launcher_artifacts',
      requiredExports: [
        'createLocalArtifactWriter',
        'createCampaignArtifactWriter',
        'buildDriveUploadArtifactSet',
        'buildCampaignDriveUploadArtifactSet',
        'writeDriveUploadSummary'
      ]
    },
    {
      key: 'checkpoint',
      relativePath: './launcher_checkpoint',
      requiredExports: ['createFreshCheckpointState', 'loadCheckpointState', 'CHECKPOINT_STATUS']
    }
  ];

  if (includeDriveModules) {
    moduleSpecs.push(
      {
        key: 'driveAuth',
        relativePath: './launcher_drive_auth',
        requiredExports: ['createDriveAuthGateway']
      },
      {
        key: 'driveUpload',
        relativePath: './launcher_drive_upload',
        requiredExports: ['uploadFinalArtifactsToDrive']
      }
    );
  }

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

function buildExecutionMissingError(options) {
  const source = options || {};
  const config = source.config;
  const snapshotInfo = source.snapshotInfo;
  const chunkPlan = source.chunkPlan || null;
  const campaignPlan = source.campaignPlan || null;
  const loadResult = source.loadResult;
  const isCampaign = config && config.mode === 'CAMPAIGN';

  return {
    ok: false,
    launcherPhase: isCampaign ? '13B' : '12F',
    stage: 'load_execution_modules',
    mode: config.dryRun ? 'DRY_RUN_PLAN_ONLY' : 'EXECUTE',
    message:
      isCampaign
        ? 'Execution helpers for Phase 13B campaign mode are not fully present yet. ' +
          'Ensure launcher_runtime.js, launcher_http.js, launcher_consolidate.js, launcher_artifacts.js, launcher_checkpoint.js, and when upload is enabled launcher_drive_auth.js and launcher_drive_upload.js are available with the Phase 13B exports.'
        : 'Execution helpers for Phase 12F are not fully present yet. ' +
          'Ensure launcher_runtime.js, launcher_http.js, launcher_consolidate.js, launcher_artifacts.js, launcher_checkpoint.js, and when upload is enabled launcher_drive_auth.js and launcher_drive_upload.js are available.',
    config: {
      mode: config.mode || 'SINGLE_RUN',
      snapshotPath: snapshotInfo.file.absolutePath,
      chunkTrials: config.chunkTrials,
      baseSeed: config.baseSeed,
      topN: config.topN,
      outputRootDir: config.outputRootDir,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume,
      runDir: config.runDir || null,
      campaignDir: config.campaignDir || null,
      campaignBatchLabel: config.campaignBatchLabel || null,
      campaignRepeats: config.campaignRepeats || null,
      campaignTrialCounts: Array.isArray(config.campaignTrialCounts) ? config.campaignTrialCounts : [],
      uploadToDrive: !!config.uploadToDrive,
      driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile || null,
      driveOAuthTokenFile: config.driveOAuthTokenFile || null,
      driveRootFolderId: config.driveRootFolderId || null,
      driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId || null,
      driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName || null
    },
    executionPlan: isCampaign
      ? {
          plannedRunCount: campaignPlan ? campaignPlan.plannedRunCount : null,
          firstRunId: campaignPlan ? campaignPlan.firstRunId : null,
          lastRunId: campaignPlan ? campaignPlan.lastRunId : null
        }
      : {
          totalTrials: config.totalTrials,
          chunkCount: chunkPlan ? chunkPlan.chunkCount : null
        },
    missingModules: loadResult.missing
  };
}


function compareChunkWinnerRecords(left, right) {
  const leftScore = left && left.bestScore;
  const rightScore = right && right.bestScore;

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
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

function getTransportInvocationMode(transportSummary, transportResult) {
  if (transportSummary && typeof transportSummary.invocationMode === 'string' && transportSummary.invocationMode) {
    return transportSummary.invocationMode;
  }

  if (transportResult && typeof transportResult.invocationMode === 'string' && transportResult.invocationMode) {
    return transportResult.invocationMode;
  }

  return null;
}

function getTransportMessage(transportSummary, transportResult) {
  if (transportSummary && typeof transportSummary.message === 'string' && transportSummary.message) {
    return transportSummary.message;
  }

  if (transportResult && typeof transportResult.message === 'string' && transportResult.message) {
    return transportResult.message;
  }

  return null;
}

function getBestTrialScoringSummary(transportResult) {
  const bestTrial = transportResult && transportResult.bestTrial ? transportResult.bestTrial : null;
  const scoringSummary = bestTrial && bestTrial.scoringSummary ? bestTrial.scoringSummary : null;

  if (!scoringSummary || typeof scoringSummary !== 'object') {
    return null;
  }

  return scoringSummary;
}

function summarizeWinnerRecordForOutput(record) {
  if (!record) {
    return null;
  }

  const transportSummary = record.transportSummary || null;
  const transportResult = record.transportResult || null;
  const scoringSummary = getBestTrialScoringSummary(transportResult);

  const meanPoints = scoringSummary && typeof scoringSummary.meanPoints === 'number'
    ? scoringSummary.meanPoints
    : (transportSummary && typeof transportSummary.meanPoints === 'number' ? transportSummary.meanPoints : null);
  const standardDeviation = scoringSummary && typeof scoringSummary.standardDeviation === 'number'
    ? scoringSummary.standardDeviation
    : (transportSummary && typeof transportSummary.standardDeviation === 'number' ? transportSummary.standardDeviation : null);
  const range = scoringSummary && typeof scoringSummary.range === 'number'
    ? scoringSummary.range
    : (transportSummary && typeof transportSummary.range === 'number' ? transportSummary.range : null);
  const totalScore = scoringSummary && typeof scoringSummary.totalScore === 'number'
    ? scoringSummary.totalScore
    : (typeof record.bestScore === 'number' ? record.bestScore : null);

  return {
    chunkNumber: record.chunk ? record.chunk.chunkNumber : null,
    startTrialIndex: record.chunk ? record.chunk.startTrialIndex : null,
    endTrialIndexExclusive: record.chunk ? record.chunk.endTrialIndexExclusive : null,
    trialCount: record.chunk ? record.chunk.trialCount : null,
    chunkSeed: record.chunk ? record.chunk.chunkSeed : null,
    bestScore: record.bestScore,
    bestTrialIndex: record.bestTrialIndex,
    invocationMode: getTransportInvocationMode(transportSummary, transportResult),
    message: getTransportMessage(transportSummary, transportResult),
    meanPoints,
    standardDeviation,
    range,
    totalScore
  };
}

function summarizeFailureRecord(failureRecord) {
  return {
    chunk: failureRecord.chunk,
    message: failureRecord.message || null,
    stage: failureRecord.stage || null,
    statusCode: failureRecord.statusCode || null
  };
}

function summarizeCampaignWinnerForOutput(record) {
  if (!record) {
    return null;
  }

  return {
    runId: record.runId || null,
    runNumber: typeof record.runNumber === 'number' ? record.runNumber : null,
    trialCount: typeof record.trialCount === 'number' ? record.trialCount : null,
    repeatIndex: typeof record.repeatIndex === 'number' ? record.repeatIndex : null,
    bestScore: typeof record.bestScore === 'number' ? record.bestScore : null,
    bestTrialIndex: typeof record.bestTrialIndex === 'number' ? record.bestTrialIndex : null,
    invocationMode: record.invocationMode || null,
    runFolderName: record.runFolderName || null,
    artifactFileName: record.artifactFileName || null,
    meanPoints: record.scoring && typeof record.scoring.meanPoints === 'number'
      ? record.scoring.meanPoints
      : null,
    standardDeviation: record.scoring && typeof record.scoring.standardDeviation === 'number'
      ? record.scoring.standardDeviation
      : null,
    range: record.scoring && typeof record.scoring.range === 'number'
      ? record.scoring.range
      : null
  };
}

function summarizeSuccessExecution(execution) {
  const transportSummary = execution.transportSummary || null;
  const transportResult = execution.transportResult || null;
  const bestTrial = transportResult && transportResult.bestTrial ? transportResult.bestTrial : null;

  return {
    chunk: execution.chunk,
    bestScore: transportSummary && typeof transportSummary.bestScore === 'number'
      ? transportSummary.bestScore
      : (bestTrial && typeof bestTrial.score === 'number' ? bestTrial.score : null),
    bestTrialIndex: bestTrial && typeof bestTrial.index === 'number'
      ? bestTrial.index
      : null,
    invocationMode: getTransportInvocationMode(transportSummary, transportResult),
    message: getTransportMessage(transportSummary, transportResult)
  };
}

function upsertFailureSummary(state, failureSummary) {
  if (!Array.isArray(state.failures)) {
    state.failures = [];
  }

  const chunkNumber = failureSummary && failureSummary.chunk ? failureSummary.chunk.chunkNumber : null;
  const existingIndex = state.failures.findIndex((entry) => {
    return entry && entry.chunk && entry.chunk.chunkNumber === chunkNumber;
  });

  if (existingIndex >= 0) {
    state.failures[existingIndex] = failureSummary;
  } else {
    state.failures.push(failureSummary);
  }
}

function upsertSuccessSummary(state, successSummary) {
  if (!Array.isArray(state.successes)) {
    state.successes = [];
  }

  const chunkNumber = successSummary && successSummary.chunk ? successSummary.chunk.chunkNumber : null;
  const existingIndex = state.successes.findIndex((entry) => {
    return entry && entry.chunk && entry.chunk.chunkNumber === chunkNumber;
  });

  if (existingIndex >= 0) {
    state.successes[existingIndex] = successSummary;
  } else {
    state.successes.push(successSummary);
  }

  if (!Array.isArray(state.completedChunkNumbers)) {
    state.completedChunkNumbers = [];
  }

  if (typeof chunkNumber === 'number' && !state.completedChunkNumbers.includes(chunkNumber)) {
    state.completedChunkNumbers.push(chunkNumber);
    state.completedChunkNumbers.sort((a, b) => a - b);
  }

  if (Array.isArray(state.failures)) {
    state.failures = state.failures.filter((entry) => {
      return !(entry && entry.chunk && entry.chunk.chunkNumber === chunkNumber);
    });
  }
}

function extractChunkWinnerRecord(execution) {
  const bestTrial = execution && execution.transportResult && execution.transportResult.bestTrial
    ? execution.transportResult.bestTrial
    : null;

  return {
    chunk: execution.chunk,
    bestScore: bestTrial && typeof bestTrial.score === 'number' ? bestTrial.score : null,
    bestTrialIndex: bestTrial && typeof bestTrial.index === 'number' ? bestTrial.index : null,
    transportSummary: execution.transportSummary || null,
    transportResult: execution.transportResult || null
  };
}

function getPendingChunks(chunkPlan, completedChunkNumbers) {
  const completed = new Set(Array.isArray(completedChunkNumbers) ? completedChunkNumbers : []);
  return chunkPlan.chunks.filter((chunk) => !completed.has(chunk.chunkNumber));
}

function buildCompactSummary(config, snapshotInfo, chunkPlan, planFingerprint, state, artifactWriteResult, message, mode, driveUpload) {
  const pendingChunkCount = Math.max(
    0,
    chunkPlan.chunkCount - (Array.isArray(state.completedChunkNumbers) ? state.completedChunkNumbers.length : 0)
  );

  return {
    ok: state.status === 'COMPLETED' && pendingChunkCount === 0 && (!state.failures || state.failures.length === 0),
    launcherPhase: '12F',
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
      runDir: config.runDir || (artifactWriteResult ? artifactWriteResult.runDir : null),
      uploadToDrive: !!config.uploadToDrive,
      driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile || null,
      driveOAuthTokenFile: config.driveOAuthTokenFile || null,
      driveRootFolderId: config.driveRootFolderId || null,
      driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId || null,
      driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName || null
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
    artifacts: artifactWriteResult || null,
    driveUpload: driveUpload || null
  };
}


function buildCampaignCompactSummary(
  config,
  snapshotInfo,
  campaignPlan,
  planFingerprint,
  campaignState,
  campaignArtifactWriteResult,
  message,
  mode,
  driveUpload
) {
  const completedCount = Number.isInteger(campaignState.completedCount) ? campaignState.completedCount : 0;
  const failedCount = Number.isInteger(campaignState.failedCount) ? campaignState.failedCount : 0;
  const totalPlanned = Number.isInteger(campaignState.totalPlanned) ? campaignState.totalPlanned : 0;
  const pendingCount = Math.max(0, totalPlanned - completedCount);
  const ok = completedCount === totalPlanned && failedCount === 0;

  return {
    ok,
    launcherPhase: '13B',
    mode: mode || 'EXECUTE_CAMPAIGN',
    message,
    planFingerprint,
    config: {
      mode: config.mode || 'CAMPAIGN',
      snapshotPath: snapshotInfo.file.absolutePath,
      campaignBatchLabel: config.campaignBatchLabel || null,
      campaignRepeats: config.campaignRepeats || null,
      campaignTrialCounts: Array.isArray(config.campaignTrialCounts) ? config.campaignTrialCounts.slice() : [],
      plannedRunCount: campaignPlan.plannedRunCount,
      chunkTrials: config.chunkTrials,
      baseSeed: config.baseSeed,
      topN: config.topN,
      outputRootDir: config.outputRootDir,
      requestTimeoutMs: config.requestTimeoutMs,
      failFast: config.failFast,
      saveChunkResponses: config.saveChunkResponses,
      resume: !!config.resume,
      campaignDir: campaignArtifactWriteResult ? campaignArtifactWriteResult.campaignDir : (config.campaignDir || null),
      uploadToDrive: !!config.uploadToDrive,
      driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile || null,
      driveOAuthTokenFile: config.driveOAuthTokenFile || null,
      driveRootFolderId: config.driveRootFolderId || null,
      driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId || null,
      driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName || null
    },
    snapshot: {
      contractVersion: snapshotInfo.snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      fileSha256: snapshotInfo.file.fileSha256,
      metadata: snapshotInfo.snapshot.metadata || null
    },
    execution: {
      totalPlanned,
      completedCount,
      okCount: Number.isInteger(campaignState.okCount) ? campaignState.okCount : 0,
      failedCount,
      pendingCount
    },
    winner: summarizeCampaignWinnerForOutput(campaignState.winnerRunRecord || null),
    artifacts: campaignArtifactWriteResult || null,
    driveUpload: driveUpload || null
  };
}

async function maybeUploadToDrive(config, modules, artifactWriteResult) {
  if (!config.uploadToDrive) {
    return null;
  }

  const artifactSet = modules.artifacts.buildDriveUploadArtifactSet(artifactWriteResult);
  const driveAuthGateway = await modules.driveAuth.createDriveAuthGateway({ config });
  const driveUploadResult = await modules.driveUpload.uploadFinalArtifactsToDrive({
    driveAuthGateway,
    config,
    artifactSet
  });

  const driveUploadSummary = {
    launcherPhase: '12F',
    uploadedAtIso: new Date().toISOString(),
    authMode: driveUploadResult.authMode || 'OAUTH_DESKTOP',
    principalEmail: driveUploadResult.principalEmail || null,
    principalDisplayName: driveUploadResult.principalDisplayName || null,
    credentialsFilePath: driveUploadResult.credentialsFilePath || null,
    tokenFilePath: driveUploadResult.tokenFilePath || null,
    rootFolder: driveUploadResult.rootFolder || null,
    benchmarkRunsFolder: driveUploadResult.benchmarkRunsFolder || null,
    runFolder: driveUploadResult.runFolder || null,
    uploadedFiles: Array.isArray(driveUploadResult.uploadedFiles)
      ? driveUploadResult.uploadedFiles
      : []
  };

  const summaryPath = modules.artifacts.writeDriveUploadSummary(
    artifactWriteResult.runDir,
    driveUploadSummary
  );

  return {
    ...driveUploadSummary,
    summaryPath
  };
}


async function maybeUploadCampaignToDrive(config, modules, campaignArtifactWriteResult, runArtifactSets) {
  if (!config.uploadToDrive) {
    return null;
  }

  const artifactSet = modules.artifacts.buildCampaignDriveUploadArtifactSet({
    campaignArtifactWriteResult,
    runArtifactSets
  });
  const driveAuthGateway = await modules.driveAuth.createDriveAuthGateway({ config });
  const driveUploadResult = await modules.driveUpload.uploadFinalArtifactsToDrive({
    driveAuthGateway,
    config,
    artifactSet
  });

  const driveUploadSummary = {
    launcherPhase: '13B',
    uploadedAtIso: new Date().toISOString(),
    authMode: driveUploadResult.authMode || 'OAUTH_DESKTOP',
    principalEmail: driveUploadResult.principalEmail || null,
    principalDisplayName: driveUploadResult.principalDisplayName || null,
    credentialsFilePath: driveUploadResult.credentialsFilePath || null,
    tokenFilePath: driveUploadResult.tokenFilePath || null,
    rootFolder: driveUploadResult.rootFolder || null,
    benchmarkRunsFolder: driveUploadResult.benchmarkRunsFolder || null,
    campaignFolder: driveUploadResult.runFolder || null,
    uploadedFiles: Array.isArray(driveUploadResult.uploadedFiles)
      ? driveUploadResult.uploadedFiles
      : []
  };

  const summaryPath = modules.artifacts.writeDriveUploadSummary(
    campaignArtifactWriteResult.campaignDir,
    driveUploadSummary
  );

  return {
    ...driveUploadSummary,
    summaryPath
  };
}

function buildCampaignRunConfig(baseConfig, runSpec, runsDir) {
  return {
    ...baseConfig,
    mode: 'SINGLE_RUN',
    totalTrials: runSpec.trialCount,
    baseSeed: runSpec.baseSeedForRun,
    runDir: path.join(runsDir, runSpec.runId),
    uploadToDrive: false
  };
}

function buildCampaignRunRecord(runSpec, runConfig, snapshotInfo, runSummary, runtimeMs) {
  const globalBest = runSummary && runSummary.globalBest ? runSummary.globalBest : null;
  const failureRecord = runSummary && Array.isArray(runSummary.failures) && runSummary.failures.length > 0
    ? runSummary.failures[0]
    : null;
  const runFolderName = runSummary && runSummary.artifacts
    ? (runSummary.artifacts.runFolderName || path.basename(runSummary.artifacts.runDir || runConfig.runDir))
    : path.basename(runConfig.runDir);
  const artifactFileName = runSummary && runSummary.ok && runSummary.artifacts
    ? 'global_best.transport_trial_result_v1.json'
    : null;

  return {
    runId: runSpec.runId,
    runNumber: runSpec.runNumber,
    trialCount: runSpec.trialCount,
    repeatIndex: runSpec.repeatIndex,
    ok: !!(runSummary && runSummary.ok),
    runtimeMs,
    runtimeSec: typeof runtimeMs === 'number' ? runtimeMs / 1000 : null,
    seed: runSpec.baseSeedForRun,
    bestScore: globalBest && typeof globalBest.bestScore === 'number' ? globalBest.bestScore : null,
    bestTrialIndex: globalBest && typeof globalBest.bestTrialIndex === 'number' ? globalBest.bestTrialIndex : null,
    invocationMode: globalBest ? globalBest.invocationMode || null : null,
    runFolderName,
    artifactFileName,
    snapshotFileName: snapshotInfo.file.fileName,
    snapshotFileSha256: snapshotInfo.file.fileSha256,
    snapshotContractVersion: snapshotInfo.snapshot.contractVersion,
    scoring: globalBest ? {
      meanPoints: typeof globalBest.meanPoints === 'number' ? globalBest.meanPoints : null,
      standardDeviation: typeof globalBest.standardDeviation === 'number' ? globalBest.standardDeviation : null,
      range: typeof globalBest.range === 'number' ? globalBest.range : null,
      totalScore: typeof globalBest.totalScore === 'number' ? globalBest.totalScore : null
    } : null,
    summaryMessage: runSummary && runSummary.message ? runSummary.message : null,
    failureMessage: failureRecord && failureRecord.message
      ? failureRecord.message
      : (runSummary && !runSummary.ok ? runSummary.message || 'Campaign run failed.' : null)
  };
}

async function executeCampaignPlan(config, snapshotInfo, campaignPlan, planFingerprint, modules) {
  const campaignWriter = modules.artifacts.createCampaignArtifactWriter({
    config,
    snapshotInfo,
    campaignPlan,
    planFingerprint
  });

  const campaignInit = campaignWriter.initializeCampaign();
  const campaignConsolidator = modules.consolidate.createCampaignConsolidator({
    totalPlanned: campaignPlan.plannedRunCount
  });
  const runArtifactSets = [];

  campaignWriter.writeCampaignReport(campaignConsolidator.getState(), {
    launcherPhase: '13B',
    planFingerprint
  });

  for (const runSpec of campaignPlan.runs) {
    const runConfig = buildCampaignRunConfig(config, runSpec, campaignInit.runsDir);
    const runChunkPlan = buildChunkPlan(runConfig);
    const runPlanFingerprint = buildPlanFingerprint({
      snapshotInfo,
      config: runConfig
    });

    const startedAtMs = Date.now();
    const runSummary = await executeChunkPlan(
      runConfig,
      snapshotInfo,
      runChunkPlan,
      runPlanFingerprint,
      modules
    );
    const runtimeMs = Date.now() - startedAtMs;

    const runRecord = buildCampaignRunRecord(
      runSpec,
      runConfig,
      snapshotInfo,
      runSummary,
      runtimeMs
    );

    campaignConsolidator.recordRunResult(runRecord);

    if (config.uploadToDrive && runSummary && runSummary.ok && runSummary.artifacts) {
      runArtifactSets.push(
        modules.artifacts.buildDriveUploadArtifactSet(runSummary.artifacts)
      );
    }

    campaignWriter.writeCampaignReport(campaignConsolidator.getState(), {
      launcherPhase: '13B',
      planFingerprint
    });
  }

  const campaignState = campaignConsolidator.getState();
  const campaignArtifactWriteResult = campaignWriter.buildCampaignArtifactWriteResult();
  const driveUpload = await maybeUploadCampaignToDrive(
    config,
    modules,
    campaignArtifactWriteResult,
    runArtifactSets
  );

  campaignWriter.writeCampaignReport(campaignState, {
    launcherPhase: '13B',
    planFingerprint
  });

  const message = campaignState.failedCount > 0
    ? 'Phase 13 campaign completed with one or more failed runs. Review benchmark_campaign_report_v1.json for details.'
    : 'Phase 13 campaign completed successfully.';

  return buildCampaignCompactSummary(
    config,
    snapshotInfo,
    campaignPlan,
    planFingerprint,
    campaignState,
    campaignArtifactWriteResult,
    message,
    'EXECUTE_CAMPAIGN',
    driveUpload
  );
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
    resume: !!config.resume,
    uploadToDrive: !!config.uploadToDrive,
    driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile || null,
    driveOAuthTokenFile: config.driveOAuthTokenFile || null,
    driveRootFolderId: config.driveRootFolderId || null,
    driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId || null,
    driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName || null
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
    const driveUpload = checkpointState.status === checkpointModule.CHECKPOINT_STATUS.COMPLETED
      ? await maybeUploadToDrive(config, modules, artifactWriteResult)
      : null;

    return buildCompactSummary(
      config,
      snapshotInfo,
      chunkPlan,
      planFingerprint,
      checkpointState,
      artifactWriteResult,
      'Phase 12 run was already complete. No pending chunks were executed.',
      'EXECUTE',
      driveUpload
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
  const driveUpload = checkpointState.status === checkpointModule.CHECKPOINT_STATUS.COMPLETED
    ? await maybeUploadToDrive(config, modules, artifactWriteResult)
    : null;
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
    'EXECUTE',
    driveUpload
  );
}

async function main() {
  const config = buildLauncherConfig({
    argv: process.argv.slice(2),
    env: process.env
  });

  const snapshotInfo = loadSnapshotFile(config.snapshotPath);
  let dryRunSummary;
  let loadResult;
  let finalSummary;

  if (config.mode === 'CAMPAIGN') {
    const campaignPlan = buildCampaignPlan(config, snapshotInfo);
    const planFingerprint = buildCampaignPlanFingerprint({ snapshotInfo, config });
    dryRunSummary = buildCampaignPlanSummary(config, snapshotInfo, campaignPlan, { planFingerprint });

    if (config.dryRun) {
      emitJson(dryRunSummary);
      return;
    }

    loadResult = loadExecutionModules({ includeDriveModules: config.uploadToDrive });
    if (!loadResult.ok) {
      emitJson(buildExecutionMissingError({
        config,
        snapshotInfo,
        campaignPlan,
        loadResult
      }), process.stderr);
      process.exit(1);
      return;
    }

    finalSummary = await executeCampaignPlan(
      config,
      snapshotInfo,
      campaignPlan,
      planFingerprint,
      loadResult.modules
    );
  } else {
    const chunkPlan = buildChunkPlan(config);
    const planFingerprint = buildPlanFingerprint({ snapshotInfo, config });
    dryRunSummary = buildPlanSummary(config, snapshotInfo, chunkPlan, { planFingerprint });

    if (config.dryRun) {
      emitJson(dryRunSummary);
      return;
    }

    loadResult = loadExecutionModules({ includeDriveModules: config.uploadToDrive });
    if (!loadResult.ok) {
      emitJson(buildExecutionMissingError({
        config,
        snapshotInfo,
        chunkPlan,
        loadResult
      }), process.stderr);
      process.exit(1);
      return;
    }

    finalSummary = await executeChunkPlan(
      config,
      snapshotInfo,
      chunkPlan,
      planFingerprint,
      loadResult.modules
    );
  }

  emitJson(finalSummary, finalSummary.ok ? process.stdout : process.stderr);

  if (!finalSummary.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  emitJson({
    ok: false,
    launcherPhase: '13B',
    stage: 'unhandled_exception',
    message: error && error.message ? error.message : String(error)
  }, process.stderr);

  process.exit(1);
});
