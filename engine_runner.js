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
    sheetName: scorer.sheetName || null,
    weights: scorer.weights || null
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
    trialCount: snapshot && snapshot.options ? snapshot.options.trialCount : null,
    seed: snapshot && snapshot.options ? snapshot.options.seed : null,
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

  // Keep legacy aliases in sync.
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
          componentScores: scoring.componentScores || null
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