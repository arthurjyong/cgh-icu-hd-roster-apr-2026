function cloneViaJsonTransport_(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function runLocalComputeWorkerFromRequest_(requestBody, options) {
  const requestValidation = validateTrialComputeRequest_(requestBody);
  if (requestValidation.ok !== true) {
    return {
      ok: false,
      contractVersion: "transport_trial_result_v1",
      requestContractVersion: requestBody && requestBody.contractVersion ? requestBody.contractVersion : null,
      expectedRequestContractVersion: requestValidation.expectedContractVersion || "compute_snapshot_v2",
      message: requestValidation.message || "Invalid compute request body.",
      requestValidation: requestValidation
    };
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

function invokeTrialCompute_(snapshot, options) {
  const mode = options && options.mode
    ? options.mode
    : "LOCAL_SIMULATED_EXTERNAL";

  if (mode === "LOCAL_DIRECT") {
    const requestValidation = validateTrialComputeRequest_(snapshot);
    if (requestValidation.ok !== true) {
      return {
        ok: false,
        contractVersion: "transport_trial_result_v1",
        expectedRequestContractVersion: requestValidation.expectedContractVersion || "compute_snapshot_v2",
        requestContractVersion: snapshot && snapshot.contractVersion ? snapshot.contractVersion : null,
        message: requestValidation.message || "Invalid compute request body.",
        requestValidation: requestValidation
      };
    }

    const headlessResult = runRandomTrialsHeadless_(snapshot);
    const transportResult = buildTransportTrialResult_(headlessResult, options);
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

    return transportResult;
  }

  if (mode === "LOCAL_SIMULATED_EXTERNAL") {
    const requestValidation = validateTrialComputeRequest_(snapshot);
    if (requestValidation.ok !== true) {
      return {
        ok: false,
        contractVersion: "transport_trial_result_v1",
        expectedRequestContractVersion: requestValidation.expectedContractVersion || "compute_snapshot_v2",
        requestContractVersion: snapshot && snapshot.contractVersion ? snapshot.contractVersion : null,
        message: requestValidation.message || "Invalid compute request body.",
        requestValidation: requestValidation
      };
    }

    const outboundRequestBody = cloneViaJsonTransport_(snapshot);
    const workerResponseBody = runLocalComputeWorkerFromRequest_(outboundRequestBody, options);
    const inboundTransportResult = cloneViaJsonTransport_(workerResponseBody);
    const responseValidation = validateTransportTrialResult_(inboundTransportResult);

    if (responseValidation.ok !== true) {
      return buildInvalidTransportResponseResult_(
        "Invalid compute response body: " + (responseValidation.message || "response body is invalid."),
        responseValidation,
        {
          invocationMode: mode,
          responseContractVersion: inboundTransportResult && inboundTransportResult.contractVersion
            ? inboundTransportResult.contractVersion
            : null,
          expectedResponseContractVersion: responseValidation.expectedContractVersion || "transport_trial_result_v1"
        }
      );
    }

    return inboundTransportResult;
  }

  return {
    ok: false,
    contractVersion: "transport_trial_result_v1",
    message: "Unsupported invocation mode: " + mode
  };
}

function debugSimulatedExternalTransportTrialResult() {
  const prepared = prepareRandomTrialsSnapshot_(200, { seed: 12345 });

  if (!prepared.ok) {
    Logger.log(JSON.stringify(prepared, null, 2));
    return;
  }

  const transportResult = invokeTrialCompute_(prepared.snapshot, {
    mode: "LOCAL_SIMULATED_EXTERNAL",
    includeBestAllocation: true,
    includeCandidatePoolsSummary: true,
    includeBestScoring: false
  });

  Logger.log(JSON.stringify(transportResult, null, 2));
}
