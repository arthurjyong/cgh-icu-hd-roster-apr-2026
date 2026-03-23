function buildParseResultLikeFromSnapshot_(snapshot) {
  const inputs = snapshot && snapshot.inputs ? snapshot.inputs : {};
  const metadata = snapshot && snapshot.metadata ? snapshot.metadata : {};

  return {
    ok: true,
    calendarDays: inputs.calendarDays || [],
    doctors: inputs.doctors || [],
    doctorDayEntries: inputs.doctorDayEntries || {},
    availabilityMap: inputs.availabilityMap || {},
    summary: {
      dateCount: typeof metadata.dateCount === "number"
        ? metadata.dateCount
        : ((inputs.calendarDays || []).length),
      doctorCount: typeof metadata.doctorCount === "number"
        ? metadata.doctorCount
        : ((inputs.doctors || []).length)
    }
  };
}

function buildScorerConfigResultLikeFromSnapshot_(snapshot) {
  const scorer = snapshot && snapshot.scorer ? snapshot.scorer : {};

  return {
    ok: true,
    source: scorer.source || null,
    scorerSource: scorer.scorerSource || scorer.source || null,
    sheetName: scorer.sheetName || null,
    weights: scorer.weights || null,
    scorerFingerprintVersion: scorer.scorerFingerprintVersion || null,
    scorerFingerprint: scorer.scorerFingerprint || null,
    scorerFingerprintShort: scorer.scorerFingerprintShort || null,
    scorerFingerprintHash: scorer.scorerFingerprintHash || null,
    scorerIdentityPayload: scorer.scorerIdentityPayload || null
  };
}


function buildComponentScoresFromScoring_(scoring) {
  if (!scoring || typeof scoring !== "object") {
    return null;
  }

  const components = scoring.components;
  if (!components || typeof components !== "object") {
    return null;
  }

  const keys = Object.keys(components);
  const result = {};
  let hasAny = false;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const component = components[key];

    if (typeof component === "number" && isFinite(component)) {
      result[key] = component;
      hasAny = true;
      continue;
    }

    if (
      component &&
      typeof component === "object" &&
      typeof component.score === "number" &&
      isFinite(component.score)
    ) {
      result[key] = component.score;
      hasAny = true;
    }
  }

  return hasAny ? result : null;
}

function buildTransportTrialResult_(headlessResult, options) {
  const transportContractVersion = "transport_trial_result_v1";
  const includeCandidatePoolsSummary = !(options && options.includeCandidatePoolsSummary === false);
  const includeBestAllocation = !!(options && options.includeBestAllocation);
  const includeBestScoring = !!(options && options.includeBestScoring);

  if (!headlessResult) {
    return {
      ok: false,
      contractVersion: transportContractVersion,
      message: "headlessResult is required."
    };
  }

  if (headlessResult.ok !== true) {
    return {
      ok: false,
      contractVersion: transportContractVersion,
      sourceContractVersion: headlessResult.contractVersion || null,
      message: headlessResult.message || "headlessResult is not ok."
    };
  }

  const trialSpec = headlessResult.trialSpec || {
    trialCount: headlessResult.trialCount,
    seed: headlessResult.seed
  };

  const rng = headlessResult.rng || {
    kind: headlessResult.rngKind,
    normalizedSeed: headlessResult.normalizedSeed
  };

  const bestTrial = headlessResult.bestTrial || {
    index: headlessResult.bestTrialIndex,
    score: headlessResult.bestScore,
    allocationSummary: headlessResult.bestAllocation
      ? (headlessResult.bestAllocation.summary || null)
      : null,
    scoringSummary: headlessResult.bestScoring
      ? {
          contractVersion: headlessResult.bestScoring.contractVersion || null,
          totalScore: headlessResult.bestScoring.totalScore,
          meanPoints: headlessResult.bestScoring.meanPoints,
          standardDeviation: headlessResult.bestScoring.standardDeviation,
          minPoints: headlessResult.bestScoring.minPoints,
          maxPoints: headlessResult.bestScoring.maxPoints,
          range: headlessResult.bestScoring.range,
          componentScores: buildComponentScoresFromScoring_(headlessResult.bestScoring),
          scorerFingerprintVersion: headlessResult.bestScoring.scorerFingerprintVersion || null,
          scorerFingerprint: headlessResult.bestScoring.scorerFingerprint || null,
          scorerFingerprintShort: headlessResult.bestScoring.scorerFingerprintShort || null,
          scorerSource: headlessResult.bestScoring.scorerSource || null
        }
      : null
  };

  const transportResult = {
    ok: true,
    contractVersion: transportContractVersion,
    sourceContractVersion: headlessResult.contractVersion || null,
    snapshotContractVersion: headlessResult.snapshotContractVersion || null,
    scorerFingerprintVersion: headlessResult.bestScoring && headlessResult.bestScoring.scorerFingerprintVersion
      ? headlessResult.bestScoring.scorerFingerprintVersion
      : null,
    scorerFingerprint: headlessResult.bestScoring && headlessResult.bestScoring.scorerFingerprint
      ? headlessResult.bestScoring.scorerFingerprint
      : null,
    scorerFingerprintShort: headlessResult.bestScoring && headlessResult.bestScoring.scorerFingerprintShort
      ? headlessResult.bestScoring.scorerFingerprintShort
      : null,
    scorerSource: headlessResult.bestScoring && headlessResult.bestScoring.scorerSource
      ? headlessResult.bestScoring.scorerSource
      : null,
    trialSpec: trialSpec,
    rng: rng,
    candidatePoolsSummary: includeCandidatePoolsSummary
      ? (headlessResult.candidatePoolsSummary || null)
      : null,
    bestTrial: bestTrial
  };

  if (includeBestAllocation) {
    transportResult.bestAllocation = headlessResult.bestAllocation || null;
  }

  if (includeBestScoring) {
    transportResult.bestScoring = headlessResult.bestScoring || null;
  }

  return transportResult;
}

