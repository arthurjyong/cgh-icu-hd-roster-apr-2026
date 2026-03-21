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
      sheetName: scorerConfigResult ? scorerConfigResult.sheetName : null,
      weights: scorerConfigResult ? scorerConfigResult.weights : null
    },

    metadata: {
      dateCount: parseResult && parseResult.summary
        ? parseResult.summary.dateCount
        : calendarDays.length,
      doctorCount: parseResult && parseResult.summary
        ? parseResult.summary.doctorCount
        : doctors.length
    },

    // Legacy aliases kept temporarily for compatibility with any older callers.
    parseResult: parseResult,
    scorerConfig: scorerConfigResult,
    options: {
      trialCount: trialCount,
      seed: seed
    }
  };

  return deepFreezeSimple_(snapshot);
}

function validateComputeSnapshot_(snapshot) {
  const issues = [];

  if (!snapshot) {
    issues.push("snapshot is required.");
  }

  if (!snapshot || snapshot.contractVersion !== "compute_snapshot_v2") {
    issues.push("snapshot.contractVersion must be compute_snapshot_v2.");
  }

  if (!snapshot || !snapshot.trialSpec) {
    issues.push("snapshot.trialSpec is required.");
  } else if (typeof snapshot.trialSpec.trialCount !== "number" || snapshot.trialSpec.trialCount < 1) {
    issues.push("snapshot.trialSpec.trialCount must be at least 1.");
  }

  if (!snapshot || !snapshot.inputs) {
    issues.push("snapshot.inputs is required.");
  } else {
    if (!Array.isArray(snapshot.inputs.calendarDays)) {
      issues.push("snapshot.inputs.calendarDays must be an array.");
    }
    if (!Array.isArray(snapshot.inputs.doctors)) {
      issues.push("snapshot.inputs.doctors must be an array.");
    }
    if (!snapshot.inputs.doctorDayEntries || typeof snapshot.inputs.doctorDayEntries !== "object") {
      issues.push("snapshot.inputs.doctorDayEntries must be an object.");
    }
    if (!snapshot.inputs.availabilityMap || typeof snapshot.inputs.availabilityMap !== "object") {
      issues.push("snapshot.inputs.availabilityMap must be an object.");
    }
  }

  if (!snapshot || !snapshot.scorer) {
    issues.push("snapshot.scorer is required.");
  } else if (!snapshot.scorer.weights || typeof snapshot.scorer.weights !== "object") {
    issues.push("snapshot.scorer.weights must be an object.");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: issues[0],
      issues: issues
    };
  }

  return {
    ok: true,
    contractVersion: snapshot.contractVersion,
    trialCount: snapshot.trialSpec.trialCount,
    seed: snapshot.trialSpec.seed
  };
}