'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { runCampaign } = require('./run_campaign');
const { downloadSnapshotFromDrive } = require('./drive_snapshot');

const activeCampaigns = new Map();

function getRequiredEnv(name, ...aliases) {
  const keys = [name].concat(aliases || []);
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

function getOptionalEnv(name, ...aliases) {
  const keys = [name].concat(aliases || []);
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getOptionalPositiveIntegerEnv(defaultValue, name, ...aliases) {
  const raw = getOptionalEnv(name, ...aliases);
  if (raw == null) {
    return defaultValue;
  }
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return numeric;
}

function ensureExistingFile(filePath, label) {
  const resolved = path.resolve(String(filePath || '').trim());
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved || String(filePath || '')}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${resolved}`);
  }
  return resolved;
}

function getServerConfig() {
  const portValue = process.env.PORT || '8080';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portValue}`);
  }

  const authToken = getRequiredEnv(
    'BENCHMARK_ORCHESTRATOR_AUTH_TOKEN',
    'ORCHESTRATOR_AUTH_TOKEN'
  );

  const driveOAuthClientCredentialsFile = ensureExistingFile(
    getRequiredEnv(
      'BENCHMARK_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE',
      'DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE'
    ),
    'Drive OAuth client credentials file'
  );

  const driveOAuthTokenFile = ensureExistingFile(
    getRequiredEnv(
      'BENCHMARK_DRIVE_OAUTH_TOKEN_FILE',
      'DRIVE_OAUTH_TOKEN_FILE'
    ),
    'Drive OAuth token file'
  );

  const outputRootDir = path.resolve(
    getOptionalEnv('BENCHMARK_ORCHESTRATOR_OUTPUT_ROOT', 'ORCHESTRATOR_OUTPUT_ROOT') ||
    path.join(process.cwd(), 'tmp', 'phase14_campaigns')
  );

  return {
    port,
    authToken,
    maxBodyBytes: 1024 * 1024,
    workerUrl: getRequiredEnv('BENCHMARK_WORKER_URL', 'WORKER_URL'),
    workerToken: getRequiredEnv(
      'BENCHMARK_WORKER_AUTH_TOKEN',
      'BENCHMARK_WORKER_TOKEN',
      'WORKER_AUTH_TOKEN',
      'WORKER_TOKEN'
    ),
    driveOAuthClientCredentialsFile,
    driveOAuthTokenFile,
    driveRootFolderId: getRequiredEnv('BENCHMARK_DRIVE_ROOT_FOLDER_ID', 'DRIVE_ROOT_FOLDER_ID'),
    driveBenchmarkRunsFolderId: getRequiredEnv(
      'BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_ID',
      'DRIVE_BENCHMARK_RUNS_FOLDER_ID'
    ),
    driveBenchmarkRunsFolderName: getOptionalEnv(
      'BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_NAME',
      'DRIVE_BENCHMARK_RUNS_FOLDER_NAME'
    ),
    outputRootDir,
    chunkTrials: getOptionalPositiveIntegerEnv(1000, 'BENCHMARK_ORCHESTRATOR_CHUNK_TRIALS', 'ORCHESTRATOR_CHUNK_TRIALS'),
    topN: getOptionalPositiveIntegerEnv(10, 'BENCHMARK_ORCHESTRATOR_TOP_N', 'ORCHESTRATOR_TOP_N'),
    requestTimeoutMs: getOptionalPositiveIntegerEnv(600000, 'BENCHMARK_ORCHESTRATOR_REQUEST_TIMEOUT_MS', 'ORCHESTRATOR_REQUEST_TIMEOUT_MS'),
    statusPollIntervalMs: getOptionalPositiveIntegerEnv(2000, 'BENCHMARK_ORCHESTRATOR_STATUS_POLL_INTERVAL_MS', 'ORCHESTRATOR_STATUS_POLL_INTERVAL_MS')
  };
}

function sendJson(res, statusCode, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text, 'utf8')
  });
  res.end(text);
}