function validateTransportTrialResult_(transportResult) {
  const issues = [];
  const expectedContractVersion = "transport_trial_result_v1";
  const actualContractVersion = transportResult && transportResult.contractVersion
    ? transportResult.contractVersion
    : null;

  if (!transportResult || typeof transportResult !== "object" || Array.isArray(transportResult)) {
    issues.push("transportResult must be an object.");
  }

  if (!transportResult) {
    issues.push("transportResult is required.");
  }

  if (actualContractVersion !== expectedContractVersion) {
    issues.push("transportResult.contractVersion must be transport_trial_result_v1.");
  }

  if (!transportResult || transportResult.ok !== true) {
    issues.push("transportResult must be ok.");
  }

  if (!transportResult || !transportResult.trialSpec || typeof transportResult.trialSpec !== "object") {
    issues.push("transportResult.trialSpec is required.");
  } else {
    if (typeof transportResult.trialSpec.trialCount !== "number" || !isFinite(transportResult.trialSpec.trialCount) || transportResult.trialSpec.trialCount < 1) {
      issues.push("transportResult.trialSpec.trialCount must be at least 1.");
    }

    const hasSeed = Object.prototype.hasOwnProperty.call(transportResult.trialSpec, "seed");
    if (!hasSeed) {
      issues.push("transportResult.trialSpec.seed is required and may be null.");
    }
  }

  if (!transportResult || !transportResult.rng || typeof transportResult.rng !== "object") {
    issues.push("transportResult.rng is required.");
  } else {
    if (typeof transportResult.rng.kind !== "string" || !transportResult.rng.kind) {
      issues.push("transportResult.rng.kind must be a non-empty string.");
    }

    const hasNormalizedSeed = Object.prototype.hasOwnProperty.call(transportResult.rng, "normalizedSeed");
    if (!hasNormalizedSeed) {
      issues.push("transportResult.rng.normalizedSeed is required and may be null.");
    }
  }

  if (!transportResult || transportResult.sourceContractVersion !== "headless_random_trials_result_v2") {
    issues.push("transportResult.sourceContractVersion must be headless_random_trials_result_v2.");
  }

  if (!transportResult || transportResult.snapshotContractVersion !== "compute_snapshot_v2") {
    issues.push("transportResult.snapshotContractVersion must be compute_snapshot_v2.");
  }

  if (!transportResult || !transportResult.bestTrial || typeof transportResult.bestTrial !== "object") {
    issues.push("transportResult.bestTrial is required.");
  } else {
    if (typeof transportResult.bestTrial.index !== "number" || !isFinite(transportResult.bestTrial.index) || transportResult.bestTrial.index < 0) {
      issues.push("transportResult.bestTrial.index must be a non-negative number.");
    }
    if (typeof transportResult.bestTrial.score !== "number" || !isFinite(transportResult.bestTrial.score)) {
      issues.push("transportResult.bestTrial.score must be a finite number.");
    }
  }

  if (transportResult && transportResult.candidatePoolsSummary !== null && transportResult.candidatePoolsSummary !== undefined) {
    if (typeof transportResult.candidatePoolsSummary !== "object" || Array.isArray(transportResult.candidatePoolsSummary)) {
      issues.push("transportResult.candidatePoolsSummary must be an object or null.");
    }
  }

  if (transportResult && transportResult.bestAllocation !== undefined && transportResult.bestAllocation !== null) {
    if (typeof transportResult.bestAllocation !== "object" || Array.isArray(transportResult.bestAllocation)) {
      issues.push("transportResult.bestAllocation must be an object or null.");
    } else {
      if (transportResult.bestAllocation.ok !== true) {
        issues.push("transportResult.bestAllocation must be ok when present.");
      }
      if (!Array.isArray(transportResult.bestAllocation.days)) {
        issues.push("transportResult.bestAllocation.days must be an array when bestAllocation is present.");
      }
    }
  }

  if (transportResult && transportResult.bestScoring !== undefined && transportResult.bestScoring !== null) {
    if (typeof transportResult.bestScoring !== "object" || Array.isArray(transportResult.bestScoring)) {
      issues.push("transportResult.bestScoring must be an object or null.");
    } else if (transportResult.bestScoring.ok !== true) {
      issues.push("transportResult.bestScoring must be ok when present.");
    }
  }

  if (transportResult && transportResult.scorerFingerprint !== undefined && transportResult.scorerFingerprint !== null) {
    if (typeof transportResult.scorerFingerprint !== "string" || !transportResult.scorerFingerprint) {
      issues.push("transportResult.scorerFingerprint must be a non-empty string when present.");
    }
  }

  return issues.length > 0
    ? {
        ok: false,
        contractKind: "transport_trial_result",
        expectedContractVersion: expectedContractVersion,
        actualContractVersion: actualContractVersion,
        message: issues[0],
        issues: issues
      }
    : {
        ok: true,
        contractKind: "transport_trial_result",
        contractVersion: transportResult.contractVersion,
        expectedContractVersion: expectedContractVersion,
        actualContractVersion: actualContractVersion,
        trialCount: transportResult.trialSpec.trialCount,
        seed: transportResult.trialSpec.seed,
        bestTrialIndex: transportResult.bestTrial.index,
        bestScore: transportResult.bestTrial.score,
        hasBestAllocation: !!transportResult.bestAllocation,
        hasBestScoring: !!transportResult.bestScoring
      };
}

