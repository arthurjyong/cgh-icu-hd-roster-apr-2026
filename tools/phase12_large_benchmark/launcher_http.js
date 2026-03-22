'use strict';

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildChunkRequestBody(snapshot, chunk) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('snapshot must be an object.');
  }

  if (!chunk || typeof chunk !== 'object') {
    throw new Error('chunk is required.');
  }

  const requestBody = deepCloneJson(snapshot);

  if (!requestBody.trialSpec || typeof requestBody.trialSpec !== 'object') {
    requestBody.trialSpec = {};
  }

  requestBody.trialSpec.trialCount = chunk.trialCount;
  requestBody.trialSpec.seed = chunk.chunkSeed;

  return requestBody;
}

function buildWorkerRunUrl(workerUrl) {
  return `${String(workerUrl).replace(/\/+$/, '')}/run-random-trials`;
}

async function readJsonResponseBody(response) {
  const rawText = await response.text();

  if (!rawText) {
    return {
      ok: false,
      rawText,
      message: 'Worker response body is empty.'
    };
  }

  try {
    return {
      ok: true,
      rawText,
      value: JSON.parse(rawText)
    };
  } catch (error) {
    return {
      ok: false,
      rawText,
      message: 'Worker response body is not valid JSON.',
      parseError: error && error.message ? error.message : String(error)
    };
  }
}

function extractFailureMessageFromBody(body, fallbackMessage) {
  if (body && typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }

  return fallbackMessage || 'Worker request failed.';
}

async function runWorkerChunk(options) {
  const source = options || {};
  const config = source.config || {};
  const snapshot = source.snapshot;
  const chunk = source.chunk;
  const runtimeGateway = source.runtimeGateway;

  if (!runtimeGateway || typeof runtimeGateway.validateRequest !== 'function') {
    throw new Error('runtimeGateway.validateRequest is required.');
  }

  if (typeof runtimeGateway.validateTransportResult !== 'function') {
    throw new Error('runtimeGateway.validateTransportResult is required.');
  }

  const requestBody = buildChunkRequestBody(snapshot, chunk);
  const requestValidation = runtimeGateway.validateRequest(requestBody);

  if (!requestValidation || requestValidation.ok !== true) {
    return {
      ok: false,
      stage: 'validate_request',
      chunk,
      message: requestValidation && requestValidation.message
        ? requestValidation.message
        : 'Chunk request body failed validation.',
      requestValidation: requestValidation || null
    };
  }

  const url = buildWorkerRunUrl(config.workerUrl);
  const controller = new AbortController();
  const timeoutMs = typeof config.requestTimeoutMs === 'number'
    ? config.requestTimeoutMs
    : 600000;

  const startedAt = new Date();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Worker request timed out after ${timeoutMs} ms.`));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.workerToken}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    return {
      ok: false,
      stage: 'fetch',
      chunk,
      message: error && error.message ? error.message : 'Worker request failed.',
      workerUrl: url
    };
  }

  clearTimeout(timeoutHandle);

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const parsedResponse = await readJsonResponseBody(response);

  if (!response.ok) {
    return {
      ok: false,
      stage: 'http_status',
      chunk,
      statusCode: response.status,
      durationMs,
      workerUrl: url,
      message: parsedResponse.ok
        ? extractFailureMessageFromBody(parsedResponse.value, `Worker returned HTTP ${response.status}.`)
        : `Worker returned HTTP ${response.status}.`,
      responseBody: parsedResponse.ok ? parsedResponse.value : null,
      responseParse: parsedResponse.ok ? null : parsedResponse
    };
  }

  if (!parsedResponse.ok) {
    return {
      ok: false,
      stage: 'parse_response_json',
      chunk,
      statusCode: response.status,
      durationMs,
      workerUrl: url,
      message: parsedResponse.message || 'Worker response body could not be parsed as JSON.',
      responseParse: parsedResponse
    };
  }

  const transportResult = parsedResponse.value;
  const transportValidation = runtimeGateway.validateTransportResult(transportResult);

  if (!transportValidation || transportValidation.ok !== true) {
    return {
      ok: false,
      stage: 'validate_transport_response',
      chunk,
      statusCode: response.status,
      durationMs,
      workerUrl: url,
      message: transportResult && transportResult.ok === false
        ? extractFailureMessageFromBody(transportResult, 'Worker returned a non-ok transport response.')
        : (transportValidation && transportValidation.message
            ? transportValidation.message
            : 'Worker returned an invalid transport response.'),
      responseBody: transportResult,
      responseValidation: transportValidation || null
    };
  }

  return {
    ok: true,
    stage: 'completed',
    chunk,
    workerUrl: url,
    statusCode: response.status,
    durationMs,
    startedAtIso: startedAt.toISOString(),
    completedAtIso: completedAt.toISOString(),
    requestValidation,
    responseValidation: transportValidation,
    requestBody,
    transportResult
  };
}

module.exports = {
  buildChunkRequestBody,
  buildWorkerRunUrl,
  readJsonResponseBody,
  runWorkerChunk
};
