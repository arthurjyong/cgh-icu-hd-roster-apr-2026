'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CAMPAIGN_PLAN_FINGERPRINT_VERSION = 'phase13_campaign_plan_fingerprint_v1';

function computeSha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function loadSnapshotFile(snapshotPath) {
  const absolutePath = path.resolve(snapshotPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Snapshot file not found: ${absolutePath}`);
  }

  const fileText = fs.readFileSync(absolutePath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(fileText);
  } catch (error) {
    throw new Error(`Snapshot file is not valid JSON: ${absolutePath}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Snapshot JSON must be an object.');
  }

  if (parsed.contractVersion !== 'compute_snapshot_v2') {
    throw new Error(`Snapshot contractVersion must be compute_snapshot_v2. Received: ${parsed.contractVersion}`);
  }

  if (!parsed.trialSpec || typeof parsed.trialSpec !== 'object') {
    throw new Error('Snapshot trialSpec is required.');
  }

  if (!parsed.inputs || typeof parsed.inputs !== 'object') {
    throw new Error('Snapshot inputs are required.');
  }

  const fileStats = fs.statSync(absolutePath);

  return {
    snapshot: parsed,
    file: {
      absolutePath,
      fileName: path.basename(absolutePath),
      fileSizeBytes: fileStats.size,
      fileSha256: computeSha256Hex(fileText)
    }
  };
}

function deriveChunkSeed(baseSeed, chunkIndex, startTrialIndex, chunkTrialCount) {
  return [
    'phase12',
    String(baseSeed),
    `chunk=${chunkIndex + 1}`,
    `start=${startTrialIndex}`,
    `count=${chunkTrialCount}`
  ].join('|');
}

function zeroPadInteger(value, width) {
  return String(value).padStart(width, '0');
}

function deriveCampaignRunId(trialCount, repeatIndex) {
  const normalizedTrialCount = Number(trialCount);
  const normalizedRepeatIndex = Number(repeatIndex);

  if (!Number.isInteger(normalizedTrialCount) || normalizedTrialCount < 1) {
    throw new Error(`trialCount must be a positive integer to derive a campaign run id. Received: ${trialCount}`);
  }

  if (!Number.isInteger(normalizedRepeatIndex) || normalizedRepeatIndex < 1) {
    throw new Error(`repeatIndex must be a positive integer to derive a campaign run id. Received: ${repeatIndex}`);
  }

  return `tc_${zeroPadInteger(normalizedTrialCount, 7)}_r${zeroPadInteger(normalizedRepeatIndex, 2)}`;
}

function deriveCampaignRunSeed(baseSeed, trialCount, repeatIndex) {
  return [
    'phase13',
    String(baseSeed),
    `trialCount=${trialCount}`,
    `repeat=${repeatIndex}`
  ].join('|');
}

function buildChunkPlan(config) {
  const chunks = [];
  let remainingTrials = config.totalTrials;
  let startTrialIndex = 0;
  let chunkIndex = 0;

  while (remainingTrials > 0) {
    const currentChunkTrials = Math.min(config.chunkTrials, remainingTrials);
    const chunkSeed = deriveChunkSeed(
      config.baseSeed,
      chunkIndex,
      startTrialIndex,
      currentChunkTrials
    );

    chunks.push({
      chunkIndex,
      chunkNumber: chunkIndex + 1,
      startTrialIndex,
      endTrialIndexExclusive: startTrialIndex + currentChunkTrials,
      trialCount: currentChunkTrials,
      chunkSeed
    });

    startTrialIndex += currentChunkTrials;
    remainingTrials -= currentChunkTrials;
    chunkIndex += 1;
  }

  return {
    totalTrials: config.totalTrials,
    chunkTrials: config.chunkTrials,
    chunkCount: chunks.length,
    baseSeed: config.baseSeed,
    topN: config.topN,
    chunks
  };
}

function buildSnapshotSummary(snapshotInfo) {
  const snapshot = snapshotInfo.snapshot;
  const metadata = snapshot.metadata || {};
  const inputs = snapshot.inputs || {};

  return {
    contractVersion: snapshot.contractVersion,
    fileName: snapshotInfo.file.fileName,
    fileSizeBytes: snapshotInfo.file.fileSizeBytes,
    fileSha256: snapshotInfo.file.fileSha256,
    trialSpecFromArtifact: snapshot.trialSpec || null,
    metadata: {
      dateCount: typeof metadata.dateCount === 'number'
        ? metadata.dateCount
        : Array.isArray(inputs.calendarDays) ? inputs.calendarDays.length : null,
      doctorCount: typeof metadata.doctorCount === 'number'
        ? metadata.doctorCount
        : Array.isArray(inputs.doctors) ? inputs.doctors.length : null
    }
  };
}


