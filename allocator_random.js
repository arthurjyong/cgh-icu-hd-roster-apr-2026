function shuffleArray_(items, rng) {
  const copy = items.slice();
  const random = coerceRandomGenerator_(rng);

  for (let i = copy.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function pickRandomAvailableCandidate_(candidates, slotKey, allocationState, rng) {
  if (!candidates || candidates.length === 0) return null;

  const available = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (canAssignCandidateToSlot_(candidate, slotKey, allocationState)) {
      available.push(candidate);
    }
  }

  if (available.length === 0) return null;

  const shuffled = shuffleArray_(available, rng);
  return shuffled[0];
}

function getCrPrefillCallSlotOrder_() {
  return ["MICU_CALL", "MHD_CALL"];
}

function hasCrPreferenceCandidate_(candidate) {
  return !!(candidate && candidate.crPreferenceApplies === true);
}

function buildCrEligibleCandidatesForSlot_(candidates, slotKey, allocationState, doctorHasGuaranteedCr) {
  if (!candidates || candidates.length === 0) return [];

  const guaranteedMap = doctorHasGuaranteedCr || {};
  const eligible = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (!hasCrPreferenceCandidate_(candidate)) {
      continue;
    }

    if (guaranteedMap[candidate.doctorId] === true) {
      continue;
    }

    if (!canAssignCandidateToSlot_(candidate, slotKey, allocationState)) {
      continue;
    }

    eligible.push(candidate);
  }

  return eligible;
}

function pickRandomCandidateFromList_(candidates, rng) {
  if (!candidates || candidates.length === 0) return null;
  const shuffled = shuffleArray_(candidates, rng);
  return shuffled[0] || null;
}

function tryAssignCrPrefillForSlot_(slotKey, dailyPools, allocationState, assignments, doctorHasGuaranteedCr, rng) {
  const existing = assignments[slotKey];
  if (existing) {
    return existing;
  }

  const candidates = dailyPools.slotPools[slotKey] || [];
  const eligible = buildCrEligibleCandidatesForSlot_(
    candidates,
    slotKey,
    allocationState,
    doctorHasGuaranteedCr
  );
  const picked = pickRandomCandidateFromList_(eligible, rng);

  if (!picked) {
    return null;
  }

  assignments[slotKey] = picked;
  allocationState.usedDoctorIds[picked.doctorId] = true;

  return picked;
}

function applyCrPrefillForDay_(dailyPools, allocationState, assignments, doctorHasGuaranteedCr, rng) {
  const callSlotOrder = getCrPrefillCallSlotOrder_();

  for (let i = 0; i < callSlotOrder.length; i++) {
    const slotKey = callSlotOrder[i];
    tryAssignCrPrefillForSlot_(
      slotKey,
      dailyPools,
      allocationState,
      assignments,
      doctorHasGuaranteedCr,
      rng
    );
  }
}

function buildCallCoverageBestOptions_(dailyPools, slotKey, allocationState) {
  const candidates = dailyPools.slotPools[slotKey] || [];
  const options = [null];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (!canAssignCandidateToSlot_(candidate, slotKey, allocationState)) {
      continue;
    }

    options.push(candidate);
  }

  return options;
}

function scoreCallCoverageCombination_(assignmentsBySlot) {
  const callSlotOrder = getCrPrefillCallSlotOrder_();
  let filledCount = 0;
  let crCount = 0;

  for (let i = 0; i < callSlotOrder.length; i++) {
    const slotKey = callSlotOrder[i];
    const assigned = assignmentsBySlot[slotKey];

    if (!assigned) continue;
    filledCount += 1;

    if (assigned.crPreferenceApplies === true) {
      crCount += 1;
    }
  }

  return {
    filledCount: filledCount,
    crCount: crCount
  };
}