function parseBearerToken(header) {
  if (typeof header !== 'string' || !header.trim()) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function authorizeRequest(req, config) {
  if (!config.authToken) {
    return {
      ok: false,
      statusCode: 500,
      body: { ok: false, error: 'Orchestrator auth token is not configured.' }
    };
  }

  const provided = parseBearerToken(req.headers.authorization);
  if (!provided) {
    return {
      ok: false,
      statusCode: 401,
      body: { ok: false, error: 'Missing Bearer token.' }
    };
  }

  if (provided !== config.authToken) {
    return {
      ok: false,
      statusCode: 401,
      body: { ok: false, error: 'Invalid Bearer token.' }
    };
  }

  return { ok: true };
}

function readJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        reject(new Error(`Request body exceeds max size of ${maxBodyBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) {
        resolve({ ok: false, error: 'Request body is empty.' });
        return;
      }

      try {
        resolve({ ok: true, value: JSON.parse(text) });
      } catch (error) {
        resolve({ ok: false, error: error && error.message ? error.message : 'Invalid JSON body.' });
      }
    });

    req.on('error', reject);
  });
}

function fileSha256OrNull(filePath) {
  try {
    const bytes = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  } catch (_error) {
    return null;
  }
}

function getCampaignDir(config, campaignFolderName) {
  return path.join(config.outputRootDir, campaignFolderName);
}

function getCampaignStatusFilePath(config, campaignFolderName) {
  return path.join(
    getCampaignDir(config, campaignFolderName),
    'benchmark_campaign_status_v1.json'
  );
}

function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function applyStatusSummaryToEntry(entry, summary) {
  if (!entry || !summary) {
    return entry;
  }
  entry.batchLabel = summary.batchLabel || entry.batchLabel;
  entry.snapshotFileName = summary.snapshotFileName || entry.snapshotFileName;
  entry.snapshotFileSha256 = summary.snapshotFileSha256 || entry.snapshotFileSha256;
  entry.baseSeed = summary.baseSeed != null ? String(summary.baseSeed) : entry.baseSeed;
  entry.status = summary.status || entry.status;
  entry.plannedRunCount = summary.plannedRunCount != null ? summary.plannedRunCount : entry.plannedRunCount;
  entry.completedRunCount = summary.completedRunCount != null ? summary.completedRunCount : entry.completedRunCount;
  entry.okCount = summary.okCount != null ? summary.okCount : entry.okCount;
  entry.failedCount = summary.failedCount != null ? summary.failedCount : entry.failedCount;
  entry.currentBestRunId = summary.currentBestRunId;
  entry.currentBestScore = summary.currentBestScore;
  entry.currentBestTrialCount = summary.currentBestTrialCount;
  entry.currentBestRepeatIndex = summary.currentBestRepeatIndex;
  entry.lastUpdated = summary.lastUpdated || entry.lastUpdated;
  entry.completedAt = summary.completedAt || entry.completedAt;
  entry.errorMessage = summary.errorMessage || null;
  return entry;
}

function buildCampaignFolderName(batchLabel, snapshotSha256, startedAtIso) {
  const startedAt = new Date(startedAtIso);
  const parts = [
    String(startedAt.getUTCFullYear()).padStart(4, '0'),
    String(startedAt.getUTCMonth() + 1).padStart(2, '0'),
    String(startedAt.getUTCDate()).padStart(2, '0'),
    '_',
    String(startedAt.getUTCHours()).padStart(2, '0'),
    String(startedAt.getUTCMinutes()).padStart(2, '0'),
    String(startedAt.getUTCSeconds()).padStart(2, '0')
  ];
  const stamp = parts.join('');
  const safeBatch = (batchLabel || 'campaign').replace(/[^A-Za-z0-9._-]+/g, '_');
  const snap = snapshotSha256 ? snapshotSha256.slice(0, 8) : 'unknown';
  return `${stamp}__batch-${safeBatch}__snap-${snap}`;
}

function flattenStatusLikeObject(obj) {
  const best = obj && obj.currentBestRun ? obj.currentBestRun : {};
  return {
    ok: true,
    contractVersion: obj && obj.contractVersion ? obj.contractVersion : 'benchmark_campaign_status_v1',
    campaignId: obj && obj.campaignId ? obj.campaignId : null,
    campaignFolderName: obj && obj.campaignFolderName ? obj.campaignFolderName : null,
    batchLabel: obj && obj.batchLabel ? obj.batchLabel : null,
    snapshotFileName: obj && obj.snapshotFileName ? obj.snapshotFileName : null,
    snapshotFileSha256: obj && obj.snapshotFileSha256 ? obj.snapshotFileSha256 : null,
    baseSeed: obj && obj.baseSeed != null ? String(obj.baseSeed) : null,
    status: obj && obj.status ? obj.status : null,
    plannedRunCount: obj && obj.plannedRunCount != null ? obj.plannedRunCount : null,
    completedRunCount: obj && obj.completedRunCount != null ? obj.completedRunCount : null,
    okCount: obj && obj.okCount != null ? obj.okCount : null,
    failedCount: obj && obj.failedCount != null ? obj.failedCount : null,
    currentBestRunId: obj && obj.currentBestRunId != null ? obj.currentBestRunId : (best.runId != null ? best.runId : null),
    currentBestScore: obj && obj.currentBestScore != null ? obj.currentBestScore : (best.bestScore != null ? best.bestScore : null),
    currentBestTrialCount: obj && obj.currentBestTrialCount != null ? obj.currentBestTrialCount : (best.trialCount != null ? best.trialCount : null),
    currentBestRepeatIndex: obj && obj.currentBestRepeatIndex != null ? obj.currentBestRepeatIndex : (best.repeatIndex != null ? best.repeatIndex : null),
    lastUpdated: obj && obj.lastUpdated ? obj.lastUpdated : null,
    completedAt: obj && obj.completedAt ? obj.completedAt : null,
    errorMessage: obj && obj.errorMessage ? obj.errorMessage : null,
    startedAt: obj && obj.startedAt ? obj.startedAt : null
  };
}

function flattenStartResult(entry) {
  return flattenStatusLikeObject({
    contractVersion: 'benchmark_campaign_status_v1',
    campaignId: entry.campaignId,
    campaignFolderName: entry.campaignFolderName,
    batchLabel: entry.batchLabel,
    snapshotFileName: entry.snapshotFileName,
    snapshotFileSha256: entry.snapshotFileSha256,
    baseSeed: entry.baseSeed,
    status: entry.status,
    plannedRunCount: entry.plannedRunCount,
    completedRunCount: entry.completedRunCount,
    okCount: entry.okCount,
    failedCount: entry.failedCount,
    currentBestRunId: entry.currentBestRunId,
    currentBestScore: entry.currentBestScore,
    currentBestTrialCount: entry.currentBestTrialCount,
    currentBestRepeatIndex: entry.currentBestRepeatIndex,
    lastUpdated: entry.lastUpdated,
    completedAt: entry.completedAt,
    errorMessage: entry.errorMessage,
    startedAt: entry.startedAt
  });
}

function validatePositiveInteger(value, name) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numeric;
}

function validateTrialCounts(value) {
  if (!Array.isArray(value) || value.length <= 0) {
    throw new Error('campaignTrialCounts must be a non-empty array.');
  }

  return value.map((entry) => validatePositiveInteger(entry, 'campaignTrialCounts'));
}

function validateOptionalIntegerOrNull(value, name) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw new Error(`${name} must be an integer when provided.`);
  }
  return numeric;
}

function validateRequiredTrimmedString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function validateCampaignStartBody(body) {
  const source = body && typeof body === 'object' ? body : {};
  const snapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : null;
  if (!snapshot) {
    throw new Error('snapshot is required.');
  }

  const campaignTrialCounts = validateTrialCounts(source.campaignTrialCounts);
  const campaignRepeats = validatePositiveInteger(source.campaignRepeats, 'campaignRepeats');
  const snapshotFileId = validateRequiredTrimmedString(snapshot.fileId, 'snapshot.fileId');
  const snapshotFileName = typeof snapshot.fileName === 'string' && snapshot.fileName.trim()
    ? snapshot.fileName.trim()
    : null;
  const snapshotContractVersion = typeof snapshot.contractVersion === 'string' && snapshot.contractVersion.trim()
    ? snapshot.contractVersion.trim()
    : null;
  const snapshotExportedAtIso = typeof snapshot.exportedAtIso === 'string' && snapshot.exportedAtIso.trim()
    ? snapshot.exportedAtIso.trim()
    : null;
  const snapshotFileSha256 = typeof snapshot.fileSha256 === 'string' && snapshot.fileSha256.trim()
    ? snapshot.fileSha256.trim()
    : null;

  return {
    campaignTrialCounts,
    campaignRepeats,
    campaignBatchLabel: typeof source.campaignBatchLabel === 'string' && source.campaignBatchLabel.trim()
      ? source.campaignBatchLabel.trim()
      : 'benchmark_campaign',
    baseSeed: validatePositiveInteger(source.baseSeed, 'baseSeed'),
    campaignId: typeof source.campaignId === 'string' && source.campaignId.trim()
      ? source.campaignId.trim()
      : null,
    snapshot: {
      fileId: snapshotFileId,
      fileName: snapshotFileName,
      contractVersion: snapshotContractVersion,
      exportedAtIso: snapshotExportedAtIso,
      fileSha256: snapshotFileSha256
    }
  };
}

async function handleHealthz(req, res) {
  sendJson(res, 200, {
    ok: true,
    service: 'benchmark-orchestrator',
    time: new Date().toISOString()
  });
}

async function handleCampaignStart(req, res, config) {
  const auth = authorizeRequest(req, config);
  if (!auth.ok) {
    sendJson(res, auth.statusCode, auth.body);
    return;
  }

  const parsed = await readJsonBody(req, config.maxBodyBytes);
  if (!parsed.ok) {
    sendJson(res, 400, { ok: false, error: parsed.error });
    return;
  }

  let request;
  try {
    request = validateCampaignStartBody(parsed.value || {});
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error && error.message ? error.message : 'Invalid campaign start request.'
    });
    return;
  }

  const startedAt = new Date().toISOString();
  const campaignId = request.campaignId || `campaign-${Date.now()}`;
  const snapshotDownloadOutputDir = path.join(config.outputRootDir, '_downloads', campaignId);

  const downloadedSnapshot = await downloadSnapshotFromDrive({
    fileId: request.snapshot.fileId,
    outputDir: snapshotDownloadOutputDir,
    fileNameHint: request.snapshot.fileName,
    config: {
      driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile,
      driveOAuthTokenFile: config.driveOAuthTokenFile
    }
  });

  const snapshotSha256 = downloadedSnapshot.sha256 || request.snapshot.fileSha256 || fileSha256OrNull(downloadedSnapshot.localPath);
  const campaignFolderName = buildCampaignFolderName(request.campaignBatchLabel, snapshotSha256, startedAt);
  const plannedRunCount = request.campaignTrialCounts.length * request.campaignRepeats;

  const entry = {
    campaignId,
    campaignFolderName,
    batchLabel: request.campaignBatchLabel,
    snapshotFileName: downloadedSnapshot.fileName,
    snapshotFileSha256: snapshotSha256,
    baseSeed: request.baseSeed == null ? null : String(request.baseSeed),
    status: 'PENDING',
    plannedRunCount,
    completedRunCount: null,
    okCount: null,
    failedCount: null,
    currentBestRunId: null,
    currentBestScore: null,
    currentBestTrialCount: null,
    currentBestRepeatIndex: null,
    lastUpdated: null,
    completedAt: null,
    errorMessage: null,
    startedAt,
    runPromise: null
  };

  activeCampaigns.set(campaignId, entry);

  const runConfig = {
    campaignId,
    campaignFolderName,
    campaignBatchLabel: request.campaignBatchLabel,
    campaignTrialCounts: request.campaignTrialCounts,
    campaignRepeats: request.campaignRepeats,
    baseSeed: request.baseSeed == null ? null : String(request.baseSeed),
    snapshotPath: downloadedSnapshot.localPath,
    snapshotFileName: downloadedSnapshot.fileName,
    snapshotFileSha256: snapshotSha256,
    workerUrl: config.workerUrl,
    workerToken: config.workerToken,
    outputRootDir: config.outputRootDir,
    chunkTrials: config.chunkTrials,
    topN: config.topN,
    requestTimeoutMs: config.requestTimeoutMs,
    statusPollIntervalMs: config.statusPollIntervalMs,
    uploadToDrive: true,
    driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile,
    driveOAuthTokenFile: config.driveOAuthTokenFile,
    driveRootFolderId: config.driveRootFolderId,
    driveBenchmarkRunsFolderId: config.driveBenchmarkRunsFolderId,
    driveBenchmarkRunsFolderName: config.driveBenchmarkRunsFolderName
  };

  entry.runPromise = runCampaign(runConfig)
    .then((result) => {
      entry.status = result.status || 'COMPLETE';
      entry.campaignFolderName = result.campaignFolderName || entry.campaignFolderName;
      entry.completedRunCount = result.completedRunCount != null ? result.completedRunCount : entry.completedRunCount;
      entry.plannedRunCount = result.plannedRunCount != null ? result.plannedRunCount : entry.plannedRunCount;
      entry.baseSeed = result.baseSeed != null ? String(result.baseSeed) : entry.baseSeed;
      entry.lastUpdated = new Date().toISOString();
      entry.completedAt = entry.lastUpdated;
      if (result.campaignStatusSummary) {
        const summary = flattenStatusLikeObject(result.campaignStatusSummary);
        applyStatusSummaryToEntry(entry, summary);
      }

      const statusFilePath = getCampaignStatusFilePath(config, entry.campaignFolderName);
      const persistedStatus = readJsonFileIfExists(statusFilePath);
      if (persistedStatus && persistedStatus.campaignId === campaignId) {
        const summary = flattenStatusLikeObject(persistedStatus);
        applyStatusSummaryToEntry(entry, summary);
      }

      return result;
    })
    .catch((error) => {
      entry.status = 'FAILED';
      entry.lastUpdated = new Date().toISOString();
      entry.completedAt = entry.lastUpdated;
      entry.errorMessage = error && error.message ? error.message : String(error);
    });

  sendJson(res, 202, flattenStartResult(entry));
}

async function handleCampaignStatus(req, res, config) {
  const auth = authorizeRequest(req, config);
  if (!auth.ok) {
    sendJson(res, auth.statusCode, auth.body);
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const campaignId = url.searchParams.get('campaignId');
  if (!campaignId) {
    sendJson(res, 400, { ok: false, error: 'campaignId is required.' });
    return;
  }

  const entry = activeCampaigns.get(campaignId);
  if (!entry) {
    sendJson(res, 404, { ok: false, error: 'Campaign not found.' });
    return;
  }

  const statusFilePath = getCampaignStatusFilePath(config, entry.campaignFolderName);
  const persistedStatus = readJsonFileIfExists(statusFilePath);

  if (persistedStatus && persistedStatus.campaignId === campaignId) {
    const summary = flattenStatusLikeObject(persistedStatus);
    applyStatusSummaryToEntry(entry, summary);
    sendJson(res, 200, summary);
    return;
  }

  sendJson(res, 200, flattenStartResult(entry));
}

function createServer(config) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/healthz') {
        await handleHealthz(req, res);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/campaigns/start') {
        await handleCampaignStart(req, res, config);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/campaigns/status') {
        await handleCampaignStatus(req, res, config);
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error && error.message ? error.message : 'Unhandled orchestrator error.'
      });
    }
  });
}

function startServer() {
  const config = getServerConfig();
  const server = createServer(config);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(config.port, () => {
      resolve({ ok: true, port: config.port, server });
    });
  });
}

module.exports = {
  startServer,
  createServer,
  getServerConfig
};

if (require.main === module) {
  startServer()
    .then(({ port }) => {
      console.log(JSON.stringify({
        ok: true,
        service: 'benchmark-orchestrator',
        port
      }, null, 2));
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exit(1);
    });
}
