function shuffleArray_(items) {
  const copy = items.slice();

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function pickRandomAvailableCandidate_(candidates, slotKey, allocationState) {
  if (!candidates || candidates.length === 0) return null;

  const available = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (canAssignCandidateToSlot_(candidate, slotKey, allocationState)) {
      available.push(candidate);
    }
  }

  if (available.length === 0) return null;

  const shuffled = shuffleArray_(available);
  return shuffled[0];
}

function allocateOneDayRandom_(dailyPools, previousDayCallDoctorIds) {
  const slotOrder = ["MICU_CALL", "MHD_CALL", "MICU_STANDBY", "MHD_STANDBY"];
  const allocationState = {
    usedDoctorIds: {},
    previousDayCallDoctorIds: previousDayCallDoctorIds || {}
  };
  const assignments = {};
  const unfilledSlotKeys = [];

  for (let i = 0; i < slotOrder.length; i++) {
    const slotKey = slotOrder[i];
    const candidates = dailyPools.slotPools[slotKey] || [];
    const picked = pickRandomAvailableCandidate_(candidates, slotKey, allocationState);

    if (picked) {
      assignments[slotKey] = picked;
      allocationState.usedDoctorIds[picked.doctorId] = true;
    } else {
      assignments[slotKey] = null;
      unfilledSlotKeys.push(slotKey);
    }
  }

  return {
    dateKey: dailyPools.dateKey,
    assignments: assignments,
    unfilledSlotKeys: unfilledSlotKeys,
    usedDoctorIds: Object.keys(allocationState.usedDoctorIds),
    nextPreviousDayCallDoctorIds: buildNextPreviousDayCallDoctorIds_(assignments)
  };
}

function allocateAllDaysRandom_(candidatePools) {
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
  let totalUnfilledSlotCount = 0;
  let daysWithAnyUnfilledSlots = 0;
  let previousDayCallDoctorIds = {};

  for (let i = 0; i < days.length; i++) {
    const dailyPools = days[i];
    const dailyAllocation = allocateOneDayRandom_(dailyPools, previousDayCallDoctorIds);

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