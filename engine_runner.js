function runRandomTrialsHeadless_(snapshot) {
  const result = {
    ok: false,
    contractVersion: "headless_random_trials_result_v1",
    snapshotContractVersion: snapshot && snapshot.contractVersion ? snapshot.contractVersion : null,
    trialCount: snapshot && snapshot.options ? snapshot.options.trialCount : null,
    seed: snapshot && snapshot.options ? snapshot.options.seed : null,
    normalizedSeed: null,
    rngKind: null,
    bestScore: Number.POSITIVE_INFINITY,
    bestAllocation: null,
    bestScoring: null
  };

  const validation = validateComputeSnapshot_(snapshot);
  if (validation.ok !== true) {
    result.message = validation.message || "snapshot is invalid.";
    result.snapshotValidation = validation;
    return result;
  }

  const parseResult = snapshot.parseResult;
  const scorerConfigResult = snapshot.scorerConfig;
  const trialCount = snapshot.options.trialCount;

  const candidatePools = buildAllCandidatePools_(parseResult);
  if (candidatePools.ok !== true) {
    result.message = "candidatePools contains errors.";
    result.candidatePools = candidatePools;
    return result;
  }

  const hasExplicitSeed = snapshot.options.seed !== null
    && snapshot.options.seed !== undefined
    && snapshot.options.seed !== "";
  const rng = hasExplicitSeed
    ? createSeededRng_(snapshot.options.seed)
    : createMathRandomRng_();

  result.normalizedSeed = rng.initialSeed;
  result.rngKind = rng.kind;
  result.candidatePoolsSummary = candidatePools.summary;

  for (let i = 0; i < trialCount; i++) {
    const allocationResult = allocateAllDaysRandom_(candidatePools, rng);
    const scoring = scoreAllocation_(allocationResult, parseResult, scorerConfigResult);

    if (!scoring.ok) {
      continue;
    }

    if (scoring.totalScore < result.bestScore) {
      result.bestScore = scoring.totalScore;
      result.bestAllocation = allocationResult;
      result.bestScoring = scoring;
      result.bestTrialIndex = i;
    }
  }

  if (!result.bestAllocation) {
    result.message = "No valid trial result found.";
    return result;
  }

  result.ok = true;
  return result;
}
