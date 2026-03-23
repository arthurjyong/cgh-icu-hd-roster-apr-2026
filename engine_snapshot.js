function deepFreezeSimple_(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    deepFreezeSimple_(value[keys[i]]);
  }

  return value;
}

function buildComputeSnapshotFromParseResult_(parseResult, scorerConfigResult, options) {
  const trialCount = options && typeof options.trialCount === "number"
    ? options.trialCount
    : 1;

  const seed = options && Object.prototype.hasOwnProperty.call(options, "seed")
    ? options.seed
    : null;

  const calendarDays = parseResult ? (parseResult.calendarDays || []) : [];
  const doctors = parseResult ? (parseResult.doctors || []) : [];
  const doctorDayEntries = parseResult ? (parseResult.doctorDayEntries || {}) : {};
  const availabilityMap = parseResult ? (parseResult.availabilityMap || {}) : {};

  const snapshot = {
    contractVersion: "compute_snapshot_v2",

    trialSpec: {
      trialCount: trialCount,
      seed: seed
    },

    inputs: {
      calendarDays: calendarDays,
      doctors: doctors,
      doctorDayEntries: doctorDayEntries,
      availabilityMap: availabilityMap
    },

    scorer: {
      source: scorerConfigResult ? scorerConfigResult.source : null,
      scorerSource: scorerConfigResult ? scorerConfigResult.scorerSource : null,
      sheetName: scorerConfigResult ? scorerConfigResult.sheetName : null,
      weights: scorerConfigResult ? scorerConfigResult.weights : null,
      scorerFingerprintVersion: scorerConfigResult ? scorerConfigResult.scorerFingerprintVersion : null,
      scorerFingerprint: scorerConfigResult ? scorerConfigResult.scorerFingerprint : null,
      scorerFingerprintShort: scorerConfigResult ? scorerConfigResult.scorerFingerprintShort : null,
      scorerFingerprintHash: scorerConfigResult ? scorerConfigResult.scorerFingerprintHash : null,
      scorerIdentityPayload: scorerConfigResult ? scorerConfigResult.scorerIdentityPayload : null
    },

    metadata: {
      dateCount: parseResult && parseResult.summary
        ? parseResult.summary.dateCount
        : calendarDays.length,
      doctorCount: parseResult && parseResult.summary
        ? parseResult.summary.doctorCount
        : doctors.length
    }
  };

  return deepFreezeSimple_(snapshot);
}

