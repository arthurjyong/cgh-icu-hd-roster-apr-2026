'use strict';

const fs = require('fs');
const path = require('path');

const CAMPAIGN_REPORT_CONTRACT_VERSION = 'benchmark_campaign_report_v1';

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

function buildCampaignFolderName(options) {
  const source = options || {};
  const config = source.config || {};
  const snapshotInfo = source.snapshotInfo || {};
  const timestampPart = formatLocalTimestamp(new Date());
  const batchLabelPart = sanitizeFileNamePart(config.campaignBatchLabel, 'campaign');
  const snapshotSha = snapshotInfo.file && typeof snapshotInfo.file.fileSha256 === 'string'
    ? snapshotInfo.file.fileSha256.slice(0, 8)
    : 'snapshot';

  return `${timestampPart}__batch-${batchLabelPart}__snap-${snapshotSha}`;
}

function buildManifestBase(options) {
  const config = options.config;
  const snapshotInfo = options.snapshotInfo;
  const chunkPlan = options.chunkPlan;
  const planFingerprint = options.planFingerprint || null;

  return {
    launcherPhase: '12F',
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
      runDir: config.runDir || null,
      uploadToDrive: !!config.uploadToDrive,
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
    }
  };
}


function buildCampaignReportDocument(options) {
  const source = options || {};
  const config = source.config || {};
  const snapshotInfo = source.snapshotInfo || {};
  const campaignPlan = source.campaignPlan || {};
  const campaignState = source.campaignState || {};

  const winnerRunRecord = campaignState.winnerRunRecord || null;
  const runs = Array.isArray(campaignState.runs) ? campaignState.runs : [];

  return {
    contractVersion: CAMPAIGN_REPORT_CONTRACT_VERSION,
    launcherPhase: source.launcherPhase || '13B',
    generatedAtIso: new Date().toISOString(),
    planFingerprint: source.planFingerprint || null,
    campaign: {
      batchLabel: config.campaignBatchLabel || null,
      snapshotPath: snapshotInfo.file ? snapshotInfo.file.absolutePath : null,
      snapshotFileName: snapshotInfo.file ? snapshotInfo.file.fileName : null,
      snapshotFileSha256: snapshotInfo.file ? snapshotInfo.file.fileSha256 : null,
      snapshotContractVersion: snapshotInfo.snapshot ? snapshotInfo.snapshot.contractVersion : null,
      campaignRepeats: config.campaignRepeats || null,
      campaignTrialCounts: Array.isArray(config.campaignTrialCounts)
        ? config.campaignTrialCounts.slice()
        : [],
      plannedRunCount: Number.isInteger(campaignPlan.plannedRunCount)
        ? campaignPlan.plannedRunCount
        : (Array.isArray(campaignPlan.runs) ? campaignPlan.runs.length : 0),
      chunkTrials: config.chunkTrials || null,
      topN: config.topN || null,
      baseSeed: config.baseSeed || null,
      uploadToDrive: !!config.uploadToDrive,
      driveRootFolderId: config.driveRootFolderId || null,
      driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId || null,
      driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName || null,
      campaignDir: source.campaignDir || null,
      runsDir: source.runsDir || null
    },
    summary: {
      totalPlanned: Number.isInteger(campaignState.totalPlanned) ? campaignState.totalPlanned : 0,
      completedCount: Number.isInteger(campaignState.completedCount) ? campaignState.completedCount : 0,
      okCount: Number.isInteger(campaignState.okCount) ? campaignState.okCount : 0,
      failedCount: Number.isInteger(campaignState.failedCount) ? campaignState.failedCount : 0
    },
    winner: winnerRunRecord ? {
      runId: winnerRunRecord.runId || null,
      runNumber: Number.isInteger(winnerRunRecord.runNumber) ? winnerRunRecord.runNumber : null,
      trialCount: Number.isInteger(winnerRunRecord.trialCount) ? winnerRunRecord.trialCount : null,
      repeatIndex: Number.isInteger(winnerRunRecord.repeatIndex) ? winnerRunRecord.repeatIndex : null,
      bestScore: typeof winnerRunRecord.bestScore === 'number' ? winnerRunRecord.bestScore : null,
      bestTrialIndex: Number.isInteger(winnerRunRecord.bestTrialIndex) ? winnerRunRecord.bestTrialIndex : null,
      runFolderName: winnerRunRecord.runFolderName || null,
      artifactFileName: winnerRunRecord.artifactFileName || null
    } : null,
    runs
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

function buildDriveUploadArtifactSet(artifactWriteResult) {
  if (!artifactWriteResult || typeof artifactWriteResult !== 'object') {
    throw new Error('artifactWriteResult is required to build Drive upload artifact set.');
  }

  const runDir = artifactWriteResult.runDir;
  const runFolderName = artifactWriteResult.runFolderName;

  if (typeof runDir !== 'string' || !runDir.trim()) {
    throw new Error('artifactWriteResult.runDir is required.');
  }

  if (typeof runFolderName !== 'string' || !runFolderName.trim()) {
    throw new Error('artifactWriteResult.runFolderName is required.');
  }

  const files = [];

  function pushFile(localPath, relativePath, mimeType) {
    if (!localPath) {
      return;
    }

    const absolutePath = path.resolve(localPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Expected artifact file not found: ${absolutePath}`);
    }

    files.push({
      localPath: absolutePath,
      relativePath,
      mimeType: mimeType || 'application/json'
    });
  }

  pushFile(artifactWriteResult.manifestPath, 'run_manifest.json');
  pushFile(artifactWriteResult.globalBestPath, 'global_best.transport_trial_result_v1.json');
  pushFile(artifactWriteResult.topChunkSummaryPath, 'top_chunks_summary.json');

  if (artifactWriteResult.topChunksDir && fs.existsSync(artifactWriteResult.topChunksDir)) {
    const topChunkFileNames = fs.readdirSync(artifactWriteResult.topChunksDir)
      .filter((entry) => entry.endsWith('.json'))
      .sort();

    topChunkFileNames.forEach((fileName) => {
      pushFile(
        path.join(artifactWriteResult.topChunksDir, fileName),
        path.posix.join('top_chunks', fileName)
      );
    });
  }

  return {
    runDir: path.resolve(runDir),
    runFolderName,
    files
  };
}


function buildCampaignDriveUploadArtifactSet(options) {
  const source = options || {};
  const campaignArtifactWriteResult = source.campaignArtifactWriteResult || source;
  const runArtifactSets = Array.isArray(source.runArtifactSets)
    ? source.runArtifactSets
    : [];

  if (!campaignArtifactWriteResult || typeof campaignArtifactWriteResult !== 'object') {
    throw new Error('campaignArtifactWriteResult is required to build campaign Drive upload artifact set.');
  }

  const campaignDir = campaignArtifactWriteResult.campaignDir;
  const campaignFolderName = campaignArtifactWriteResult.campaignFolderName;

  if (typeof campaignDir !== 'string' || !campaignDir.trim()) {
    throw new Error('campaignArtifactWriteResult.campaignDir is required.');
  }

  if (typeof campaignFolderName !== 'string' || !campaignFolderName.trim()) {
    throw new Error('campaignArtifactWriteResult.campaignFolderName is required.');
  }

  const files = [];

  function pushFile(localPath, relativePath, mimeType) {
    if (!localPath) {
      return;
    }

    const absolutePath = path.resolve(localPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Expected campaign artifact file not found: ${absolutePath}`);
    }

    files.push({
      localPath: absolutePath,
      relativePath,
      mimeType: mimeType || 'application/json'
    });
  }

  pushFile(
    campaignArtifactWriteResult.campaignReportPath,
    'benchmark_campaign_report_v1.json'
  );

  runArtifactSets.forEach((runArtifactSet, index) => {
    if (!runArtifactSet || typeof runArtifactSet !== 'object') {
      throw new Error(`runArtifactSets[${index}] must be an object.`);
    }

    if (typeof runArtifactSet.runFolderName !== 'string' || !runArtifactSet.runFolderName.trim()) {
      throw new Error(`runArtifactSets[${index}].runFolderName is required.`);
    }

    const runFiles = Array.isArray(runArtifactSet.files) ? runArtifactSet.files : [];
    runFiles.forEach((file, fileIndex) => {
      if (!file || typeof file !== 'object') {
        throw new Error(`runArtifactSets[${index}].files[${fileIndex}] must be an object.`);
      }

      if (typeof file.relativePath !== 'string' || !file.relativePath.trim()) {
        throw new Error(`runArtifactSets[${index}].files[${fileIndex}].relativePath is required.`);
      }

      pushFile(
        file.localPath,
        path.posix.join('runs', runArtifactSet.runFolderName, file.relativePath),
        file.mimeType || 'application/json'
      );
    });
  });

  return {
    runDir: path.resolve(campaignDir),
    runFolderName: campaignFolderName,
    files
  };
}

function writeDriveUploadSummary(runDir, uploadSummary) {
  const resolvedRunDir = path.resolve(runDir);
  ensureDir(resolvedRunDir);
  const summaryPath = path.join(resolvedRunDir, 'drive_upload_summary.json');
  writeJsonFile(summaryPath, uploadSummary || {});
  return summaryPath;
}


function createCampaignArtifactWriter(options) {
  const source = options || {};
  const config = source.config || {};
  const snapshotInfo = source.snapshotInfo || {};
  const campaignPlan = source.campaignPlan || {};
  const planFingerprint = source.planFingerprint || null;
  const outputRootDir = path.resolve(config.outputRootDir || path.join(process.cwd(), 'tmp', 'phase13_campaigns'));
  const campaignDir = config.campaignDir
    ? path.resolve(config.campaignDir)
    : path.join(outputRootDir, buildCampaignFolderName({ config, snapshotInfo }));
  const campaignFolderName = path.basename(campaignDir);
  const runsDir = path.join(campaignDir, 'runs');
  const paths = {
    outputRootDir,
    campaignDir,
    campaignFolderName,
    runsDir,
    campaignReportPath: path.join(campaignDir, 'benchmark_campaign_report_v1.json'),
    driveUploadSummaryPath: path.join(campaignDir, 'drive_upload_summary.json'),
    campaignStartedPath: path.join(campaignDir, 'campaign_started.json')
  };

  let initialized = false;

  function initializeCampaign() {
    if (!initialized) {
      ensureDir(campaignDir);
      ensureDir(runsDir);
      initialized = true;
    }

    if (!fs.existsSync(paths.campaignStartedPath)) {
      writeJsonFile(paths.campaignStartedPath, {
        launcherPhase: '13B',
        startedAtIso: new Date().toISOString(),
        planFingerprint,
        campaignDir,
        runsDir,
        campaignBatchLabel: config.campaignBatchLabel || null,
        snapshot: {
          contractVersion: snapshotInfo.snapshot ? snapshotInfo.snapshot.contractVersion : null,
          fileName: snapshotInfo.file ? snapshotInfo.file.fileName : null,
          fileSizeBytes: snapshotInfo.file ? snapshotInfo.file.fileSizeBytes : null,
          fileSha256: snapshotInfo.file ? snapshotInfo.file.fileSha256 : null
        },
        config: {
          campaignRepeats: config.campaignRepeats || null,
          campaignTrialCounts: Array.isArray(config.campaignTrialCounts)
            ? config.campaignTrialCounts.slice()
            : [],
          chunkTrials: config.chunkTrials || null,
          topN: config.topN || null,
          baseSeed: config.baseSeed || null,
          uploadToDrive: !!config.uploadToDrive
        },
        plannedRunCount: Number.isInteger(campaignPlan.plannedRunCount)
          ? campaignPlan.plannedRunCount
          : (Array.isArray(campaignPlan.runs) ? campaignPlan.runs.length : 0)
      });
    }

    return {
      ok: true,
      ...paths
    };
  }

  function writeCampaignReport(campaignState, extraOptions) {
    const sourceOptions = extraOptions || {};
    initializeCampaign();

    const reportDocument = buildCampaignReportDocument({
      launcherPhase: sourceOptions.launcherPhase || '13B',
      config,
      snapshotInfo,
      campaignPlan,
      campaignState,
      planFingerprint: sourceOptions.planFingerprint || planFingerprint,
      campaignDir,
      runsDir
    });

    writeJsonFile(paths.campaignReportPath, reportDocument);

    return {
      ok: true,
      campaignReportPath: paths.campaignReportPath,
      campaignDir,
      campaignFolderName,
      runsDir
    };
  }

  function buildCampaignArtifactWriteResult() {
    initializeCampaign();
    return {
      ok: true,
      ...paths
    };
  }

  return {
    initializeCampaign,
    writeCampaignReport,
    buildCampaignArtifactWriteResult,
    buildCampaignDriveUploadArtifactSet,
    writeDriveUploadSummary
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
    driveUploadSummaryPath: path.join(runDir, 'drive_upload_summary.json'),
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
      launcherPhase: safeState.launcherPhase || '12F',
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
    writeFinalArtifacts,
    buildDriveUploadArtifactSet,
    writeDriveUploadSummary
  };
}

module.exports = {
  CAMPAIGN_REPORT_CONTRACT_VERSION,
  buildCampaignDriveUploadArtifactSet,
  buildCampaignFolderName,
  buildCampaignReportDocument,
  buildDriveUploadArtifactSet,
  createCampaignArtifactWriter,
  createLocalArtifactWriter,
  sanitizeFileNamePart,
  summarizeChunkFailure,
  summarizeChunkSuccess,
  summarizeWinnerRecord,
  writeDriveUploadSummary
};