function buildCampaignPlanFingerprint(options) {
  const source = options || {};
  const snapshotInfo = source.snapshotInfo;
  const config = source.config;

  if (!snapshotInfo || !snapshotInfo.file || !snapshotInfo.file.fileSha256) {
    throw new Error('snapshotInfo.file.fileSha256 is required to build a campaign plan fingerprint.');
  }

  if (!config) {
    throw new Error('config is required to build a campaign plan fingerprint.');
  }

  if (!Array.isArray(config.campaignTrialCounts) || !config.campaignTrialCounts.length) {
    throw new Error('config.campaignTrialCounts is required to build a campaign plan fingerprint.');
  }

  if (!Number.isInteger(config.campaignRepeats) || config.campaignRepeats < 1) {
    throw new Error('config.campaignRepeats must be a positive integer to build a campaign plan fingerprint.');
  }

  return computeSha256Hex(JSON.stringify({
    fingerprintVersion: CAMPAIGN_PLAN_FINGERPRINT_VERSION,
    contractVersion: snapshotInfo.snapshot ? snapshotInfo.snapshot.contractVersion : null,
    snapshotFileSha256: snapshotInfo.file.fileSha256,
    campaignBatchLabel: config.campaignBatchLabel || null,
    campaignTrialCounts: config.campaignTrialCounts,
    campaignRepeats: config.campaignRepeats,
    chunkTrials: config.chunkTrials,
    baseSeed: String(config.baseSeed),
    topN: config.topN
  }));
}

function buildCampaignPlan(config, snapshotInfo) {
  if (!config || typeof config !== 'object') {
    throw new Error('config is required to build a campaign plan.');
  }

  if (!snapshotInfo || !snapshotInfo.file || !snapshotInfo.file.fileSha256) {
    throw new Error('snapshotInfo with fileSha256 is required to build a campaign plan.');
  }

  if (!Array.isArray(config.campaignTrialCounts) || !config.campaignTrialCounts.length) {
    throw new Error('config.campaignTrialCounts must contain at least one trial count.');
  }

  if (!Number.isInteger(config.campaignRepeats) || config.campaignRepeats < 1) {
    throw new Error('config.campaignRepeats must be a positive integer.');
  }

  if (!Number.isInteger(config.chunkTrials) || config.chunkTrials < 1) {
    throw new Error('config.chunkTrials must be a positive integer.');
  }

  if (config.baseSeed === undefined || config.baseSeed === null || config.baseSeed === '') {
    throw new Error('config.baseSeed is required to build a campaign plan.');
  }

  const runs = [];
  let globalRunIndex = 0;

  for (let trialIndex = 0; trialIndex < config.campaignTrialCounts.length; trialIndex++) {
    const trialCount = Number(config.campaignTrialCounts[trialIndex]);

    if (!Number.isInteger(trialCount) || trialCount < 1) {
      throw new Error(
        `campaignTrialCounts[${trialIndex}] must be a positive integer. Received: ${config.campaignTrialCounts[trialIndex]}`
      );
    }

    for (let repeatIndex = 1; repeatIndex <= config.campaignRepeats; repeatIndex++) {
      globalRunIndex += 1;

      const runId = deriveCampaignRunId(trialCount, repeatIndex);
      const baseSeedForRun = deriveCampaignRunSeed(config.baseSeed, trialCount, repeatIndex);

      runs.push({
        runIndex: globalRunIndex - 1,
        runNumber: globalRunIndex,
        runId,
        trialCount,
        repeatIndex,
        baseSeedForRun,
        chunkTrials: config.chunkTrials,
        topN: config.topN,
        plannedChunkCount: Math.ceil(trialCount / config.chunkTrials)
      });
    }
  }

  const firstRun = runs.length > 0 ? runs[0] : null;
  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;

  return {
    campaignBatchLabel: config.campaignBatchLabel || null,
    campaignRepeats: config.campaignRepeats,
    campaignTrialCounts: config.campaignTrialCounts.slice(),
    plannedRunCount: runs.length,
    chunkTrials: config.chunkTrials,
    topN: config.topN,
    snapshotFileName: snapshotInfo.file.fileName,
    snapshotFileSha256: snapshotInfo.file.fileSha256,
    firstRunId: firstRun ? firstRun.runId : null,
    lastRunId: lastRun ? lastRun.runId : null,
    runs
  };
}

