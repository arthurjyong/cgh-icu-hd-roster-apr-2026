function allocateAllDaysGreedy_(candidatePools) {
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
    const dailyAllocation = allocateOneDayGreedy_(dailyPools, previousDayCallDoctorIds);

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

function debugAllocateAllDaysGreedy() {
  const parseResult = parseRosterSheet();
  const candidatePools = buildAllCandidatePools_(parseResult);
  const allocationResult = allocateAllDaysGreedy_(candidatePools);

  if (!allocationResult.ok) {
    Logger.log(JSON.stringify(allocationResult, null, 2));
    return;
  }

  const debugSummary = {
    summary: allocationResult.summary,
    days: []
  };

  for (let i = 0; i < allocationResult.days.length; i++) {
    const day = allocationResult.days[i];
    const assignedNames = {};
    const slotKeys = Object.keys(day.assignments);

    for (let j = 0; j < slotKeys.length; j++) {
      const slotKey = slotKeys[j];
      const assigned = day.assignments[slotKey];
      assignedNames[slotKey] = assigned ? assigned.fullName : null;
    }

    debugSummary.days.push({
      dateKey: day.dateKey,
      assignedNames: assignedNames,
      unfilledSlotKeys: day.unfilledSlotKeys
    });
  }

  Logger.log(JSON.stringify(debugSummary, null, 2));
}