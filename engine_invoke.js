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

function buildExternalHttpInvocationErrorResult_(message, extraFields) {
  const result = {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    invocationMode: "EXTERNAL_HTTP",
    message: message || "External HTTP invocation failed."
  };

  const extra = extraFields || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = extra[keys[i]];
  }

  return result;
}

function clipExternalHttpTextPreview_(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  const limit = typeof maxLength === "number" && maxLength > 0 ? maxLength : 500;

  if (text.length <= limit) {
    return text;
  }

  return text.slice(0, limit) + "...";
}

function parseExternalHttpJsonResponse_(responseText) {
  if (responseText === null || responseText === undefined || responseText === "") {
    return {
      ok: false,
      message: "External HTTP response body is empty."
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(responseText)
    };
  } catch (error) {
    return {
      ok: false,
      message: "External HTTP response body is not valid JSON.",
      parseError: error && error.message ? error.message : String(error),
      responseTextPreview: clipExternalHttpTextPreview_(responseText, 1000)
    };
  }
}

function buildExternalHttpNonSuccessResult_(httpStatus, responseText, extraFields) {
  const parsed = parseExternalHttpJsonResponse_(responseText);
  const result = buildExternalHttpInvocationErrorResult_(
    "External HTTP compute returned HTTP " + httpStatus + ".",
    {
      httpStatus: httpStatus,
      responseTextPreview: clipExternalHttpTextPreview_(responseText, 1000)
    }
  );

  if (parsed.ok === true && parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)) {
    result.remoteErrorBody = parsed.value;
  } else if (parsed.ok !== true) {
    result.responseParseError = parsed.message;
  }

  const extra = extraFields || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = extra[keys[i]];
  }

  return result;
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

  const config = getTrialComputeExternalHttpConfig_();
  const configValidation = validateTrialComputeExternalHttpConfig_(config);
  if (configValidation.ok !== true) {
    return buildExternalHttpInvocationErrorResult_(
      "External HTTP config is invalid: " + configValidation.message,
      {
        configValidation: configValidation
      }
    );
  }

  const outboundRequestBody = cloneViaJsonTransport_(snapshot);
  const requestBodyText = JSON.stringify(outboundRequestBody);
  const requestUrl = configValidation.url;
  let response;

  try {
    response = UrlFetchApp.fetch(requestUrl, {
      method: "post",
      contentType: "application/json; charset=utf-8",
      headers: {
        Authorization: "Bearer " + config.token.trim()
      },
      payload: requestBodyText,
      muteHttpExceptions: true
    });
  } catch (error) {
    return buildExternalHttpInvocationErrorResult_(
      "External HTTP request failed: " + (error && error.message ? error.message : String(error)),
      {
        requestUrl: requestUrl,
        requestContractVersion: outboundRequestBody.contractVersion || null,
        requestBodyBytes: requestBodyText.length
      }
    );
  }

  const httpStatus = response.getResponseCode();
  const responseText = response.getContentText();

  if (httpStatus < 200 || httpStatus >= 300) {
    return buildExternalHttpNonSuccessResult_(httpStatus, responseText, {
      requestUrl: requestUrl,
      requestContractVersion: outboundRequestBody.contractVersion || null
    });
  }

  const parsed = parseExternalHttpJsonResponse_(responseText);
  if (parsed.ok !== true) {
    return buildExternalHttpInvocationErrorResult_(parsed.message, {
      requestUrl: requestUrl,
      httpStatus: httpStatus,
      requestContractVersion: outboundRequestBody.contractVersion || null,
      parseError: parsed.parseError || null,
      responseTextPreview: parsed.responseTextPreview || null
    });
  }

  const inboundTransportResult = cloneViaJsonTransport_(parsed.value);

  if (!inboundTransportResult || typeof inboundTransportResult !== "object" || Array.isArray(inboundTransportResult)) {
    return buildExternalHttpInvocationErrorResult_(
      "External HTTP response JSON must be an object.",
      {
        requestUrl: requestUrl,
        httpStatus: httpStatus,
        requestContractVersion: outboundRequestBody.contractVersion || null
      }
    );
  }

  if (inboundTransportResult.ok === false) {
    inboundTransportResult.invocationMode = inboundTransportResult.invocationMode || "EXTERNAL_HTTP";
    return inboundTransportResult;
  }

  const invalidResponseResult = validateInboundTransportResultOrBuildError_(
    inboundTransportResult,
    "EXTERNAL_HTTP"
  );

  if (invalidResponseResult) {
    invalidResponseResult.httpStatus = httpStatus;
    invalidResponseResult.requestUrl = requestUrl;
    return invalidResponseResult;
  }

  return inboundTransportResult;
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