function chooseBestCallCoverageCombination_(dailyPools, allocationState, rng) {
  const callSlotOrder = getCrPrefillCallSlotOrder_();
  const micuSlotKey = callSlotOrder[0];
  const mhdSlotKey = callSlotOrder[1];
  const micuOptions = buildCallCoverageBestOptions_(dailyPools, micuSlotKey, allocationState);
  const mhdOptions = buildCallCoverageBestOptions_(dailyPools, mhdSlotKey, allocationState);

  const bestCombinations = [];
  let bestFilledCount = -1;
  let bestCrCount = -1;

  for (let i = 0; i < micuOptions.length; i++) {
    const micuCandidate = micuOptions[i];

    for (let j = 0; j < mhdOptions.length; j++) {
      const mhdCandidate = mhdOptions[j];

      if (micuCandidate && mhdCandidate && micuCandidate.doctorId === mhdCandidate.doctorId) {
        continue;
      }

      const combo = {};
      combo[micuSlotKey] = micuCandidate || null;
      combo[mhdSlotKey] = mhdCandidate || null;

      const score = scoreCallCoverageCombination_(combo);
      const isBetter = score.filledCount > bestFilledCount
        || (score.filledCount === bestFilledCount && score.crCount > bestCrCount);

      if (isBetter) {
        bestFilledCount = score.filledCount;
        bestCrCount = score.crCount;
        bestCombinations.length = 0;
        bestCombinations.push(combo);
      } else if (score.filledCount === bestFilledCount && score.crCount === bestCrCount) {
        bestCombinations.push(combo);
      }
    }
  }

  return pickRandomCandidateFromList_(bestCombinations, rng) || {};
}

function rebalanceCallSlotsForCoverage_(dailyPools, allocationState, assignments, rng) {
  const callSlotOrder = getCrPrefillCallSlotOrder_();

  for (let i = 0; i < callSlotOrder.length; i++) {
    const slotKey = callSlotOrder[i];
    const assigned = assignments[slotKey];

    if (assigned && assigned.doctorId) {
      delete allocationState.usedDoctorIds[assigned.doctorId];
    }
  }

  const bestCombination = chooseBestCallCoverageCombination_(dailyPools, allocationState, rng);

  for (let i = 0; i < callSlotOrder.length; i++) {
    const slotKey = callSlotOrder[i];
    const assigned = bestCombination[slotKey] || null;

    assignments[slotKey] = assigned;

    if (assigned && assigned.doctorId) {
      allocationState.usedDoctorIds[assigned.doctorId] = true;
    }
  }
}

function markGuaranteedCrDoctorsFromCallAssignments_(assignments, doctorHasGuaranteedCr) {
  const guaranteedMap = doctorHasGuaranteedCr || {};
  const callSlotOrder = getCrPrefillCallSlotOrder_();

  for (let i = 0; i < callSlotOrder.length; i++) {
    const slotKey = callSlotOrder[i];
    const assigned = assignments[slotKey];

    if (!assigned || !assigned.doctorId) continue;
    if (assigned.crPreferenceApplies !== true) continue;

    guaranteedMap[assigned.doctorId] = true;
  }
}

function fillRemainingSlotsRandomForDay_(dailyPools, slotOrder, allocationState, assignments, unfilledSlotKeys, rng) {
  for (let i = 0; i < slotOrder.length; i++) {
    const slotKey = slotOrder[i];

    if (assignments[slotKey]) {
      continue;
    }

    const candidates = dailyPools.slotPools[slotKey] || [];
    const picked = pickRandomAvailableCandidate_(candidates, slotKey, allocationState, rng);

    if (picked) {
      assignments[slotKey] = picked;
      allocationState.usedDoctorIds[picked.doctorId] = true;
      continue;
    }

    assignments[slotKey] = null;
    unfilledSlotKeys.push(slotKey);
  }
}