function validateComputeSnapshot_(snapshot) {
  const issues = [];
  const expectedContractVersion = "compute_snapshot_v2";
  const actualContractVersion = snapshot && snapshot.contractVersion
    ? snapshot.contractVersion
    : null;

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    issues.push("snapshot must be an object.");
  }

  if (!snapshot) {
    issues.push("snapshot is required.");
  }

  if (actualContractVersion !== expectedContractVersion) {
    issues.push("snapshot.contractVersion must be compute_snapshot_v2.");
  }

  if (!snapshot || !snapshot.trialSpec || typeof snapshot.trialSpec !== "object") {
    issues.push("snapshot.trialSpec is required.");
  } else {
    if (typeof snapshot.trialSpec.trialCount !== "number" || !isFinite(snapshot.trialSpec.trialCount) || snapshot.trialSpec.trialCount < 1) {
      issues.push("snapshot.trialSpec.trialCount must be at least 1.");
    }

    const hasSeed = Object.prototype.hasOwnProperty.call(snapshot.trialSpec, "seed");
    const seed = hasSeed ? snapshot.trialSpec.seed : null;
    const validSeed = seed === null
      || seed === undefined
      || seed === ""
      || typeof seed === "number"
      || typeof seed === "string";

    if (!hasSeed) {
      issues.push("snapshot.trialSpec.seed is required and may be null.");
    } else if (!validSeed) {
      issues.push("snapshot.trialSpec.seed must be null, a number, or a string.");
    }
  }

  if (!snapshot || !snapshot.inputs || typeof snapshot.inputs !== "object") {
    issues.push("snapshot.inputs is required.");
  } else {
    if (!Array.isArray(snapshot.inputs.calendarDays)) {
      issues.push("snapshot.inputs.calendarDays must be an array.");
    }
    if (!Array.isArray(snapshot.inputs.doctors)) {
      issues.push("snapshot.inputs.doctors must be an array.");
    }
    if (!snapshot.inputs.doctorDayEntries || typeof snapshot.inputs.doctorDayEntries !== "object" || Array.isArray(snapshot.inputs.doctorDayEntries)) {
      issues.push("snapshot.inputs.doctorDayEntries must be an object.");
    }
    if (!snapshot.inputs.availabilityMap || typeof snapshot.inputs.availabilityMap !== "object" || Array.isArray(snapshot.inputs.availabilityMap)) {
      issues.push("snapshot.inputs.availabilityMap must be an object.");
    }
  }

  if (!snapshot || !snapshot.scorer || typeof snapshot.scorer !== "object") {
    issues.push("snapshot.scorer is required.");
  } else if (!snapshot.scorer.weights || typeof snapshot.scorer.weights !== "object" || Array.isArray(snapshot.scorer.weights)) {
    issues.push("snapshot.scorer.weights must be an object.");
  }

  if (!snapshot || !snapshot.metadata || typeof snapshot.metadata !== "object" || Array.isArray(snapshot.metadata)) {
    issues.push("snapshot.metadata is required.");
  } else {
    if (typeof snapshot.metadata.dateCount !== "number" || !isFinite(snapshot.metadata.dateCount) || snapshot.metadata.dateCount < 0) {
      issues.push("snapshot.metadata.dateCount must be a non-negative number.");
    }
    if (typeof snapshot.metadata.doctorCount !== "number" || !isFinite(snapshot.metadata.doctorCount) || snapshot.metadata.doctorCount < 0) {
      issues.push("snapshot.metadata.doctorCount must be a non-negative number.");
    }
  }

  return issues.length > 0
    ? {
        ok: false,
        expectedContractVersion: expectedContractVersion,
        actualContractVersion: actualContractVersion,
        message: issues[0],
        issues: issues
      }
    : {
        ok: true,
        contractVersion: snapshot.contractVersion,
        expectedContractVersion: expectedContractVersion,
        actualContractVersion: actualContractVersion,
        trialCount: snapshot.trialSpec.trialCount,
        seed: snapshot.trialSpec.seed,
        dateCount: snapshot.metadata.dateCount,
        doctorCount: snapshot.metadata.doctorCount
      };
}

function validateTrialComputeRequest_(requestBody) {
  const snapshotValidation = validateComputeSnapshot_(requestBody);

  if (snapshotValidation.ok !== true) {
    return {
      ok: false,
      contractKind: "compute_request_body",
      expectedContractVersion: "compute_snapshot_v2",
      actualContractVersion: requestBody && requestBody.contractVersion
        ? requestBody.contractVersion
        : null,
      message: "Invalid compute request body: " + (snapshotValidation.message || "request body is invalid."),
      issues: snapshotValidation.issues || [],
      snapshotValidation: snapshotValidation
    };
  }

  return {
    ok: true,
    contractKind: "compute_request_body",
    contractVersion: snapshotValidation.contractVersion,
    expectedContractVersion: "compute_snapshot_v2",
    actualContractVersion: snapshotValidation.actualContractVersion,
    trialCount: snapshotValidation.trialCount,
    seed: snapshotValidation.seed,
    dateCount: snapshotValidation.dateCount,
    doctorCount: snapshotValidation.doctorCount
  };
}

