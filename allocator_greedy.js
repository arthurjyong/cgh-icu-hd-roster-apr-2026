function pickFirstAvailableCandidate_(candidates, slotKey, allocationState) {
  if (!candidates || candidates.length === 0) return null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (canAssignCandidateToSlot_(candidate, slotKey, allocationState)) {
      return candidate;
    }
  }

  return null;
}

function allocateOneDayGreedy_(dailyPools, previousDayCallDoctorIds) {
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
    const picked = pickFirstAvailableCandidate_(candidates, slotKey, allocationState);

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

function debugAllocateFirstDateGreedy() {
  const parseResult = parseRosterSheet();
  const candidatePools = buildAllCandidatePools_(parseResult);

  if (!candidatePools.ok) {
    Logger.log(JSON.stringify(candidatePools, null, 2));
    return;
  }

  if (!candidatePools.days || candidatePools.days.length === 0) {
    Logger.log("No candidate-pool days found.");
    return;
  }

  const firstDayPools = candidatePools.days[0];
  const allocation = allocateOneDayGreedy_(firstDayPools, {});

  const summary = {
    dateKey: allocation.dateKey,
    assignedNames: {},
    unfilledSlotKeys: allocation.unfilledSlotKeys
  };

  const slotKeys = Object.keys(allocation.assignments);
  for (let i = 0; i < slotKeys.length; i++) {
    const slotKey = slotKeys[i];
    const assigned = allocation.assignments[slotKey];
    summary.assignedNames[slotKey] = assigned ? assigned.fullName : null;
  }

  Logger.log(JSON.stringify(summary, null, 2));
}