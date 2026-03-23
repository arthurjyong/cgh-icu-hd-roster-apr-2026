'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  CAMPAIGN_STATUSES,
  buildCampaignStatusFilename,
  buildCampaignStatusSummary,
  createInitialCampaignState,
  markCampaignComplete,
  markCampaignFailed,
  serializeCampaignState,
  validateCampaignState
} = require('./campaign_state');

const DEFAULT_LADDER = Object.freeze([
  1,
  5,
  10,
  50,
  100,
  500,
  1000,
  5000,
  10000,
  50000,
  100000,
  500000,
  1000000,
  5000000
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

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

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function normalizeTrialCounts(input) {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((value) => {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new Error('campaignTrialCounts must contain positive integers.');
      }
      return numeric;
    });
  }
  return DEFAULT_LADDER.slice();
}

function buildCampaignFolderName(options) {
  const source = options || {};
  const batchLabel = sanitizeFileNamePart(source.campaignBatchLabel, 'campaign');
  const snapshotSha = typeof source.snapshotFileSha256 === 'string' && source.snapshotFileSha256.trim()
    ? source.snapshotFileSha256.trim().slice(0, 8)
    : 'snapshot';
  const timestampPart = formatLocalTimestamp(source.now instanceof Date ? source.now : new Date());
  return `${timestampPart}__batch-${batchLabel}__snap-${snapshotSha}`;
}

function normalizeConfig(input) {
  const source = input || {};
  const snapshotPath = path.resolve(String(source.snapshotPath || '').trim());
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    throw new Error('snapshotPath is required and must exist.');
  }

  const workerUrl = String(source.workerUrl || '').trim();
  const workerToken = String(source.workerToken || '').trim();
  if (!workerUrl) {
    throw new Error('workerUrl is required.');
  }
  if (!workerToken) {
    throw new Error('workerToken is required.');
  }

  const campaignTrialCounts = normalizeTrialCounts(source.campaignTrialCounts);
  const campaignRepeats = Number(source.campaignRepeats || 3);
  if (!Number.isInteger(campaignRepeats) || campaignRepeats <= 0) {
    throw new Error('campaignRepeats must be a positive integer.');
  }

  const chunkTrials = Number(source.chunkTrials || 1000);
  if (!Number.isInteger(chunkTrials) || chunkTrials <= 0) {
    throw new Error('chunkTrials must be a positive integer.');
  }

  const outputRootDir = path.resolve(source.outputRootDir || path.join(process.cwd(), 'tmp', 'phase13_campaigns'));
  const snapshotFileName = path.basename(snapshotPath);
  const snapshotFileSha256 = String(source.snapshotFileSha256 || computeFileSha256(snapshotPath));
  const campaignBatchLabel = String(source.campaignBatchLabel || 'campaign').trim();
  const campaignFolderName = String(source.campaignFolderName || buildCampaignFolderName({
    campaignBatchLabel,
    snapshotFileSha256,
    now: source.now instanceof Date ? source.now : new Date()
  }));
  const campaignDir = path.resolve(source.campaignDir || path.join(outputRootDir, campaignFolderName));
  const campaignId = String(source.campaignId || campaignFolderName).trim();

  const uploadToDrive = !!source.uploadToDrive;

  return {
    campaignId,
    campaignBatchLabel,
    campaignTrialCounts,
    campaignRepeats,
    snapshotPath,
    snapshotFileName,
    snapshotFileSha256,
    workerUrl,
    workerToken,
    chunkTrials,
    baseSeed: String(source.baseSeed || '12345'),
    outputRootDir,
    campaignFolderName,
    campaignDir,
    uploadToDrive,
    driveOAuthClientCredentialsFile: source.driveOAuthClientCredentialsFile || null,
    driveOAuthTokenFile: source.driveOAuthTokenFile || null,
    driveRootFolderId: source.driveRootFolderId || null,
    driveBenchmarkRunsFolderId: source.driveBenchmarkRunsFolderId || null,
    driveBenchmarkRunsFolderName: source.driveBenchmarkRunsFolderName || null,
    launcherScriptPath: path.resolve(source.launcherScriptPath || path.join(__dirname, '..', 'tools', 'phase12_large_benchmark', 'run_phase12_large_benchmark.js')),
    env: source.env && typeof source.env === 'object' ? source.env : process.env,
    statusPollIntervalMs: Number(source.statusPollIntervalMs || 2000),
    topN: Number(source.topN || 10),
    requestTimeoutMs: Number(source.requestTimeoutMs || 600000),
    failFast: source.failFast !== false,
    saveChunkResponses: !!source.saveChunkResponses
  };
}

