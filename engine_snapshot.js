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
  const snapshot = {
    contractVersion: "compute_snapshot_v1",
    parseResult: parseResult,
    scorerConfig: scorerConfigResult,
    options: {
      trialCount: options && typeof options.trialCount === "number"
        ? options.trialCount
        : 1,
      seed: options && Object.prototype.hasOwnProperty.call(options, "seed")
        ? options.seed
        : null
    }
  };

  return deepFreezeSimple_(snapshot);
}

function validateComputeSnapshot_(snapshot) {
  const issues = [];

  if (!snapshot) {
    issues.push("snapshot is required.");
  }

  if (!snapshot || snapshot.contractVersion !== "compute_snapshot_v1") {
    issues.push("snapshot.contractVersion must be compute_snapshot_v1.");
  }

  if (!snapshot || !snapshot.parseResult) {
    issues.push("snapshot.parseResult is required.");
  } else if (snapshot.parseResult.ok !== true) {
    issues.push("snapshot.parseResult must be ok.");
  }

  if (!snapshot || !snapshot.scorerConfig) {
    issues.push("snapshot.scorerConfig is required.");
  } else if (snapshot.scorerConfig.ok !== true) {
    issues.push("snapshot.scorerConfig must be ok.");
  }

  if (!snapshot || !snapshot.options) {
    issues.push("snapshot.options is required.");
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
    trialCount: snapshot.options.trialCount,
    seed: snapshot.options.seed
  };
}
