'use strict';

const path = require('path');

function parseCliArgs(argv) {
  const result = {};
  const args = Array.isArray(argv) ? argv.slice() : [];

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    if (typeof token !== 'string' || !token.startsWith('--')) {
      continue;
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex >= 0) {
      const key = token.slice(2, eqIndex).trim();
      const value = token.slice(eqIndex + 1);
      result[key] = value;
      continue;
    }

    const key = token.slice(2).trim();
    const next = i + 1 < args.length ? args[i + 1] : undefined;

    if (typeof next === 'string' && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = 'true';
    }
  }

  return result;
}

function firstNonEmptyString(values) {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function parseRequiredPositiveInteger(rawValue, fieldName) {
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer. Received: ${rawValue}`);
  }

  return value;
}

function parseOptionalPositiveInteger(rawValue, fieldName, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }

  return parseRequiredPositiveInteger(rawValue, fieldName);
}

function parseBoolean(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Boolean value expected. Received: ${rawValue}`);
}

function parseWorkerUrl(rawValue) {
  let parsed;

  try {
    parsed = new URL(rawValue);
  } catch (error) {
    throw new Error(`workerUrl must be a valid URL. Received: ${rawValue}`);
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error(`workerUrl must use http or https. Received: ${rawValue}`);
  }

  return parsed.toString().replace(/\/+$/, '');
}

function maskToken(token) {
  if (typeof token !== 'string' || !token) {
    return '';
  }

  if (token.length <= 8) {
    return `${token.slice(0, 2)}***${token.slice(-2)}`;
  }

  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

function resolveDryRun(cliArgs, env) {
  if (Object.prototype.hasOwnProperty.call(cliArgs, 'execute')) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(cliArgs, 'dry-run')) {
    return parseBoolean(cliArgs['dry-run'], true);
  }

  if (Object.prototype.hasOwnProperty.call(env, 'PHASE12_DRY_RUN')) {
    return parseBoolean(env.PHASE12_DRY_RUN, true);
  }

  if (Object.prototype.hasOwnProperty.call(env, 'PHASE12_EXECUTE')) {
    return !parseBoolean(env.PHASE12_EXECUTE, false);
  }

  return true;
}

function resolveResume(cliArgs, env) {
  if (Object.prototype.hasOwnProperty.call(cliArgs, 'resume')) {
    return parseBoolean(cliArgs.resume, true);
  }

  if (Object.prototype.hasOwnProperty.call(env, 'PHASE12_RESUME')) {
    return parseBoolean(env.PHASE12_RESUME, false);
  }

  return false;
}

