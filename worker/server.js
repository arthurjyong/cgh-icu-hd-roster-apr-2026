'use strict';

const http = require('http');
const path = require('path');
const { URL } = require('url');
const { loadPureComputeRuntime } = require('./load_pure_compute');

function getServerConfig() {
  const portValue = process.env.PORT || '8080';
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portValue}`);
  }

  const projectRootDirEnv = typeof process.env.TRIAL_COMPUTE_PROJECT_ROOT === 'string'
    ? process.env.TRIAL_COMPUTE_PROJECT_ROOT.trim()
    : '';

  return {
    port,
    token: typeof process.env.TRIAL_COMPUTE_EXTERNAL_TOKEN === 'string'
      ? process.env.TRIAL_COMPUTE_EXTERNAL_TOKEN.trim()
      : '',
    maxBodyBytes: 5 * 1024 * 1024,
    projectRootDir: projectRootDirEnv || path.resolve(__dirname, '..')
  };
}

function sendJson(res, statusCode, body) {
  const responseText = JSON.stringify(body, null, 2);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(responseText, 'utf8')
  });

  res.end(responseText);
}

function sendMethodNotAllowed(res, allowedMethods) {
  res.writeHead(405, {
    Allow: allowedMethods.join(', '),
    'Content-Type': 'application/json; charset=utf-8'
  });

  res.end(JSON.stringify({
    ok: false,
    message: 'Method not allowed.',
    allowedMethods
  }, null, 2));
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
        resolve({ ok: false, message: 'Request body is empty.' });
        return;
      }

      try {
        resolve({ ok: true, value: JSON.parse(text), rawText: text });
      } catch (error) {
        resolve({
          ok: false,
          message: 'Request body is not valid JSON.',
          parseError: error && error.message ? error.message : String(error)
        });
      }
    });

    req.on('error', reject);
  });
}

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string' || !authorizationHeader.trim()) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function authorizeRequest(req, config) {
  if (!config.token) {
    return {
      ok: false,
      statusCode: 500,
      body: {
        ok: false,
        message: 'Worker token is not configured.'
      }
    };
  }

  const providedToken = parseBearerToken(req.headers.authorization);
  if (!providedToken) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        ok: false,
        message: 'Missing Bearer token.'
      }
    };
  }

  if (providedToken !== config.token) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        ok: false,
        message: 'Invalid Bearer token.'
      }
    };
  }

  return { ok: true };
}

function buildWorkerInternalErrorBody(message, extraFields) {
  const body = {
    ok: false,
    message: message || 'Unhandled worker error.'
  };

  const extra = extraFields || {};
  Object.keys(extra).forEach((key) => {
    body[key] = extra[key];
  });

  return body;
}

function loadRuntimeOrThrow(config) {
  return loadPureComputeRuntime({
    projectRootDir: config.projectRootDir
  });
}

function buildComputeNotOkTransportResult(runtime, headlessResult) {
  const transportResult = runtime.buildTransportTrialResult_(headlessResult, {
    includeCandidatePoolsSummary: true,
    includeBestAllocation: true,
    includeBestScoring: false
  });

  transportResult.invocationMode = 'EXTERNAL_HTTP';
  transportResult.workerPhase = 'CHECKPOINT_C';
  return transportResult;
}

function buildSuccessTransportResult(runtime, headlessResult) {
  const transportResult = runtime.buildTransportTrialResult_(headlessResult, {
    includeCandidatePoolsSummary: true,
    includeBestAllocation: true,
    includeBestScoring: false
  });

  transportResult.invocationMode = 'EXTERNAL_HTTP';
  transportResult.workerPhase = 'CHECKPOINT_C';
  return transportResult;
}

async function handleHealthz(req, res, config) {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, ['GET']);
    return;
  }

  let runtimeStatus = {
    ok: false,
    loaded: false,
    message: 'Pure compute runtime not loaded yet.'
  };

  try {
    const runtime = loadRuntimeOrThrow(config);
    runtimeStatus = {
      ok: true,
      loaded: true,
      loadedFiles: runtime.loadedFiles,
      projectRootDir: runtime.rootDir
    };
  } catch (error) {
    runtimeStatus = {
      ok: false,
      loaded: false,
      message: error && error.message ? error.message : 'Failed to load pure compute runtime.'
    };
  }

  sendJson(res, 200, {
    ok: true,
    service: 'trial-compute-worker',
    phase: 'CHECKPOINT_C',
    message: 'Worker compute path is wired.',
    tokenConfigured: !!config.token,
    projectRootDir: config.projectRootDir,
    runtime: runtimeStatus,
    routes: {
      healthz: 'GET /healthz',
      runRandomTrials: 'POST /run-random-trials'
    }
  });
}

async function handleRunRandomTrials(req, res, config) {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  const auth = authorizeRequest(req, config);
  if (!auth.ok) {
    sendJson(res, auth.statusCode, auth.body);
    return;
  }

  let parsedBody;
  try {
    parsedBody = await readJsonBody(req, config.maxBodyBytes);
  } catch (error) {
    sendJson(res, 413, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to read request body.'
    });
    return;
  }

  if (!parsedBody.ok) {
    sendJson(res, 400, {
      ok: false,
      message: parsedBody.message,
      parseError: parsedBody.parseError || null
    });
    return;
  }

  if (!parsedBody.value || typeof parsedBody.value !== 'object' || Array.isArray(parsedBody.value)) {
    sendJson(res, 400, {
      ok: false,
      message: 'Request JSON must be an object.'
    });
    return;
  }

  let runtime;
  try {
    runtime = loadRuntimeOrThrow(config);
  } catch (error) {
    sendJson(res, 500, buildWorkerInternalErrorBody(
      'Failed to load pure compute runtime.',
      {
        workerPhase: 'CHECKPOINT_C',
        detail: error && error.message ? error.message : String(error)
      }
    ));
    return;
  }

  const requestValidation = runtime.validateTrialComputeRequest_(parsedBody.value);
  if (!requestValidation || requestValidation.ok !== true) {
    sendJson(res, 400, {
      ok: false,
      message: requestValidation && requestValidation.message
        ? requestValidation.message
        : 'Invalid compute request body.',
      requestValidation: requestValidation || null,
      workerPhase: 'CHECKPOINT_C'
    });
    return;
  }

  let headlessResult;
  try {
    headlessResult = runtime.runRandomTrialsHeadless_(parsedBody.value);
  } catch (error) {
    sendJson(res, 500, buildWorkerInternalErrorBody(
      'Headless compute threw an error.',
      {
        workerPhase: 'CHECKPOINT_C',
        detail: error && error.message ? error.message : String(error)
      }
    ));
    return;
  }

  if (!headlessResult || typeof headlessResult !== 'object' || Array.isArray(headlessResult)) {
    sendJson(res, 500, buildWorkerInternalErrorBody(
      'Headless compute returned an invalid result.',
      {
        workerPhase: 'CHECKPOINT_C'
      }
    ));
    return;
  }

  if (headlessResult.ok !== true) {
    sendJson(res, 200, buildComputeNotOkTransportResult(runtime, headlessResult));
    return;
  }

  const transportResult = buildSuccessTransportResult(runtime, headlessResult);
  const responseValidation = runtime.validateTransportTrialResult_(transportResult);

  if (!responseValidation || responseValidation.ok !== true) {
    sendJson(res, 500, buildWorkerInternalErrorBody(
      'Worker produced an invalid transport response body.',
      {
        workerPhase: 'CHECKPOINT_C',
        responseValidation: responseValidation || null
      }
    ));
    return;
  }

  sendJson(res, 200, transportResult);
}

function createServer(config) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/healthz') {
        await handleHealthz(req, res, config);
        return;
      }

      if (url.pathname === '/run-random-trials') {
        await handleRunRandomTrials(req, res, config);
        return;
      }

      sendJson(res, 404, {
        ok: false,
        message: 'Not found.',
        path: url.pathname
      });
    } catch (error) {
      sendJson(res, 500, buildWorkerInternalErrorBody(
        error && error.message ? error.message : 'Unhandled worker error.'
      ));
    }
  });
}

function startServer() {
  const config = getServerConfig();
  const server = createServer(config);

  server.listen(config.port, () => {
    console.log(JSON.stringify({
      ok: true,
      message: 'trial-compute-worker listening',
      port: config.port,
      phase: 'CHECKPOINT_C',
      tokenConfigured: !!config.token,
      projectRootDir: config.projectRootDir
    }));
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  authorizeRequest,
  buildComputeNotOkTransportResult,
  buildSuccessTransportResult,
  buildWorkerInternalErrorBody,
  createServer,
  getServerConfig,
  handleHealthz,
  handleRunRandomTrials,
  loadRuntimeOrThrow,
  parseBearerToken,
  readJsonBody,
  sendJson,
  startServer
};
