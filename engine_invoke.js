function cloneViaJsonTransport_(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function getSupportedTrialComputeInvocationModes_() {
  return [
    "LOCAL_DIRECT",
    "LOCAL_SIMULATED_EXTERNAL",
    "EXTERNAL_HTTP"
  ];
}

function normalizeTrialComputeInvocationOptions_(options) {
  const normalized = {};
  const source = options || {};
  const keys = Object.keys(source);

  for (let i = 0; i < keys.length; i++) {
    normalized[keys[i]] = source[keys[i]];
  }

  normalized.mode = normalized.mode || "LOCAL_SIMULATED_EXTERNAL";
  return normalized;
}

function buildInvalidComputeRequestResult_(requestBody, validation, mode) {
  return {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    invocationMode: mode || null,
    expectedRequestContractVersion: validation && validation.expectedContractVersion
      ? validation.expectedContractVersion
      : "compute_snapshot_v2",
    requestContractVersion: requestBody && requestBody.contractVersion
      ? requestBody.contractVersion
      : null,
    message: validation && validation.message
      ? validation.message
      : "Invalid compute request body.",
    requestValidation: validation || null
  };
}

function runLocalComputeWorkerFromRequest_(requestBody, options) {
  const requestValidation = validateTrialComputeRequest_(requestBody);
  if (requestValidation.ok !== true) {
    return buildInvalidComputeRequestResult_(requestBody, requestValidation, "LOCAL_SIMULATED_EXTERNAL");
  }

  const headlessResult = runRandomTrialsHeadless_(requestBody);
  return buildTransportTrialResult_(headlessResult, options);
}

function buildInvalidTransportResponseResult_(message, validation, extraFields) {
  const result = {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    message: message,
    responseValidation: validation || null
  };

  const extra = extraFields || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = extra[keys[i]];
  }

  return result;
}

function validateInboundTransportResultOrBuildError_(transportResult, mode) {
  const responseValidation = validateTransportTrialResult_(transportResult);

  if (responseValidation.ok !== true) {
    return buildInvalidTransportResponseResult_(
      "Invalid compute response body: " + (responseValidation.message || "response body is invalid."),
      responseValidation,
      {
        invocationMode: mode,
        responseContractVersion: transportResult && transportResult.contractVersion
          ? transportResult.contractVersion
          : null,
        expectedResponseContractVersion: responseValidation.expectedContractVersion || "transport_trial_result_v1"
      }
    );
  }

  return null;
}

function invokeTrialComputeLocalDirect_(snapshot, options) {
  const requestValidation = validateTrialComputeRequest_(snapshot);
  if (requestValidation.ok !== true) {
    return buildInvalidComputeRequestResult_(snapshot, requestValidation, "LOCAL_DIRECT");
  }

  const headlessResult = runRandomTrialsHeadless_(snapshot);
  const transportResult = buildTransportTrialResult_(headlessResult, options);
  const invalidResponseResult = validateInboundTransportResultOrBuildError_(transportResult, "LOCAL_DIRECT");

  if (invalidResponseResult) {
    return invalidResponseResult;
  }

  return transportResult;
}

function invokeTrialComputeLocalSimulatedExternal_(snapshot, options) {
  const requestValidation = validateTrialComputeRequest_(snapshot);
  if (requestValidation.ok !== true) {
    return buildInvalidComputeRequestResult_(snapshot, requestValidation, "LOCAL_SIMULATED_EXTERNAL");
  }

  const outboundRequestBody = cloneViaJsonTransport_(snapshot);
  const workerResponseBody = runLocalComputeWorkerFromRequest_(outboundRequestBody, options);
  const inboundTransportResult = cloneViaJsonTransport_(workerResponseBody);
  const invalidResponseResult = validateInboundTransportResultOrBuildError_(
    inboundTransportResult,
    "LOCAL_SIMULATED_EXTERNAL"
  );

  if (invalidResponseResult) {
    return invalidResponseResult;
  }

  return inboundTransportResult;
}

function invokeTrialComputeExternalHttp_(snapshot, options) {
  const requestValidation = validateTrialComputeRequest_(snapshot);
  if (requestValidation.ok !== true) {
    return buildInvalidComputeRequestResult_(snapshot, requestValidation, "EXTERNAL_HTTP");
  }

  return {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    invocationMode: "EXTERNAL_HTTP",
    message: "EXTERNAL_HTTP invocation mode is not implemented yet."
  };
}

function invokeTrialCompute_(snapshot, options) {
  const normalizedOptions = normalizeTrialComputeInvocationOptions_(options);
  const mode = normalizedOptions.mode;

  if (mode === "LOCAL_DIRECT") {
    return invokeTrialComputeLocalDirect_(snapshot, normalizedOptions);
  }

  if (mode === "LOCAL_SIMULATED_EXTERNAL") {
    return invokeTrialComputeLocalSimulatedExternal_(snapshot, normalizedOptions);
  }

  if (mode === "EXTERNAL_HTTP") {
    return invokeTrialComputeExternalHttp_(snapshot, normalizedOptions);
  }

  return {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    invocationMode: mode,
    supportedModes: getSupportedTrialComputeInvocationModes_(),
    message: "Unsupported invocation mode: " + mode
  };
}

function debugTransportTrialResultForInvocationMode_(mode) {
  const prepared = prepareRandomTrialsSnapshot_(200, { seed: 12345 });

  if (!prepared.ok) {
    Logger.log(JSON.stringify(prepared, null, 2));
    return;
  }

  const transportResult = invokeTrialCompute_(prepared.snapshot, {
    mode: mode,
    includeBestAllocation: true,
    includeCandidatePoolsSummary: true,
    includeBestScoring: false
  });

  Logger.log(JSON.stringify(transportResult, null, 2));
}

function debugSimulatedExternalTransportTrialResult() {
  debugTransportTrialResultForInvocationMode_("LOCAL_SIMULATED_EXTERNAL");
}
