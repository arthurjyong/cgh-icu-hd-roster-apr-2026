function cloneViaJsonTransport_(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function runLocalComputeWorkerFromRequest_(requestBody, options) {
  const requestValidation = validateComputeSnapshot_(requestBody);
  if (requestValidation.ok !== true) {
    return {
      ok: false,
      contractVersion: "transport_trial_result_v1",
      requestContractVersion: requestBody && requestBody.contractVersion ? requestBody.contractVersion : null,
      message: "Invalid compute request: " + (requestValidation.message || "request body is invalid."),
      requestValidation: requestValidation
    };
  }

  const headlessResult = runRandomTrialsHeadless_(requestBody);
  return buildTransportTrialResult_(headlessResult, options);
}

function invokeTrialCompute_(snapshot, options) {
  const mode = options && options.mode
    ? options.mode
    : "LOCAL_SIMULATED_EXTERNAL";

  if (mode === "LOCAL_DIRECT") {
    const headlessResult = runRandomTrialsHeadless_(snapshot);
    return buildTransportTrialResult_(headlessResult, options);
  }

  if (mode === "LOCAL_SIMULATED_EXTERNAL") {
    const outboundRequestBody = cloneViaJsonTransport_(snapshot);
    const workerResponseBody = runLocalComputeWorkerFromRequest_(outboundRequestBody, options);
    return cloneViaJsonTransport_(workerResponseBody);
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
