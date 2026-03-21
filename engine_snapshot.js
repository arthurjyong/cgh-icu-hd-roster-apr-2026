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

  const snapshot = {
    contractVersion: "compute_snapshot_v2",

    trialSpec: {
      trialCount: trialCount,
      seed: seed
    },

    inputs: {
      calendarDays: parseResult ? parseResult.calendarDays : [],
      doctors: parseResult ? parseResult.doctors : [],
      doctorDayEntries: parseResult ? parseResult.doctorDayEntries : {},
      availabilityMap: parseResult ? parseResult.availabilityMap : {}
    },

    scorer: {
      source: scorerConfigResult ? scorerConfigResult.source : null,
      sheetName: scorerConfigResult ? scorerConfigResult.sheetName : null,
      weights: scorerConfigResult ? scorerConfigResult.weights : null
    },

    metadata: {
      dateCount: parseResult && parseResult.summary ? parseResult.summary.dateCount : 0,
      doctorCount: parseResult && parseResult.summary ? parseResult.summary.doctorCount : 0
    },

    // Legacy aliases kept temporarily so current Phase 1 runner still works.
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
    if (!snapshot.inputs.calendarDays) {
      issues.push("snapshot.inputs.calendarDays is required.");
    }
    if (!snapshot.inputs.doctors) {
      issues.push("snapshot.inputs.doctors is required.");
    }
    if (!snapshot.inputs.doctorDayEntries) {
      issues.push("snapshot.inputs.doctorDayEntries is required.");
    }
    if (!snapshot.inputs.availabilityMap) {
      issues.push("snapshot.inputs.availabilityMap is required.");
    }
  }

  if (!snapshot || !snapshot.scorer) {
    issues.push("snapshot.scorer is required.");
  } else if (!snapshot.scorer.weights) {
    issues.push("snapshot.scorer.weights is required.");
  }

  // Keep validating legacy aliases for now because current engine_runner.js still reads them.
  if (!snapshot || !snapshot.parseResult) {
    issues.push("snapshot.parseResult is required during Phase 2 compatibility mode.");
  } else if (snapshot.parseResult.ok !== true) {
    issues.push("snapshot.parseResult must be ok.");
  }

  if (!snapshot || !snapshot.scorerConfig) {
    issues.push("snapshot.scorerConfig is required during Phase 2 compatibility mode.");
  } else if (snapshot.scorerConfig.ok !== true) {
    issues.push("snapshot.scorerConfig must be ok.");
  }

  if (!snapshot || !snapshot.options) {
    issues.push("snapshot.options is required during Phase 2 compatibility mode.");
  } else if (typeof snapshot.options.trialCount !== "number" || snapshot.options.trialCount < 1) {
    issues.push("snapshot.options.trialCount must be at least 1.");
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