function buildLauncherConfig(options) {
  const source = options || {};
  const cliArgs = parseCliArgs(source.argv || []);
  const env = source.env || process.env;

  const snapshotPathRaw = firstNonEmptyString([
    cliArgs.snapshot,
    env.PHASE12_SNAPSHOT_PATH
  ]);

  const workerUrlRaw = firstNonEmptyString([
    cliArgs['worker-url'],
    env.PHASE12_WORKER_URL
  ]);

  const workerTokenRaw = firstNonEmptyString([
    cliArgs['worker-token'],
    env.PHASE12_WORKER_TOKEN
  ]);

  const totalTrialsRaw = firstNonEmptyString([
    cliArgs['total-trials'],
    env.PHASE12_TOTAL_TRIALS
  ]);

  const chunkTrialsRaw = firstNonEmptyString([
    cliArgs['chunk-trials'],
    env.PHASE12_CHUNK_TRIALS
  ]);

  const baseSeedRaw = firstNonEmptyString([
    cliArgs['base-seed'],
    env.PHASE12_BASE_SEED
  ]);

  const topNRaw = firstNonEmptyString([
    cliArgs['top-n'],
    env.PHASE12_TOP_N,
    '10'
  ]);

  const printChunksRaw = firstNonEmptyString([
    cliArgs['print-chunks'],
    env.PHASE12_PRINT_CHUNKS,
    'true'
  ]);

  const outputRootDirRaw = firstNonEmptyString([
    cliArgs['output-root-dir'],
    env.PHASE12_OUTPUT_ROOT_DIR,
    path.join(process.cwd(), 'tmp', 'phase12_runs')
  ]);

  const requestTimeoutMsRaw = firstNonEmptyString([
    cliArgs['request-timeout-ms'],
    env.PHASE12_REQUEST_TIMEOUT_MS,
    '600000'
  ]);

  const failFastRaw = firstNonEmptyString([
    cliArgs['fail-fast'],
    env.PHASE12_FAIL_FAST,
    'true'
  ]);

  const saveChunkResponsesRaw = firstNonEmptyString([
    cliArgs['save-chunk-responses'],
    env.PHASE12_SAVE_CHUNK_RESPONSES,
    'false'
  ]);

  const runDirRaw = firstNonEmptyString([
    cliArgs['run-dir'],
    env.PHASE12_RUN_DIR
  ]);

  const uploadToDriveRaw = firstNonEmptyString([
    cliArgs['upload-to-drive'],
    env.PHASE12_UPLOAD_TO_DRIVE,
    'false'
  ]);

  const driveOAuthClientCredentialsFileRaw = firstNonEmptyString([
    cliArgs['drive-oauth-client-credentials-file'],
    env.PHASE12_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE
  ]);

  const driveOAuthTokenFileRaw = firstNonEmptyString([
    cliArgs['drive-oauth-token-file'],
    env.PHASE12_DRIVE_OAUTH_TOKEN_FILE,
    path.join(process.cwd(), 'tmp', 'phase12_drive_oauth_token.json')
  ]);

  const driveRootFolderIdRaw = firstNonEmptyString([
    cliArgs['drive-root-folder-id'],
    env.PHASE12_DRIVE_ROOT_FOLDER_ID
  ]);

  const driveBenchmarkRunsFolderIdRaw = firstNonEmptyString([
    cliArgs['drive-benchmark-runs-folder-id'],
    env.PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_ID
  ]);

  const driveBenchmarkRunsFolderNameRaw = firstNonEmptyString([
    cliArgs['drive-benchmark-runs-folder-name'],
    env.PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_NAME,
    'benchmark_runs'
  ]);

  if (!snapshotPathRaw) {
    throw new Error('snapshot path is required. Use --snapshot or PHASE12_SNAPSHOT_PATH.');
  }

  if (!workerUrlRaw) {
    throw new Error('worker URL is required. Use --worker-url or PHASE12_WORKER_URL.');
  }

  if (!workerTokenRaw) {
    throw new Error('worker token is required. Use --worker-token or PHASE12_WORKER_TOKEN.');
  }

  if (!totalTrialsRaw) {
    throw new Error('totalTrials is required. Use --total-trials or PHASE12_TOTAL_TRIALS.');
  }

  if (!chunkTrialsRaw) {
    throw new Error('chunkTrials is required. Use --chunk-trials or PHASE12_CHUNK_TRIALS.');
  }

  if (!baseSeedRaw) {
    throw new Error('baseSeed is required. Use --base-seed or PHASE12_BASE_SEED.');
  }

  const totalTrials = parseRequiredPositiveInteger(totalTrialsRaw, 'totalTrials');
  const chunkTrials = parseRequiredPositiveInteger(chunkTrialsRaw, 'chunkTrials');
  const topN = parseRequiredPositiveInteger(topNRaw, 'topN');
  const requestTimeoutMs = parseOptionalPositiveInteger(requestTimeoutMsRaw, 'requestTimeoutMs', 600000);

  if (chunkTrials > totalTrials) {
    throw new Error(
      `chunkTrials must not exceed totalTrials. Received chunkTrials=${chunkTrials}, totalTrials=${totalTrials}`
    );
  }

  const dryRun = resolveDryRun(cliArgs, env);
  const resume = resolveResume(cliArgs, env);
  const printChunks = parseBoolean(printChunksRaw, true);
  const failFast = parseBoolean(failFastRaw, true);
  const saveChunkResponses = parseBoolean(saveChunkResponsesRaw, false);
  const uploadToDrive = parseBoolean(uploadToDriveRaw, false);
  const resolvedRunDir = runDirRaw ? path.resolve(runDirRaw) : null;

  if (resume && !resolvedRunDir) {
    throw new Error('runDir is required when --resume is used. Use --run-dir or PHASE12_RUN_DIR.');
  }

  const driveOAuthClientCredentialsFile = driveOAuthClientCredentialsFileRaw
    ? path.resolve(driveOAuthClientCredentialsFileRaw)
    : null;
  const driveOAuthTokenFile = driveOAuthTokenFileRaw
    ? path.resolve(driveOAuthTokenFileRaw)
    : null;

  if (uploadToDrive && !driveOAuthClientCredentialsFile) {
    throw new Error(
      'driveOAuthClientCredentialsFile is required when --upload-to-drive is enabled. ' +
      'Use --drive-oauth-client-credentials-file or PHASE12_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE.'
    );
  }

  if (uploadToDrive && !driveOAuthTokenFile) {
    throw new Error(
      'driveOAuthTokenFile is required when --upload-to-drive is enabled. ' +
      'Use --drive-oauth-token-file or PHASE12_DRIVE_OAUTH_TOKEN_FILE.'
    );
  }

  if (uploadToDrive && !driveRootFolderIdRaw) {
    throw new Error(
      'driveRootFolderId is required when --upload-to-drive is enabled. ' +
      'Use --drive-root-folder-id or PHASE12_DRIVE_ROOT_FOLDER_ID.'
    );
  }

  return {
    snapshotPath: path.resolve(snapshotPathRaw),
    workerUrl: parseWorkerUrl(workerUrlRaw),
    workerToken: workerTokenRaw,
    totalTrials,
    chunkTrials,
    baseSeed: String(baseSeedRaw),
    topN,
    dryRun,
    resume,
    runDir: resolvedRunDir,
    printChunks,
    outputRootDir: path.resolve(outputRootDirRaw),
    requestTimeoutMs,
    failFast,
    saveChunkResponses,
    uploadToDrive,
    driveOAuthClientCredentialsFile,
    driveOAuthTokenFile,
    driveRootFolderId: driveRootFolderIdRaw || null,
    driveBenchmarkRunsFolderId: driveBenchmarkRunsFolderIdRaw || null,
    driveBenchmarkRunsFolderName: driveBenchmarkRunsFolderNameRaw,
    display: {
      maskedWorkerToken: maskToken(workerTokenRaw)
    }
  };
}

module.exports = {
  buildLauncherConfig,
  maskToken,
  parseBoolean,
  parseCliArgs,
  parseOptionalPositiveInteger,
  parseRequiredPositiveInteger
};
