'use strict';

const fs = require('fs');
const path = require('path');

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
      fileSizeBytes: fileStats.size
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

function buildPlanSummary(config, snapshotInfo, chunkPlan) {
  const snapshot = snapshotInfo.snapshot;
  const metadata = snapshot.metadata || {};
  const inputs = snapshot.inputs || {};
  const firstChunk = chunkPlan.chunks.length > 0 ? chunkPlan.chunks[0] : null;
  const lastChunk = chunkPlan.chunks.length > 0 ? chunkPlan.chunks[chunkPlan.chunks.length - 1] : null;

  return {
    launcherPhase: '12C',
    mode: 'DRY_RUN_PLAN_ONLY',
    message: 'Phase 12 launcher skeleton built chunk plan only. No worker call has been made.',
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
      topN: config.topN
    },
    snapshot: {
      contractVersion: snapshot.contractVersion,
      fileName: snapshotInfo.file.fileName,
      fileSizeBytes: snapshotInfo.file.fileSizeBytes,
      trialSpecFromArtifact: snapshot.trialSpec || null,
      metadata: {
        dateCount: typeof metadata.dateCount === 'number'
          ? metadata.dateCount
          : Array.isArray(inputs.calendarDays) ? inputs.calendarDays.length : null,
        doctorCount: typeof metadata.doctorCount === 'number'
          ? metadata.doctorCount
          : Array.isArray(inputs.doctors) ? inputs.doctors.length : null
      }
    },
    seedSchedule: {
      strategy: 'human_readable_string_seed_per_chunk',
      firstChunkSeed: firstChunk ? firstChunk.chunkSeed : null,
      lastChunkSeed: lastChunk ? lastChunk.chunkSeed : null
    },
    chunks: config.printChunks ? chunkPlan.chunks : undefined
  };
}

module.exports = {
  buildChunkPlan,
  buildPlanSummary,
  deriveChunkSeed,
  loadSnapshotFile
};