function runRandomTrialsHeadless_(snapshot) {
  const result = {
    ok: false,
    contractVersion: "headless_random_trials_result_v2",
    snapshotContractVersion: snapshot && snapshot.contractVersion ? snapshot.contractVersion : null,

    trialSpec: {
      trialCount: snapshot && snapshot.trialSpec ? snapshot.trialSpec.trialCount : null,
      seed: snapshot && snapshot.trialSpec ? snapshot.trialSpec.seed : null
    },

    rng: {
      kind: null,
      normalizedSeed: null
    },

    candidatePoolsSummary: null,
    bestTrial: null,

    // Legacy aliases kept temporarily so current callers still work unchanged.
    trialCount: snapshot && snapshot.trialSpec ? snapshot.trialSpec.trialCount : null,
    seed: snapshot && snapshot.trialSpec ? snapshot.trialSpec.seed : null,
    normalizedSeed: null,
    rngKind: null,
    bestScore: Number.POSITIVE_INFINITY,
    bestAllocation: null,
    bestScoring: null,
    bestTrialIndex: null
  };

  const validation = validateComputeSnapshot_(snapshot);
  if (validation.ok !== true) {
    result.message = validation.message || "snapshot is invalid.";
    result.snapshotValidation = validation;
    return result;
  }

  const parseResultLike = buildParseResultLikeFromSnapshot_(snapshot);
  const scorerConfigResultLike = buildScorerConfigResultLikeFromSnapshot_(snapshot);
  const trialCount = snapshot.trialSpec.trialCount;
  const seed = snapshot.trialSpec.seed;

  result.trialCount = trialCount;
  result.seed = seed;

  const candidatePools = buildAllCandidatePools_(parseResultLike);
  if (candidatePools.ok !== true) {
    result.message = "candidatePools contains errors.";
    result.candidatePools = candidatePools;
    return result;
  }

  const hasExplicitSeed = seed !== null
    && seed !== undefined
    && seed !== "";
  const rng = hasExplicitSeed
    ? createSeededRng_(seed)
    : createMathRandomRng_();

  result.rng.kind = rng.kind;
  result.rng.normalizedSeed = rng.initialSeed;
  result.normalizedSeed = rng.initialSeed;
  result.rngKind = rng.kind;
  result.candidatePoolsSummary = candidatePools.summary;

  for (let i = 0; i < trialCount; i++) {
    const allocationResult = allocateAllDaysRandom_(candidatePools, rng);
    const scoring = scoreAllocation_(allocationResult, parseResultLike, scorerConfigResultLike);

    if (!scoring.ok) {
      continue;
    }

    if (scoring.totalScore < result.bestScore) {
      result.bestScore = scoring.totalScore;
      result.bestAllocation = allocationResult;
      result.bestScoring = scoring;
      result.bestTrialIndex = i;

      result.bestTrial = {
        index: i,
        score: scoring.totalScore,
        allocationSummary: allocationResult.summary || null,
        scoringSummary: {
          contractVersion: scoring.contractVersion || null,
          totalScore: scoring.totalScore,
          meanPoints: scoring.meanPoints,
          standardDeviation: scoring.standardDeviation,
          minPoints: scoring.minPoints,
          maxPoints: scoring.maxPoints,
          range: scoring.range,
          componentScores: buildComponentScoresFromScoring_(scoring)
        }
      };
    }
  }

  if (!result.bestAllocation) {
    result.message = "No valid trial result found.";
    return result;
  }

  result.ok = true;
  return result;
}