function buildLauncherArgs(config) {
  const args = [
    config.launcherScriptPath,
    '--mode', 'CAMPAIGN',
    '--execute',
    '--snapshot', config.snapshotPath,
    '--worker-url', config.workerUrl,
    '--worker-token', config.workerToken,
    '--chunk-trials', String(config.chunkTrials),
    '--base-seed', String(config.baseSeed),
    '--campaign-batch-label', config.campaignBatchLabel,
    '--campaign-trial-counts', config.campaignTrialCounts.join(','),
    '--campaign-repeats', String(config.campaignRepeats),
    '--output-root-dir', config.outputRootDir,
    '--campaign-dir', config.campaignDir,
    '--top-n', String(config.topN),
    '--request-timeout-ms', String(config.requestTimeoutMs),
    '--fail-fast', String(config.failFast),
    '--save-chunk-responses', String(config.saveChunkResponses)
  ];

  if (config.uploadToDrive) {
    args.push('--upload-to-drive', 'true');
    if (config.driveOAuthClientCredentialsFile) {
      args.push('--drive-oauth-client-credentials-file', String(config.driveOAuthClientCredentialsFile));
    }
    if (config.driveOAuthTokenFile) {
      args.push('--drive-oauth-token-file', String(config.driveOAuthTokenFile));
    }
    if (config.driveRootFolderId) {
      args.push('--drive-root-folder-id', String(config.driveRootFolderId));
    }
    if (config.driveBenchmarkRunsFolderId) {
      args.push('--drive-benchmark-runs-folder-id', String(config.driveBenchmarkRunsFolderId));
    }
    if (config.driveBenchmarkRunsFolderName) {
      args.push('--drive-benchmark-runs-folder-name', String(config.driveBenchmarkRunsFolderName));
    }
  }

  return args;
}

function buildStatusFilePath(campaignDir) {
  return path.join(path.resolve(campaignDir), buildCampaignStatusFilename());
}

function writeCampaignStatusFile(statusFilePath, state) {
  const validated = validateCampaignState(state);
  writeJsonFile(statusFilePath, JSON.parse(serializeCampaignState(validated)));
  return statusFilePath;
}

function readCampaignReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

function extractWinnerFromReport(report) {
  const winner = report && report.winner ? report.winner : null;
  if (!winner || !winner.runId) {
    return null;
  }
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const matchingRun = runs.find((run) => run && run.runId === winner.runId) || null;

  return {
    runId: winner.runId,
    trialCount: Number.isInteger(winner.trialCount) ? winner.trialCount : (matchingRun && Number.isInteger(matchingRun.trialCount) ? matchingRun.trialCount : null),
    repeatIndex: Number.isInteger(winner.repeatIndex) ? winner.repeatIndex : (matchingRun && Number.isInteger(matchingRun.repeatIndex) ? matchingRun.repeatIndex : null),
    bestScore: typeof winner.bestScore === 'number' ? winner.bestScore : (matchingRun && typeof matchingRun.bestScore === 'number' ? matchingRun.bestScore : null),
    bestTrialIndex: Number.isInteger(winner.bestTrialIndex) ? winner.bestTrialIndex : (matchingRun && Number.isInteger(matchingRun.bestTrialIndex) ? matchingRun.bestTrialIndex : null),
    runFolderName: winner.runFolderName || (matchingRun ? matchingRun.runFolderName || null : null),
    artifactFileName: winner.artifactFileName || (matchingRun ? matchingRun.artifactFileName || null : null),
    invocationMode: matchingRun ? matchingRun.invocationMode || null : null,
    scorerFingerprint: winner.scorerFingerprint || (matchingRun ? matchingRun.scorerFingerprint || null : null),
    scorerFingerprintShort: winner.scorerFingerprintShort || (matchingRun ? matchingRun.scorerFingerprintShort || null : null),
    scorerFingerprintVersion: winner.scorerFingerprintVersion || (matchingRun ? matchingRun.scorerFingerprintVersion || null : null),
    scorerSource: winner.scorerSource || (matchingRun ? matchingRun.scorerSource || null : null)
  };
}

function updateStateFromReport(stateInput, report, statusValue) {
  const state = validateCampaignState(JSON.parse(JSON.stringify(stateInput)));
  const summary = report && report.summary ? report.summary : {};
  const winner = extractWinnerFromReport(report);

  state.status = statusValue || CAMPAIGN_STATUSES.RUNNING;
  state.completedRunCount = Number.isInteger(summary.completedCount) ? summary.completedCount : state.completedRunCount;
  state.okCount = Number.isInteger(summary.okCount) ? summary.okCount : state.okCount;
  state.failedCount = Number.isInteger(summary.failedCount) ? summary.failedCount : state.failedCount;
  state.lastUpdated = new Date().toISOString();

  if (winner) {
    state.currentBestRun = winner;
  }

  return validateCampaignState(state);
}

function parseMaybeJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return null;
  }
}

async function runCampaign(input) {
  const config = normalizeConfig(input);
  ensureDir(config.campaignDir);

  const statusFilePath = buildStatusFilePath(config.campaignDir);
  const campaignReportPath = path.join(config.campaignDir, 'benchmark_campaign_report_v1.json');

  let state = createInitialCampaignState({
    campaignId: config.campaignId,
    campaignFolderName: config.campaignFolderName,
    batchLabel: config.campaignBatchLabel,
    snapshotFileName: config.snapshotFileName,
    snapshotFileSha256: config.snapshotFileSha256,
    baseSeed: config.baseSeed,
    plannedRunCount: config.campaignTrialCounts.length * config.campaignRepeats,
    startedAt: new Date().toISOString()
  });
  writeCampaignStatusFile(statusFilePath, state);

  state = validateCampaignState({
    ...state,
    baseSeed: config.baseSeed,
    status: CAMPAIGN_STATUSES.RUNNING,
    lastUpdated: new Date().toISOString()
  });
  writeCampaignStatusFile(statusFilePath, state);

  const launcherArgs = buildLauncherArgs(config);
  const child = spawn(process.execPath, launcherArgs, {
    cwd: path.resolve(path.join(__dirname, '..')),
    env: config.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let lastReportMtimeMs = 0;

  const refreshTimer = setInterval(() => {
    try {
      if (!fs.existsSync(campaignReportPath)) {
        return;
      }
      const stat = fs.statSync(campaignReportPath);
      if (!stat.mtimeMs || stat.mtimeMs <= lastReportMtimeMs) {
        return;
      }
      lastReportMtimeMs = stat.mtimeMs;
      const report = readCampaignReport(campaignReportPath);
      if (!report) {
        return;
      }
      state = updateStateFromReport(state, report, CAMPAIGN_STATUSES.RUNNING);
      writeCampaignStatusFile(statusFilePath, state);
    } catch (error) {
      // swallow polling errors; final process result will determine campaign status
    }
  }, Math.max(1000, config.statusPollIntervalMs));

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const result = await new Promise((resolve) => {
    child.on('error', (error) => resolve({ error }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  clearInterval(refreshTimer);

  const report = readCampaignReport(campaignReportPath);
  const parsedStdout = parseMaybeJson(stdout);
  const parsedStderr = parseMaybeJson(stderr);

  if (report) {
    state = updateStateFromReport(state, report, CAMPAIGN_STATUSES.RUNNING);
  }

  if (result.error || result.code !== 0) {
    const errorMessage = result.error
      ? (result.error.message || String(result.error))
      : (parsedStderr && parsedStderr.message ? parsedStderr.message : `Launcher exited with code ${String(result.code)}.`);

    state = markCampaignFailed(state, {
      errorMessage,
      failedAt: new Date().toISOString()
    });
    writeCampaignStatusFile(statusFilePath, state);

    return {
      ok: false,
      campaignId: state.campaignId,
      campaignFolderName: state.campaignFolderName,
      status: state.status,
      plannedRunCount: state.plannedRunCount,
      completedRunCount: state.completedRunCount,
      currentBestRunId: state.currentBestRun ? state.currentBestRun.runId : null,
      currentBestScore: state.currentBestRun ? state.currentBestRun.bestScore : null,
      baseSeed: config.baseSeed,
      campaignDir: config.campaignDir,
      campaignReportPath: fs.existsSync(campaignReportPath) ? campaignReportPath : null,
      statusFilePath,
      errorMessage,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null
    };
  }

  state = markCampaignComplete(state, {
    completedAt: new Date().toISOString()
  });
  writeCampaignStatusFile(statusFilePath, state);

  return {
    ok: true,
    campaignId: state.campaignId,
    campaignFolderName: state.campaignFolderName,
    status: state.status,
    plannedRunCount: state.plannedRunCount,
    completedRunCount: state.completedRunCount,
    currentBestRunId: state.currentBestRun ? state.currentBestRun.runId : null,
    currentBestScore: state.currentBestRun ? state.currentBestRun.bestScore : null,
    baseSeed: config.baseSeed,
    campaignDir: config.campaignDir,
    campaignReportPath: fs.existsSync(campaignReportPath) ? campaignReportPath : null,
    statusFilePath,
    launcherSummary: parsedStdout,
    campaignStatusSummary: buildCampaignStatusSummary(state)
  };
}

module.exports = {
  DEFAULT_LADDER,
  buildCampaignDir: (input) => normalizeConfig(input).campaignDir,
  buildCampaignFolderName,
  buildLauncherArgs,
  buildStatusFilePath,
  normalizeConfig,
  readCampaignReport,
  runCampaign,
  updateStateFromReport,
  writeCampaignStatusFile
};
