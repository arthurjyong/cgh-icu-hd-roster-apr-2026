function getCandidateSlotKeys_() {
  return ["MICU_CALL", "MICU_STANDBY", "MHD_CALL", "MHD_STANDBY"];
}

function isDoctorEligibleForSlot_(doctor, slotKey) {
  if (!doctor || !doctor.eligibleSlots) return false;
  return doctor.eligibleSlots.indexOf(slotKey) !== -1;
}

function getAvailabilityEntry_(parseResult, doctorId, dateKey) {
  if (!parseResult || !parseResult.availabilityMap) return null;
  if (!parseResult.availabilityMap[doctorId]) return null;
  return parseResult.availabilityMap[doctorId][dateKey] || null;
}

function isDoctorHardBlockedOnDate_(availabilityEntry) {
  if (!availabilityEntry) return true;
  return availabilityEntry.sameDayHardBlocked === true;
}

function buildCandidateRecord_(doctor, slotKey, dateKey, availabilityEntry) {
  return {
    doctorId: doctor.doctorId,
    fullName: doctor.fullName,
    section: doctor.section,
    sourceRow: doctor.sourceRow,
    slotKey: slotKey,
    dateKey: dateKey,
    crPreferenceApplies: availabilityEntry.crPreferenceApplies === true,
    prevDaySoftPenaltyApplies: availabilityEntry.prevDaySoftPenaltyApplies === true,
    prevDaySoftPenaltySourceDate: availabilityEntry.prevDaySoftPenaltySourceDate || null,
    rawText: availabilityEntry.rawText || "",
    codes: availabilityEntry.codes || []
  };
}

function getEligibleDoctorsForSlotOnDate_(slotKey, dateKey, parseResult) {
  const candidates = [];
  const doctors = parseResult.doctors || [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];

    if (!isDoctorEligibleForSlot_(doctor, slotKey)) continue;

    const availabilityEntry = getAvailabilityEntry_(parseResult, doctor.doctorId, dateKey);
    if (isDoctorHardBlockedOnDate_(availabilityEntry)) continue;

    candidates.push(buildCandidateRecord_(doctor, slotKey, dateKey, availabilityEntry));
  }

  return candidates;
}

function buildDailyCandidatePools_(dateKey, parseResult) {
  const slotKeys = getCandidateSlotKeys_();
  const slotPools = {};
  const emptySlotKeys = [];

  for (let i = 0; i < slotKeys.length; i++) {
    const slotKey = slotKeys[i];
    const candidates = getEligibleDoctorsForSlotOnDate_(slotKey, dateKey, parseResult);

    slotPools[slotKey] = candidates;

    if (candidates.length === 0) {
      emptySlotKeys.push(slotKey);
    }
  }

  return {
    dateKey: dateKey,
    slotPools: slotPools,
    emptySlotKeys: emptySlotKeys
  };
}

function buildAllCandidatePools_(parseResult) {
  const result = {
    ok: false,
    slotKeys: getCandidateSlotKeys_(),
    days: [],
    byDateKey: {},
    summary: {
      dateCount: 0,
      emptySlotCount: 0
    }
  };

  if (!parseResult) {
    result.message = "parseResult is required.";
    return result;
  }

  if (parseResult.ok !== true) {
    result.message = "Cannot build candidate pools because parseResult contains errors.";
    return result;
  }

  const calendarDays = parseResult.calendarDays || [];
  let emptySlotCount = 0;

  for (let i = 0; i < calendarDays.length; i++) {
    const dateKey = calendarDays[i].dateKey;
    const dailyPools = buildDailyCandidatePools_(dateKey, parseResult);

    result.days.push(dailyPools);
    result.byDateKey[dateKey] = dailyPools;
    emptySlotCount += dailyPools.emptySlotKeys.length;
  }

  result.ok = true;
  result.summary.dateCount = calendarDays.length;
  result.summary.emptySlotCount = emptySlotCount;

  return result;
}

function debugBuildCandidatePools_() {
  const parseResult = parseRosterSheet();
  const candidatePools = buildAllCandidatePools_(parseResult);
  Logger.log(JSON.stringify(candidatePools, null, 2));
}

function debugBuildCandidatePoolsForFirstDate_() {
  const parseResult = parseRosterSheet();
  const candidatePools = buildAllCandidatePools_(parseResult);

  if (!candidatePools.ok) {
    Logger.log(JSON.stringify(candidatePools, null, 2));
    return;
  }

  if (candidatePools.days.length === 0) {
    Logger.log("No calendar days found.");
    return;
  }

  Logger.log(JSON.stringify(candidatePools.days[0], null, 2));
}

function debugCandidatePoolSummaryForFirstDate() {
  const parseResult = parseRosterSheet();
  const candidatePools = buildAllCandidatePools_(parseResult);

  if (!candidatePools.ok) {
    Logger.log(JSON.stringify(candidatePools, null, 2));
    return;
  }

  const day = candidatePools.days[0];
  const slotKeys = Object.keys(day.slotPools);

  const summary = {
    dateKey: day.dateKey,
    counts: {},
    names: {}
  };

  for (let i = 0; i < slotKeys.length; i++) {
    const slotKey = slotKeys[i];
    const pool = day.slotPools[slotKey];

    summary.counts[slotKey] = pool.length;
    summary.names[slotKey] = pool.map(function(c) {
      return c.fullName;
    });
  }

  Logger.log(JSON.stringify(summary, null, 2));
}