function getCallSlotKeys_() {
  return ["MICU_CALL", "MHD_CALL"];
}

function isCallSlot_(slotKey) {
  return getCallSlotKeys_().indexOf(slotKey) !== -1;
}

function wasDoctorOnCallPreviousDay_(doctorId, allocationState) {
  if (!allocationState || !allocationState.previousDayCallDoctorIds) return false;
  return allocationState.previousDayCallDoctorIds[doctorId] === true;
}

function canAssignCandidateToSlot_(candidate, slotKey, allocationState) {
  if (!candidate) return false;

  const usedDoctorIds = allocationState && allocationState.usedDoctorIds
    ? allocationState.usedDoctorIds
    : {};

  if (usedDoctorIds[candidate.doctorId]) {
    return false;
  }

  if (isCallSlot_(slotKey) && wasDoctorOnCallPreviousDay_(candidate.doctorId, allocationState)) {
    return false;
  }

  return true;
}

function buildNextPreviousDayCallDoctorIds_(assignments) {
  const result = {};
  const callSlotKeys = getCallSlotKeys_();

  for (let i = 0; i < callSlotKeys.length; i++) {
    const slotKey = callSlotKeys[i];
    const assigned = assignments[slotKey];

    if (assigned && assigned.doctorId) {
      result[assigned.doctorId] = true;
    }
  }

  return result;
}

function findBackToBackCallViolations_(allocationResult) {
  const violations = [];
  const days = allocationResult && allocationResult.days ? allocationResult.days : [];
  let previousDayCallDoctorIds = {};

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const callSlotKeys = getCallSlotKeys_();

    for (let j = 0; j < callSlotKeys.length; j++) {
      const slotKey = callSlotKeys[j];
      const assigned = day.assignments[slotKey];

      if (assigned && previousDayCallDoctorIds[assigned.doctorId]) {
        violations.push({
          dateKey: day.dateKey,
          slotKey: slotKey,
          doctorId: assigned.doctorId,
          fullName: assigned.fullName
        });
      }
    }

    previousDayCallDoctorIds = buildNextPreviousDayCallDoctorIds_(day.assignments);
  }

  return violations;
}

function debugCheckBackToBackCallsRandom() {
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

  const violations = findBackToBackCallViolations_(allocationResult);

  Logger.log(JSON.stringify({
    violationCount: violations.length,
    violations: violations
  }, null, 2));
}