function allocateOneDayRandom_(dailyPools, previousDayCallDoctorIds, rng, doctorHasGuaranteedCr) {
  const slotOrder = ["MICU_CALL", "MHD_CALL", "MICU_STANDBY", "MHD_STANDBY"];
  const allocationState = {
    usedDoctorIds: {},
    previousDayCallDoctorIds: previousDayCallDoctorIds || {}
  };
  const assignments = {};
  const unfilledSlotKeys = [];
  const guaranteedMap = doctorHasGuaranteedCr || {};

  applyCrPrefillForDay_(dailyPools, allocationState, assignments, guaranteedMap, rng);
  rebalanceCallSlotsForCoverage_(dailyPools, allocationState, assignments, rng);
  markGuaranteedCrDoctorsFromCallAssignments_(assignments, guaranteedMap);
  fillRemainingSlotsRandomForDay_(dailyPools, slotOrder, allocationState, assignments, unfilledSlotKeys, rng);

  return {
    dateKey: dailyPools.dateKey,
    assignments: assignments,
    unfilledSlotKeys: unfilledSlotKeys,
    usedDoctorIds: Object.keys(allocationState.usedDoctorIds),
    nextPreviousDayCallDoctorIds: buildNextPreviousDayCallDoctorIds_(assignments)
  };
}

function allocateAllDaysRandom_(candidatePools, rng) {
  const result = {
    ok: false,
    days: [],
    byDateKey: {},
    summary: {
      dateCount: 0,
      totalUnfilledSlotCount: 0,
      daysWithAnyUnfilledSlots: 0
    }
  };

  if (!candidatePools) {
    result.message = "candidatePools is required.";
    return result;
  }

  if (candidatePools.ok !== true) {
    result.message = "Cannot allocate because candidatePools contains errors.";
    return result;
  }

  const days = candidatePools.days || [];
  const random = coerceRandomGenerator_(rng);
  let totalUnfilledSlotCount = 0;
  let daysWithAnyUnfilledSlots = 0;
  let previousDayCallDoctorIds = {};
  const doctorHasGuaranteedCr = {};

  for (let i = 0; i < days.length; i++) {
    const dailyPools = days[i];
    const dailyAllocation = allocateOneDayRandom_(
      dailyPools,
      previousDayCallDoctorIds,
      random,
      doctorHasGuaranteedCr
    );

    result.days.push(dailyAllocation);
    result.byDateKey[dailyAllocation.dateKey] = dailyAllocation;

    totalUnfilledSlotCount += dailyAllocation.unfilledSlotKeys.length;
    if (dailyAllocation.unfilledSlotKeys.length > 0) {
      daysWithAnyUnfilledSlots += 1;
    }

    previousDayCallDoctorIds = dailyAllocation.nextPreviousDayCallDoctorIds || {};
  }

  result.ok = true;
  result.summary.dateCount = days.length;
  result.summary.totalUnfilledSlotCount = totalUnfilledSlotCount;
  result.summary.daysWithAnyUnfilledSlots = daysWithAnyUnfilledSlots;

  return result;
}

function debugAllocateAllDaysRandom() {
  const parseResult = parseRosterSheet();
  if (parseResult.ok !== true) {
    Logger.log(JSON.stringify(parseResult, null, 2));
    return;
  }

  const candidatePools = buildAllCandidatePools_(parseResult);
  if (candidatePools.ok !== true) {
    Logger.log(JSON.stringify(candidatePools, null, 2));
    return;
  }

  const allocationResult = allocateAllDaysRandom_(candidatePools);
  if (allocationResult.ok !== true) {
    Logger.log(JSON.stringify(allocationResult, null, 2));
    return;
  }

  const debugSummary = {
    summary: allocationResult.summary,
    firstDays: []
  };

  const maxDaysToShow = Math.min(7, allocationResult.days.length);

  for (let i = 0; i < maxDaysToShow; i++) {
    const day = allocationResult.days[i];
    const assignedNames = {};
    const slotKeys = Object.keys(day.assignments);

    for (let j = 0; j < slotKeys.length; j++) {
      const slotKey = slotKeys[j];
      const assigned = day.assignments[slotKey];
      assignedNames[slotKey] = assigned ? assigned.fullName : null;
    }

    debugSummary.firstDays.push({
      dateKey: day.dateKey,
      assignedNames: assignedNames,
      unfilledSlotKeys: day.unfilledSlotKeys
    });
  }

  Logger.log(JSON.stringify(debugSummary, null, 2));
}