function buildDebugComputeSnapshotForInvocation_(options) {
  const normalizedOptions = options && typeof options === "object" && !Array.isArray(options)
    ? options
    : {};

  const trialCount = typeof normalizedOptions.trialCount === "number"
    && isFinite(normalizedOptions.trialCount)
    && normalizedOptions.trialCount >= 1
      ? normalizedOptions.trialCount
      : 200;

  const prepareOptions = {};
  if (Object.prototype.hasOwnProperty.call(normalizedOptions, "seed")) {
    prepareOptions.seed = normalizedOptions.seed;
  }

  if (typeof prepareRandomTrialsSnapshot_ !== "function") {
    return {
      ok: false,
      contractKind: "compute_snapshot_debug_result",
      expectedContractVersion: "compute_snapshot_v2",
      message: "prepareRandomTrialsSnapshot_ is not available.",
      issues: [
        "prepareRandomTrialsSnapshot_ must be defined before building a debug compute snapshot."
      ]
    };
  }

  const prepared = prepareRandomTrialsSnapshot_(trialCount, prepareOptions);

  if (!prepared || prepared.ok !== true) {
    return prepared || {
      ok: false,
      contractKind: "compute_snapshot_debug_result",
      expectedContractVersion: "compute_snapshot_v2",
      message: "prepareRandomTrialsSnapshot_ returned no result."
    };
  }

  const snapshot = prepared.snapshot;
  const validation = validateTrialComputeRequest_(snapshot);

  if (!validation || validation.ok !== true) {
    return {
      ok: false,
      contractKind: "compute_snapshot_debug_result",
      expectedContractVersion: "compute_snapshot_v2",
      message: validation && validation.message
        ? validation.message
        : "Built snapshot failed validation.",
      issues: validation && validation.issues ? validation.issues : [],
      validation: validation || null,
      snapshot: snapshot || null
    };
  }

  return {
    ok: true,
    contractKind: "compute_snapshot_debug_result",
    contractVersion: snapshot.contractVersion,
    expectedContractVersion: "compute_snapshot_v2",
    invocationMode: "EXTERNAL_HTTP",
    trialCount: snapshot && snapshot.trialSpec ? snapshot.trialSpec.trialCount : null,
    seed: snapshot && snapshot.trialSpec
      && Object.prototype.hasOwnProperty.call(snapshot.trialSpec, "seed")
        ? snapshot.trialSpec.seed
        : null,
    dateCount: snapshot && snapshot.metadata ? snapshot.metadata.dateCount : null,
    doctorCount: snapshot && snapshot.metadata ? snapshot.metadata.doctorCount : null,
    validation: validation,
    snapshot: snapshot
  };
}


function writeDebugComputeSnapshotForInvocationToDrive_(options) {
  const debugResult = buildDebugComputeSnapshotForInvocation_(options);

  if (!debugResult || debugResult.ok !== true) {
    return debugResult || {
      ok: false,
      contractKind: "compute_snapshot_drive_export_result",
      expectedContractVersion: "compute_snapshot_v2",
      message: "Unable to build compute snapshot for Drive export."
    };
  }

  if (typeof DriveApp === "undefined" || !DriveApp || typeof DriveApp.createFile !== "function") {
    return {
      ok: false,
      contractKind: "compute_snapshot_drive_export_result",
      contractVersion: debugResult.contractVersion,
      expectedContractVersion: "compute_snapshot_v2",
      message: "DriveApp.createFile is not available.",
      snapshotSummary: {
        trialCount: debugResult.trialCount,
        seed: debugResult.seed,
        dateCount: debugResult.dateCount,
        doctorCount: debugResult.doctorCount
      }
    };
  }

  const snapshot = debugResult.snapshot;
  const seedLabel = debugResult.seed === null || debugResult.seed === undefined || debugResult.seed === ""
    ? "null"
    : String(debugResult.seed);
  const fileName = [
    snapshot.contractVersion || "compute_snapshot_v2",
    "seed" + seedLabel,
    "trials" + String(debugResult.trialCount)
  ].join("_") + ".json";

  const jsonText = JSON.stringify(snapshot, null, 2);
  const file = DriveApp.createFile(fileName, jsonText, MimeType.PLAIN_TEXT);

  return {
    ok: true,
    contractKind: "compute_snapshot_drive_export_result",
    contractVersion: snapshot.contractVersion,
    expectedContractVersion: "compute_snapshot_v2",
    invocationMode: "EXTERNAL_HTTP",
    message: "Compute snapshot written to Google Drive.",
    trialCount: debugResult.trialCount,
    seed: debugResult.seed,
    dateCount: debugResult.dateCount,
    doctorCount: debugResult.doctorCount,
    validation: debugResult.validation,
    file: {
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      mimeType: file.getMimeType(),
      sizeBytes: jsonText.length
    }
  };
}