function buildPlanFingerprint(options) {
  const source = options || {};
  const snapshotInfo = source.snapshotInfo;
  const config = source.config;

  if (!snapshotInfo || !snapshotInfo.file || !snapshotInfo.file.fileSha256) {
    throw new Error('snapshotInfo.file.fileSha256 is required to build a plan fingerprint.');
  }

  if (!config) {
    throw new Error('config is required to build a plan fingerprint.');
  }

  return computeSha256Hex(JSON.stringify({
    fingerprintVersion: 'phase12_plan_fingerprint_v1',
    contractVersion: snapshotInfo.snapshot ? snapshotInfo.snapshot.contractVersion : null,
    snapshotFileSha256: snapshotInfo.file.fileSha256,
    totalTrials: config.totalTrials,
    chunkTrials: config.chunkTrials,
    baseSeed: String(config.baseSeed)
  }));
}


function buildCampaignPlanSummary(config, snapshotInfo, campaignPlan, options) {
  const source = options || {};
  const firstRun = campaignPlan.runs.length > 0 ? campaignPlan.runs[0] : null;
  const lastRun = campaignPlan.runs.length > 0 ? campaignPlan.runs[campaignPlan.runs.length - 1] : null;

  return {
    launcherPhase: '13B',
    mode: 'DRY_RUN_CAMPAIGN_PLAN_ONLY',
    message: 'Phase 13 launcher built campaign plan only. No worker call has been made.',
    worker: {
      runRandomTrialsUrl: `${config.workerUrl}/run-random-trials`,
      tokenPreview: config.display.maskedWorkerToken
    },
    config: {
      snapshotPath: snapshotInfo.file.absolutePath,
      campaignBatchLabel: config.campaignBatchLabel || null,
      campaignRepeats: config.campaignRepeats,
      campaignTrialCounts: Array.isArray(config.campaignTrialCounts)
        ? config.campaignTrialCounts.slice()
        : [],
      plannedRunCount: campaignPlan.plannedRunCount,
      chunkTrials: config.chunkTrials,
      baseSeed: config.baseSeed,
      topN: config.topN,
      resume: !!config.resume,
      campaignDir: config.campaignDir || null
    },
    planFingerprint: source.planFingerprint || null,
    snapshot: buildSnapshotSummary(snapshotInfo),
    seedSchedule: {
      strategy: 'human_readable_string_seed_per_run',
      firstRunSeed: firstRun ? firstRun.baseSeedForRun : null,
      lastRunSeed: lastRun ? lastRun.baseSeedForRun : null
    },
    runs: config.printChunks ? campaignPlan.runs : undefined
  };
}

function buildPlanSummary(config, snapshotInfo, chunkPlan, options) {
  const source = options || {};
  const firstChunk = chunkPlan.chunks.length > 0 ? chunkPlan.chunks[0] : null;
  const lastChunk = chunkPlan.chunks.length > 0 ? chunkPlan.chunks[chunkPlan.chunks.length - 1] : null;

  return {
    launcherPhase: '12E',
    mode: 'DRY_RUN_PLAN_ONLY',
    message: 'Phase 12 launcher built chunk plan only. No worker call has been made.',
    worker: {
      runRandomTrialsUrl: `${config.workerUrl}/run-random-trials`,
      tokenPreview: config.display.maskedWorkerToken
    },
    config: {
      snapshotPath: snapshotInfo.file.absolutePath,
      totalTrials: config.totalTrials,
      chunkTrials: config.chunkTrials,
      chunkCount: chunkPlan.chunkCount,
      baseSeed: config.baseSeed,
      topN: config.topN,
      resume: !!config.resume,
      runDir: config.runDir || null
    },
    planFingerprint: source.planFingerprint || null,
    snapshot: buildSnapshotSummary(snapshotInfo),
    seedSchedule: {
      strategy: 'human_readable_string_seed_per_chunk',
      firstChunkSeed: firstChunk ? firstChunk.chunkSeed : null,
      lastChunkSeed: lastChunk ? lastChunk.chunkSeed : null
    },
    chunks: config.printChunks ? chunkPlan.chunks : undefined
  };
}

module.exports = {
  buildCampaignPlan,
  buildCampaignPlanFingerprint,
  buildCampaignPlanSummary,
  buildChunkPlan,
  buildPlanFingerprint,
  buildPlanSummary,
  buildSnapshotSummary,
  computeSha256Hex,
  deriveCampaignRunId,
  deriveCampaignRunSeed,
  deriveChunkSeed,
  loadSnapshotFile
};
