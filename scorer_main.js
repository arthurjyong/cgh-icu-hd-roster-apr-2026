function buildDoctorLookup_(parseResult) {
  const byDoctorId = {};
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    byDoctorId[doctor.doctorId] = doctor;
  }

  return byDoctorId;
}

function getScoringContractVersion_() {
  return 2;
}

function getScorerLogicVersion_() {
  return "phase3_scorer_identity_v2_cr_reward_decay";
}

function getScorerComponentKeys_() {
  return [
    "unfilledPenalty",
    "pointBalanceWithinSection",
    "pointBalanceGlobal",
    "spacingPenalty",
    "preLeavePenalty",
    "crReward",
    "dualEligibleIcuBonus",
    "standbyAdjacencyPenalty",
    "standbyCountFairnessPenalty"
  ];
}

function buildCalendarDayLookup_(parseResult) {
  const byDateKey = {};
  const calendarDays = parseResult && parseResult.calendarDays ? parseResult.calendarDays : [];

  for (let i = 0; i < calendarDays.length; i++) {
    const day = calendarDays[i];
    byDateKey[day.dateKey] = day;
  }

  return byDateKey;
}

function initializeDoctorNumericMap_(parseResult, initialValue) {
  const map = {};
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    map[doctor.doctorId] = initialValue;
  }

  return map;
}

function addAssignedCallPoints_(totalsByDoctorId, assigned, points) {
  if (!assigned || !assigned.doctorId) return;
  if (typeof totalsByDoctorId[assigned.doctorId] !== "number") {
    totalsByDoctorId[assigned.doctorId] = 0;
  }

  totalsByDoctorId[assigned.doctorId] += points || 0;
}

function buildDoctorPointSummaryRows_(totalsByDoctorId, parseResult) {
  const rows = [];
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    rows.push({
      doctorId: doctor.doctorId,
      fullName: doctor.fullName,
      section: doctor.section,
      sourceRow: doctor.sourceRow,
      totalCallPoints: totalsByDoctorId[doctor.doctorId] || 0
    });
  }

  return rows;
}

function buildDoctorNameTotalsFromRows_(rows) {
  const totalsByDoctorName = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    totalsByDoctorName[row.fullName] = row.totalCallPoints;
  }

  return totalsByDoctorName;
}

function computeDoctorPointTotals_(allocationResult, parseResult) {
  const totalsByDoctorId = initializeDoctorNumericMap_(parseResult, 0);
  const calendarDayByDateKey = buildCalendarDayLookup_(parseResult);
  const allocationDays = allocationResult && allocationResult.days ? allocationResult.days : [];

  for (let i = 0; i < allocationDays.length; i++) {
    const allocationDay = allocationDays[i];
    const calendarDay = calendarDayByDateKey[allocationDay.dateKey];

    if (!calendarDay) continue;

    const micuAssigned = allocationDay.assignments.MICU_CALL;
    const mhdAssigned = allocationDay.assignments.MHD_CALL;

    addAssignedCallPoints_(totalsByDoctorId, micuAssigned, calendarDay.micuCallPoints || 0);
    addAssignedCallPoints_(totalsByDoctorId, mhdAssigned, calendarDay.mhdCallPoints || 0);
  }

  const rows = buildDoctorPointSummaryRows_(totalsByDoctorId, parseResult);
  const totalsByDoctorName = buildDoctorNameTotalsFromRows_(rows);

  return {
    byDoctorId: totalsByDoctorId,
    byDoctorName: totalsByDoctorName,
    rows: rows,

    // Legacy aliases kept for pipeline compatibility during scorer refactor.
    totalsByDoctorId: totalsByDoctorId,
    totalsByDoctorName: totalsByDoctorName
  };
}

function buildDateIndexLookup_(parseResult) {
  const dateIndexByDateKey = {};
  const dateKeyByDateIndex = {};
  const calendarDays = parseResult && parseResult.calendarDays ? parseResult.calendarDays : [];

  for (let i = 0; i < calendarDays.length; i++) {
    const day = calendarDays[i];
    dateIndexByDateKey[day.dateKey] = day.index;
    dateKeyByDateIndex[day.index] = day.dateKey;
  }

  return {
    dateIndexByDateKey: dateIndexByDateKey,
    dateKeyByDateIndex: dateKeyByDateIndex
  };
}

function isCallSlotKey_(slotKey) {
  return slotKey === "MICU_CALL" || slotKey === "MHD_CALL";
}

function isStandbySlotKey_(slotKey) {
  return slotKey === "MICU_STANDBY" || slotKey === "MHD_STANDBY";
}

function getCallPointsForSlot_(slotKey, calendarDay) {
  if (!calendarDay) return 0;
  if (slotKey === "MICU_CALL") return calendarDay.micuCallPoints || 0;
  if (slotKey === "MHD_CALL") return calendarDay.mhdCallPoints || 0;
  return 0;
}

function initializeDoctorTimelineMap_(parseResult) {
  const map = {};
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    map[doctor.doctorId] = {
      doctorId: doctor.doctorId,
      fullName: doctor.fullName,
      section: doctor.section,
      sourceRow: doctor.sourceRow,
      eligibleSlots: doctor.eligibleSlots ? doctor.eligibleSlots.slice() : [],
      canDoMICU: !!doctor.canDoMICU,
      canDoMHD: !!doctor.canDoMHD,

      callPointsTotal: 0,
      standbyCount: 0,
      crSatisfiedCount: 0,

      callDateKeys: [],
      standbyDateKeys: [],

      callAssignments: [],
      standbyAssignments: []
    };
  }

  return map;
}

function ensureDoctorTimeline_(timelinesByDoctorId, doctorById, doctorId) {
  if (timelinesByDoctorId[doctorId]) {
    return timelinesByDoctorId[doctorId];
  }

  const doctor = doctorById[doctorId] || {};

  timelinesByDoctorId[doctorId] = {
    doctorId: doctorId,
    fullName: doctor.fullName || doctorId,
    section: doctor.section || null,
    sourceRow: doctor.sourceRow || null,
    eligibleSlots: doctor.eligibleSlots ? doctor.eligibleSlots.slice() : [],
    canDoMICU: !!doctor.canDoMICU,
    canDoMHD: !!doctor.canDoMHD,

    callPointsTotal: 0,
    standbyCount: 0,
    crSatisfiedCount: 0,

    callDateKeys: [],
    standbyDateKeys: [],

    callAssignments: [],
    standbyAssignments: []
  };

  return timelinesByDoctorId[doctorId];
}

function buildDoctorTimelineSummaryRows_(timelinesByDoctorId, parseResult) {
  const rows = [];
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    const timeline = timelinesByDoctorId[doctor.doctorId];

    rows.push({
      doctorId: timeline.doctorId,
      fullName: timeline.fullName,
      section: timeline.section,
      sourceRow: timeline.sourceRow,

      totalCallPoints: timeline.callPointsTotal,
      callPointsTotal: timeline.callPointsTotal,
      standbyCount: timeline.standbyCount,
      crSatisfiedCount: timeline.crSatisfiedCount,

      callCount: timeline.callAssignments.length,
      standbyAssignmentCount: timeline.standbyAssignments.length,

      callDateKeys: timeline.callDateKeys.slice(),
      standbyDateKeys: timeline.standbyDateKeys.slice(),

      callAssignments: timeline.callAssignments.slice(),
      standbyAssignments: timeline.standbyAssignments.slice()
    });
  }

  return rows;
}

function buildDoctorTimelineSummaries_(allocationResult, parseResult) {
  const timelinesByDoctorId = initializeDoctorTimelineMap_(parseResult);
  const doctorById = buildDoctorLookup_(parseResult);
  const calendarDayByDateKey = buildCalendarDayLookup_(parseResult);
  const dateLookups = buildDateIndexLookup_(parseResult);
  const availabilityMap = parseResult && parseResult.availabilityMap ? parseResult.availabilityMap : {};
  const allocationDays = allocationResult && allocationResult.days ? allocationResult.days : [];

  for (let i = 0; i < allocationDays.length; i++) {
    const allocationDay = allocationDays[i];
    const dateKey = allocationDay.dateKey;
    const dateIndex = typeof dateLookups.dateIndexByDateKey[dateKey] === "number"
      ? dateLookups.dateIndexByDateKey[dateKey]
      : null;
    const calendarDay = calendarDayByDateKey[dateKey];
    const assignments = allocationDay.assignments || {};
    const slotKeys = Object.keys(assignments);

    for (let j = 0; j < slotKeys.length; j++) {
      const slotKey = slotKeys[j];
      const assigned = assignments[slotKey];

      if (!assigned || !assigned.doctorId) continue;

      const doctorId = assigned.doctorId;
      const timeline = ensureDoctorTimeline_(timelinesByDoctorId, doctorById, doctorId);
      const doctorAvailability = availabilityMap[doctorId] && availabilityMap[doctorId][dateKey]
        ? availabilityMap[doctorId][dateKey]
        : null;

      const crPreferenceApplies = doctorAvailability
        ? !!doctorAvailability.crPreferenceApplies
        : !!assigned.crPreferenceApplies;

      const prevDaySoftPenaltyApplies = doctorAvailability
        ? !!doctorAvailability.prevDaySoftPenaltyApplies
        : !!assigned.prevDaySoftPenaltyApplies;

      const prevDaySoftPenaltySourceDate = doctorAvailability
        ? doctorAvailability.prevDaySoftPenaltySourceDate || null
        : assigned.prevDaySoftPenaltySourceDate || null;

      const prevDaySoftPenaltyReasonCodes = doctorAvailability && doctorAvailability.prevDaySoftPenaltyReasonCodes
        ? doctorAvailability.prevDaySoftPenaltyReasonCodes.slice()
        : [];

      if (isCallSlotKey_(slotKey)) {
        const points = getCallPointsForSlot_(slotKey, calendarDay);

        timeline.callPointsTotal += points;
        timeline.callDateKeys.push(dateKey);

        timeline.callAssignments.push({
          dateKey: dateKey,
          dateIndex: dateIndex,
          slotKey: slotKey,
          points: points,
          crPreferenceApplies: crPreferenceApplies,
          prevDaySoftPenaltyApplies: prevDaySoftPenaltyApplies,
          prevDaySoftPenaltySourceDate: prevDaySoftPenaltySourceDate,
          prevDaySoftPenaltyReasonCodes: prevDaySoftPenaltyReasonCodes,
          rawText: assigned.rawText || "",
          codes: assigned.codes ? assigned.codes.slice() : []
        });

        if (crPreferenceApplies) {
          timeline.crSatisfiedCount += 1;
        }
      } else if (isStandbySlotKey_(slotKey)) {
        timeline.standbyCount += 1;
        timeline.standbyDateKeys.push(dateKey);

        timeline.standbyAssignments.push({
          dateKey: dateKey,
          dateIndex: dateIndex,
          slotKey: slotKey,
          crPreferenceApplies: crPreferenceApplies,
          prevDaySoftPenaltyApplies: prevDaySoftPenaltyApplies,
          prevDaySoftPenaltySourceDate: prevDaySoftPenaltySourceDate,
          prevDaySoftPenaltyReasonCodes: prevDaySoftPenaltyReasonCodes,
          rawText: assigned.rawText || "",
          codes: assigned.codes ? assigned.codes.slice() : []
        });
      }
    }
  }

  const rows = buildDoctorTimelineSummaryRows_(timelinesByDoctorId, parseResult);

  return {
    byDoctorId: timelinesByDoctorId,
    rows: rows
  };
}

function buildStandbyTotalsSummary_(doctorTimelineRows) {
  const byDoctorId = {};
  const byDoctorName = {};
  const rows = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const standbyCount = row.standbyCount || 0;

    byDoctorId[row.doctorId] = standbyCount;
    byDoctorName[row.fullName] = standbyCount;

    rows.push({
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      standbyCount: standbyCount
    });
  }

  return {
    byDoctorId: byDoctorId,
    byDoctorName: byDoctorName,
    rows: rows
  };
}

function buildCrSatisfiedCountsSummary_(doctorTimelineRows) {
  const byDoctorId = {};
  const byDoctorName = {};
  const rows = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const crSatisfiedCount = row.crSatisfiedCount || 0;

    byDoctorId[row.doctorId] = crSatisfiedCount;
    byDoctorName[row.fullName] = crSatisfiedCount;

    rows.push({
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      crSatisfiedCount: crSatisfiedCount
    });
  }

  return {
    byDoctorId: byDoctorId,
    byDoctorName: byDoctorName,
    rows: rows
  };
}

function buildScoringContext_(allocationResult, parseResult) {
  const doctors = parseResult && parseResult.doctors ? parseResult.doctors : [];
  const calendarDays = parseResult && parseResult.calendarDays ? parseResult.calendarDays : [];
  const allocationDays = allocationResult && allocationResult.days ? allocationResult.days : [];
  const dateLookups = buildDateIndexLookup_(parseResult);
  const pointTotals = computeDoctorPointTotals_(allocationResult, parseResult);
  const doctorTimelines = buildDoctorTimelineSummaries_(allocationResult, parseResult);

  return {
    allocationResult: allocationResult,
    parseResult: parseResult,
    doctors: doctors,
    calendarDays: calendarDays,
    allocationDays: allocationDays,
    doctorById: buildDoctorLookup_(parseResult),
    calendarDayByDateKey: buildCalendarDayLookup_(parseResult),
    dateIndexByDateKey: dateLookups.dateIndexByDateKey,
    dateKeyByDateIndex: dateLookups.dateKeyByDateIndex,
    pointTotals: pointTotals,
    doctorTimelines: doctorTimelines
  };
}

function getDefaultScorerWeights_() {
  return {
    UNFILLED_SLOT_PENALTY_MULTIPLIER: 1000000,
    WITHIN_SECTION_POINT_BALANCE_WEIGHT: 3,
    GLOBAL_POINT_BALANCE_WEIGHT: 1,
    BASE_SHORT_GAP_CALL_PENALTY: 256,
    MAX_SOFT_GAP_DAYS: 6,
    PRE_LEAVE_CALL_PENALTY: 300,
    CR_CALL_REWARD: 220,
    DUAL_ELIGIBLE_ICU_CALL_BONUS: 40,
    STANDBY_ADJACENT_TO_CALL_PENALTY: 60,
    STANDBY_COUNT_FAIRNESS_WEIGHT: 2
  };
}

function computeUnfilledPenalty_(allocationResult, scorerWeights) {
  const unfilledSlotCount = allocationResult && allocationResult.summary
    ? allocationResult.summary.totalUnfilledSlotCount || 0
    : 0;

  const multiplier = scorerWeights.UNFILLED_SLOT_PENALTY_MULTIPLIER;
  const score = unfilledSlotCount * multiplier;

  return {
    score: score,
    count: unfilledSlotCount,
    multiplier: multiplier
  };
}

function computePointBalanceWithinSectionPenalty_(scoringContext, scorerWeights) {
  const rows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const valuesBySection = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const section = row.section || "UNKNOWN";

    if (!valuesBySection[section]) {
      valuesBySection[section] = [];
    }

    valuesBySection[section].push(row.callPointsTotal || row.totalCallPoints || 0);
  }

  const sectionKeys = Object.keys(valuesBySection).sort();
  const bySection = {};
  let rawSumSquaredDeviation = 0;

  for (let i = 0; i < sectionKeys.length; i++) {
    const sectionKey = sectionKeys[i];
    const values = valuesBySection[sectionKey];

    if (values.length === 0) {
      bySection[sectionKey] = {
        doctorCount: 0,
        meanPoints: 0,
        minPoints: 0,
        maxPoints: 0,
        range: 0,
        variance: 0,
        standardDeviation: 0,
        sumSquaredDeviation: 0
      };
      continue;
    }

    let sum = 0;
    let min = values[0];
    let max = values[0];

    for (let j = 0; j < values.length; j++) {
      const value = values[j];
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const mean = sum / values.length;

    let sumSquaredDeviation = 0;
    for (let j = 0; j < values.length; j++) {
      const diff = values[j] - mean;
      sumSquaredDeviation += diff * diff;
    }

    const variance = sumSquaredDeviation / values.length;
    const standardDeviation = Math.sqrt(variance);
    const range = max - min;

    bySection[sectionKey] = {
      doctorCount: values.length,
      meanPoints: mean,
      minPoints: min,
      maxPoints: max,
      range: range,
      variance: variance,
      standardDeviation: standardDeviation,
      sumSquaredDeviation: sumSquaredDeviation
    };

    rawSumSquaredDeviation += sumSquaredDeviation;
  }

  const weight = scorerWeights.WITHIN_SECTION_POINT_BALANCE_WEIGHT;
  const score = rawSumSquaredDeviation * weight;

  return {
    ok: true,
    weight: weight,
    rawSumSquaredDeviation: rawSumSquaredDeviation,
    score: score,
    bySection: bySection
  };
}

function getShortGapCallPenalty_(gapDays, scorerWeights) {
  const baseShortGapCallPenalty = scorerWeights.BASE_SHORT_GAP_CALL_PENALTY;
  const maxSoftGapDays = scorerWeights.MAX_SOFT_GAP_DAYS;

  // gap 1 is handled as a hard invalid rule outside scorer
  if (gapDays < 2) return 0;
  if (gapDays > maxSoftGapDays) return 0;

  return baseShortGapCallPenalty / Math.pow(2, gapDays - 2);
}

function computeSpacingPenalty_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  let totalShortGapCount = 0;
  let totalScore = 0;
  const byDoctorId = {};
  const occurrences = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const callAssignments = row.callAssignments ? row.callAssignments.slice() : [];

    callAssignments.sort(function(a, b) {
      const aIndex = typeof a.dateIndex === "number" ? a.dateIndex : Number.POSITIVE_INFINITY;
      const bIndex = typeof b.dateIndex === "number" ? b.dateIndex : Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });

    let doctorShortGapCount = 0;
    let doctorScore = 0;
    const doctorOccurrences = [];

    for (let j = 1; j < callAssignments.length; j++) {
      const previousCall = callAssignments[j - 1];
      const currentCall = callAssignments[j];

      if (typeof previousCall.dateIndex !== "number" || typeof currentCall.dateIndex !== "number") {
        continue;
      }

      const gapDays = currentCall.dateIndex - previousCall.dateIndex;
      const penalty = getShortGapCallPenalty_(gapDays, scorerWeights);

      if (penalty <= 0) {
        continue;
      }

      doctorShortGapCount += 1;
      totalShortGapCount += 1;
      doctorScore += penalty;
      totalScore += penalty;

      const occurrence = {
        doctorId: row.doctorId,
        fullName: row.fullName,
        section: row.section,
        previousDateKey: previousCall.dateKey,
        previousSlotKey: previousCall.slotKey,
        currentDateKey: currentCall.dateKey,
        currentSlotKey: currentCall.slotKey,
        gapDays: gapDays,
        penalty: penalty
      };

      doctorOccurrences.push(occurrence);
      occurrences.push(occurrence);
    }

    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      shortGapCount: doctorShortGapCount,
      score: doctorScore,
      occurrences: doctorOccurrences
    };
  }

  return {
    ok: true,
    basePenalty: scorerWeights.BASE_SHORT_GAP_CALL_PENALTY,
    maxSoftGapDays: scorerWeights.MAX_SOFT_GAP_DAYS,
    shortGapCount: totalShortGapCount,
    score: totalScore,
    byDoctorId: byDoctorId,
    occurrences: occurrences
  };
}

function computePreLeavePenalty_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const preLeaveCallPenalty = scorerWeights.PRE_LEAVE_CALL_PENALTY;

  let preLeaveCount = 0;
  let totalScore = 0;
  const byDoctorId = {};
  const occurrences = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const callAssignments = row.callAssignments ? row.callAssignments.slice() : [];

    let doctorPreLeaveCount = 0;
    let doctorScore = 0;
    const doctorOccurrences = [];

    for (let j = 0; j < callAssignments.length; j++) {
      const assignment = callAssignments[j];

      if (!assignment.prevDaySoftPenaltyApplies) {
        continue;
      }

      doctorPreLeaveCount += 1;
      preLeaveCount += 1;
      doctorScore += preLeaveCallPenalty;
      totalScore += preLeaveCallPenalty;

      const occurrence = {
        doctorId: row.doctorId,
        fullName: row.fullName,
        section: row.section,
        dateKey: assignment.dateKey,
        slotKey: assignment.slotKey,
        prevDaySoftPenaltySourceDate: assignment.prevDaySoftPenaltySourceDate || null,
        prevDaySoftPenaltyReasonCodes: assignment.prevDaySoftPenaltyReasonCodes
          ? assignment.prevDaySoftPenaltyReasonCodes.slice()
          : [],
        penalty: preLeaveCallPenalty
      };

      doctorOccurrences.push(occurrence);
      occurrences.push(occurrence);
    }

    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      preLeaveCount: doctorPreLeaveCount,
      score: doctorScore,
      occurrences: doctorOccurrences
    };
  }

  return {
    ok: true,
    penaltyPerOccurrence: preLeaveCallPenalty,
    preLeaveCount: preLeaveCount,
    score: totalScore,
    byDoctorId: byDoctorId,
    occurrences: occurrences
  };
}

function computeCrReward_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const crCallReward = scorerWeights.CR_CALL_REWARD;
  const crRewardDecayFactor = 0.5;

  let satisfiedCrCallCount = 0;
  let totalScore = 0;
  const byDoctorId = {};
  const occurrences = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const callAssignments = row.callAssignments ? row.callAssignments.slice() : [];

    let doctorSatisfiedCount = 0;
    let doctorScore = 0;
    const doctorOccurrences = [];

    for (let j = 0; j < callAssignments.length; j++) {
      const assignment = callAssignments[j];

      if (!assignment.crPreferenceApplies) {
        continue;
      }

      const rewardMultiplier = Math.pow(crRewardDecayFactor, doctorSatisfiedCount);
      const reward = crCallReward * rewardMultiplier;

      doctorSatisfiedCount += 1;
      satisfiedCrCallCount += 1;
      doctorScore += reward;
      totalScore += reward;

      const occurrence = {
        doctorId: row.doctorId,
        fullName: row.fullName,
        section: row.section,
        dateKey: assignment.dateKey,
        slotKey: assignment.slotKey,
        reward: reward,
        rewardMultiplier: rewardMultiplier,
        rewardBase: crCallReward,
        rawText: assignment.rawText || "",
        codes: assignment.codes ? assignment.codes.slice() : []
      };

      doctorOccurrences.push(occurrence);
      occurrences.push(occurrence);
    }

    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      satisfiedCrCallCount: doctorSatisfiedCount,
      score: doctorScore,
      occurrences: doctorOccurrences
    };
  }

  return {
    ok: true,
    rewardPerOccurrence: crCallReward,
    rewardDecayFactor: crRewardDecayFactor,
    satisfiedCrCallCount: satisfiedCrCallCount,
    score: totalScore,
    byDoctorId: byDoctorId,
    occurrences: occurrences
  };
}

function computeDualEligibleIcuBonus_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const dualEligibleIcuCallBonus = scorerWeights.DUAL_ELIGIBLE_ICU_CALL_BONUS;

  let dualEligibleIcuCallCount = 0;
  let totalScore = 0;
  const byDoctorId = {};
  const occurrences = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const callAssignments = row.callAssignments ? row.callAssignments.slice() : [];

    let doctorCount = 0;
    let doctorScore = 0;
    const doctorOccurrences = [];

    for (let j = 0; j < callAssignments.length; j++) {
      const assignment = callAssignments[j];

      if (row.section !== "ICU_HD") {
        continue;
      }

      if (assignment.slotKey !== "MICU_CALL") {
        continue;
      }

      doctorCount += 1;
      dualEligibleIcuCallCount += 1;
      doctorScore += dualEligibleIcuCallBonus;
      totalScore += dualEligibleIcuCallBonus;

      const occurrence = {
        doctorId: row.doctorId,
        fullName: row.fullName,
        section: row.section,
        dateKey: assignment.dateKey,
        slotKey: assignment.slotKey,
        bonus: dualEligibleIcuCallBonus
      };

      doctorOccurrences.push(occurrence);
      occurrences.push(occurrence);
    }

    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      dualEligibleIcuCallCount: doctorCount,
      score: doctorScore,
      occurrences: doctorOccurrences
    };
  }

  return {
    ok: true,
    bonusPerOccurrence: dualEligibleIcuCallBonus,
    dualEligibleIcuCallCount: dualEligibleIcuCallCount,
    score: totalScore,
    byDoctorId: byDoctorId,
    occurrences: occurrences
  };
}

function computeStandbyAdjacencyPenalty_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const standbyAdjacentToCallPenalty = scorerWeights.STANDBY_ADJACENT_TO_CALL_PENALTY;

  let adjacentPairCount = 0;
  let totalScore = 0;
  const byDoctorId = {};
  const occurrences = [];

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const callAssignments = row.callAssignments ? row.callAssignments.slice() : [];
    const standbyAssignments = row.standbyAssignments ? row.standbyAssignments.slice() : [];

    const callByDateIndex = {};
    for (let j = 0; j < callAssignments.length; j++) {
      const callAssignment = callAssignments[j];
      if (typeof callAssignment.dateIndex !== "number") continue;
      callByDateIndex[callAssignment.dateIndex] = callAssignment;
    }

    let doctorAdjacentPairCount = 0;
    let doctorScore = 0;
    const doctorOccurrences = [];

    for (let j = 0; j < standbyAssignments.length; j++) {
      const standbyAssignment = standbyAssignments[j];

      if (typeof standbyAssignment.dateIndex !== "number") {
        continue;
      }

      const standbyDateIndex = standbyAssignment.dateIndex;
      const previousCall = callByDateIndex[standbyDateIndex - 1] || null;
      const nextCall = callByDateIndex[standbyDateIndex + 1] || null;

      if (previousCall) {
        doctorAdjacentPairCount += 1;
        adjacentPairCount += 1;
        doctorScore += standbyAdjacentToCallPenalty;
        totalScore += standbyAdjacentToCallPenalty;

        const occurrence = {
          doctorId: row.doctorId,
          fullName: row.fullName,
          section: row.section,
          standbyDateKey: standbyAssignment.dateKey,
          standbySlotKey: standbyAssignment.slotKey,
          callDateKey: previousCall.dateKey,
          callSlotKey: previousCall.slotKey,
          relation: "CALL_PREVIOUS_DAY",
          penalty: standbyAdjacentToCallPenalty
        };

        doctorOccurrences.push(occurrence);
        occurrences.push(occurrence);
      }

      if (nextCall) {
        doctorAdjacentPairCount += 1;
        adjacentPairCount += 1;
        doctorScore += standbyAdjacentToCallPenalty;
        totalScore += standbyAdjacentToCallPenalty;

        const occurrence = {
          doctorId: row.doctorId,
          fullName: row.fullName,
          section: row.section,
          standbyDateKey: standbyAssignment.dateKey,
          standbySlotKey: standbyAssignment.slotKey,
          callDateKey: nextCall.dateKey,
          callSlotKey: nextCall.slotKey,
          relation: "CALL_NEXT_DAY",
          penalty: standbyAdjacentToCallPenalty
        };

        doctorOccurrences.push(occurrence);
        occurrences.push(occurrence);
      }
    }

    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      adjacentPairCount: doctorAdjacentPairCount,
      score: doctorScore,
      occurrences: doctorOccurrences
    };
  }

  return {
    ok: true,
    penaltyPerAdjacentPair: standbyAdjacentToCallPenalty,
    adjacentPairCount: adjacentPairCount,
    score: totalScore,
    byDoctorId: byDoctorId,
    occurrences: occurrences
  };
}

function computeStandbyCountFairnessPenalty_(scoringContext, scorerWeights) {
  const doctorTimelineRows = scoringContext.doctorTimelines && scoringContext.doctorTimelines.rows
    ? scoringContext.doctorTimelines.rows
    : [];

  const standbyCountFairnessWeight = scorerWeights.STANDBY_COUNT_FAIRNESS_WEIGHT;
  const values = [];
  const byDoctorId = {};

  for (let i = 0; i < doctorTimelineRows.length; i++) {
    const row = doctorTimelineRows[i];
    const standbyCount = row.standbyCount || 0;

    values.push(standbyCount);
    byDoctorId[row.doctorId] = {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      standbyCount: standbyCount
    };
  }

  if (values.length === 0) {
    return {
      ok: false,
      message: "No doctors found for standby fairness scoring."
    };
  }

  let sum = 0;
  let min = values[0];
  let max = values[0];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const mean = sum / values.length;

  let rawSumSquaredDeviation = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    rawSumSquaredDeviation += diff * diff;
  }

  const variance = rawSumSquaredDeviation / values.length;
  const standardDeviation = Math.sqrt(variance);
  const range = max - min;
  const score = rawSumSquaredDeviation * standbyCountFairnessWeight;

  return {
    ok: true,
    weight: standbyCountFairnessWeight,
    doctorCount: values.length,
    meanStandbyCount: mean,
    minStandbyCount: min,
    maxStandbyCount: max,
    range: range,
    variance: variance,
    standardDeviation: standardDeviation,
    rawSumSquaredDeviation: rawSumSquaredDeviation,
    score: score,
    byDoctorId: byDoctorId
  };
}

function computePointBalanceGlobalPenalty_(scoringContext, scorerWeights) {
  const rows = scoringContext.pointTotals.rows || [];
  const values = [];

  for (let i = 0; i < rows.length; i++) {
    values.push(rows[i].totalCallPoints || 0);
  }

  if (values.length === 0) {
    return {
      ok: false,
      score: Number.POSITIVE_INFINITY,
      message: "No doctors found for scoring."
    };
  }

  let sum = 0;
  let min = values[0];
  let max = values[0];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const mean = sum / values.length;

  let sumSquaredDeviation = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    sumSquaredDeviation += diff * diff;
  }

  const variance = sumSquaredDeviation / values.length;
  const standardDeviation = Math.sqrt(variance);
  const range = max - min;
  const weight = scorerWeights.GLOBAL_POINT_BALANCE_WEIGHT;
  const score = sumSquaredDeviation * weight;

  return {
    ok: true,
    weight: weight,
    score: score,
    rawSumSquaredDeviation: sumSquaredDeviation,
    doctorCount: values.length,
    meanPoints: mean,
    minPoints: min,
    maxPoints: max,
    range: range,
    variance: variance,
    standardDeviation: standardDeviation,
    sumSquaredDeviation: sumSquaredDeviation
  };
}

function scoreAllocation_(allocationResult, parseResult, scorerConfigResultOverride) {
  if (!allocationResult || allocationResult.ok !== true) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: "allocationResult is invalid.",
      contractVersion: 2
    };
  }

  const scorerConfigResult = scorerConfigResultOverride || buildResolvedScorerWeights_();
  if (!scorerConfigResult.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: scorerConfigResult.message || "SCORER_CONFIG is invalid.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  const scorerWeights = scorerConfigResult.weights;
  const scoringContext = buildScoringContext_(allocationResult, parseResult);
  const unfilledPenalty = computeUnfilledPenalty_(allocationResult, scorerWeights);
  const pointBalanceWithinSection = computePointBalanceWithinSectionPenalty_(scoringContext, scorerWeights);
  const pointBalanceGlobal = computePointBalanceGlobalPenalty_(scoringContext, scorerWeights);
  const spacingPenalty = computeSpacingPenalty_(scoringContext, scorerWeights);
  const preLeavePenalty = computePreLeavePenalty_(scoringContext, scorerWeights);
  const crReward = computeCrReward_(scoringContext, scorerWeights);
  const dualEligibleIcuBonus = computeDualEligibleIcuBonus_(scoringContext, scorerWeights);
  const standbyAdjacencyPenalty = computeStandbyAdjacencyPenalty_(scoringContext, scorerWeights);
  const standbyCountFairnessPenalty = computeStandbyCountFairnessPenalty_(scoringContext, scorerWeights);
  const standbyTotals = buildStandbyTotalsSummary_(scoringContext.doctorTimelines.rows);
  const crSatisfiedCounts = buildCrSatisfiedCountsSummary_(scoringContext.doctorTimelines.rows);

  if (!pointBalanceGlobal.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: pointBalanceGlobal.message,
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!pointBalanceWithinSection.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: pointBalanceWithinSection.message || "Within-section balance scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!spacingPenalty.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: spacingPenalty.message || "Spacing scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!preLeavePenalty.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: preLeavePenalty.message || "Pre-leave scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!crReward.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: crReward.message || "CR reward scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!dualEligibleIcuBonus.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: dualEligibleIcuBonus.message || "Dual-eligible ICU bonus scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!standbyAdjacencyPenalty.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: standbyAdjacencyPenalty.message || "Standby adjacency scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  if (!standbyCountFairnessPenalty.ok) {
    return {
      ok: false,
      totalScore: Number.POSITIVE_INFINITY,
      message: standbyCountFairnessPenalty.message || "Standby fairness scoring failed.",
      contractVersion: 2,
      scorerConfig: scorerConfigResult
    };
  }

  const totalScore =
    unfilledPenalty.score +
    spacingPenalty.score +
    preLeavePenalty.score +
    pointBalanceWithinSection.score +
    pointBalanceGlobal.score +
    standbyAdjacencyPenalty.score +
    standbyCountFairnessPenalty.score -
    crReward.score -
    dualEligibleIcuBonus.score;

  return {
    ok: true,
    contractVersion: getScoringContractVersion_(),
    totalScore: totalScore,
    scorerWeights: scorerWeights,
    scorerConfig: scorerConfigResult,
    scorerFingerprint: scorerConfigResult.scorerFingerprint || null,
    scorerFingerprintShort: scorerConfigResult.scorerFingerprintShort || null,
    scorerFingerprintVersion: scorerConfigResult.scorerFingerprintVersion || null,
    scorerSource: scorerConfigResult.scorerSource || scorerConfigResult.source || null,

    components: {
      unfilledPenalty: unfilledPenalty,
      pointBalanceWithinSection: pointBalanceWithinSection,
      pointBalanceGlobal: pointBalanceGlobal,
      spacingPenalty: spacingPenalty,
      preLeavePenalty: preLeavePenalty,
      crReward: crReward,
      dualEligibleIcuBonus: dualEligibleIcuBonus,
      standbyAdjacencyPenalty: standbyAdjacencyPenalty,
      standbyCountFairnessPenalty: standbyCountFairnessPenalty
    },

    summaries: {
      pointTotals: scoringContext.pointTotals,
      standbyTotals: standbyTotals,
      crSatisfiedCounts: crSatisfiedCounts,
      doctorSummaries: scoringContext.doctorTimelines.rows
    },

    unfilledPenalty: unfilledPenalty.score,
    unfilledSlotCount: unfilledPenalty.count,
    meanPoints: pointBalanceGlobal.meanPoints,
    minPoints: pointBalanceGlobal.minPoints,
    maxPoints: pointBalanceGlobal.maxPoints,
    range: pointBalanceGlobal.range,
    variance: pointBalanceGlobal.variance,
    standardDeviation: pointBalanceGlobal.standardDeviation,
    sumSquaredDeviation: pointBalanceGlobal.sumSquaredDeviation,
    pointTotals: scoringContext.pointTotals
  };
}

function prepareRandomTrialsSnapshot_(trialCount, options) {
  const result = {
    ok: false,
    trialCount: trialCount,
    snapshot: null,
    parseResult: null,
    scorerConfig: null
  };

  if (!trialCount || trialCount < 1) {
    result.message = "trialCount must be at least 1.";
    return result;
  }

  const parseResult = parseRosterSheet();
  if (parseResult.ok !== true) {
    result.message = "parseResult contains errors.";
    result.parseResult = parseResult;
    return result;
  }

  const scorerConfigResult = buildResolvedScorerWeights_();
  if (!scorerConfigResult.ok) {
    result.message = scorerConfigResult.message || "SCORER_CONFIG is invalid.";
    result.scorerConfig = scorerConfigResult;
    return result;
  }

  result.parseResult = parseResult;
  result.scorerConfig = scorerConfigResult;
  result.snapshot = buildComputeSnapshotFromParseResult_(parseResult, scorerConfigResult, {
    trialCount: trialCount,
    seed: options && Object.prototype.hasOwnProperty.call(options, "seed")
      ? options.seed
      : null
  });

  result.ok = true;
  return result;
}

function runRandomTrials_(trialCount, options) {
  const prepared = prepareRandomTrialsSnapshot_(trialCount, options);
  if (!prepared.ok) {
    return prepared;
  }

  return runRandomTrialsHeadless_(prepared.snapshot);
}

function debugRunRandomTrials() {
  const trialCount = 200;
  const trialResult = runRandomTrials_(trialCount);

  if (!trialResult.ok) {
    Logger.log(JSON.stringify(trialResult, null, 2));
    return;
  }

  const doctorSummaries = trialResult.bestScoring.summaries.doctorSummaries || [];
  const totalsList = doctorSummaries.map(function(row) {
    return {
      doctorId: row.doctorId,
      fullName: row.fullName,
      section: row.section,
      points: row.totalCallPoints,
      standbyCount: row.standbyCount
    };
  });

  totalsList.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return a.fullName.localeCompare(b.fullName);
  });

  const firstDays = [];
  const maxDaysToShow = Math.min(5, trialResult.bestAllocation.days.length);

  for (let i = 0; i < maxDaysToShow; i++) {
    const day = trialResult.bestAllocation.days[i];
    const assignedNames = {};
    const slotKeys = Object.keys(day.assignments);

    for (let j = 0; j < slotKeys.length; j++) {
      const slotKey = slotKeys[j];
      const assigned = day.assignments[slotKey];
      assignedNames[slotKey] = assigned ? assigned.fullName : null;
    }

    firstDays.push({
      dateKey: day.dateKey,
      assignedNames: assignedNames
    });
  }

  Logger.log(JSON.stringify({
    trialCount: trialCount,
    bestScore: trialResult.bestScore,
    contractVersion: trialResult.bestScoring.contractVersion,
    meanPoints: trialResult.bestScoring.meanPoints,
    standardDeviation: trialResult.bestScoring.standardDeviation,
    minPoints: trialResult.bestScoring.minPoints,
    maxPoints: trialResult.bestScoring.maxPoints,
    range: trialResult.bestScoring.range,
    componentScores: {
      unfilledPenalty: trialResult.bestScoring.components.unfilledPenalty
        ? trialResult.bestScoring.components.unfilledPenalty.score
        : null,
      spacingPenalty: trialResult.bestScoring.components.spacingPenalty
        ? trialResult.bestScoring.components.spacingPenalty.score
        : null,
      preLeavePenalty: trialResult.bestScoring.components.preLeavePenalty
        ? trialResult.bestScoring.components.preLeavePenalty.score
        : null,
      crReward: trialResult.bestScoring.components.crReward
        ? trialResult.bestScoring.components.crReward.score
        : null,
      dualEligibleIcuBonus: trialResult.bestScoring.components.dualEligibleIcuBonus
        ? trialResult.bestScoring.components.dualEligibleIcuBonus.score
        : null,
      standbyAdjacencyPenalty: trialResult.bestScoring.components.standbyAdjacencyPenalty
        ? trialResult.bestScoring.components.standbyAdjacencyPenalty.score
        : null,
      standbyCountFairnessPenalty: trialResult.bestScoring.components.standbyCountFairnessPenalty
        ? trialResult.bestScoring.components.standbyCountFairnessPenalty.score
        : null,
      pointBalanceWithinSection: trialResult.bestScoring.components.pointBalanceWithinSection
        ? trialResult.bestScoring.components.pointBalanceWithinSection.score
        : null,
      pointBalanceGlobal: trialResult.bestScoring.components.pointBalanceGlobal
        ? trialResult.bestScoring.components.pointBalanceGlobal.score
        : null
    },
    spacingBreakdown: trialResult.bestScoring.components.spacingPenalty
      ? {
          basePenalty: trialResult.bestScoring.components.spacingPenalty.basePenalty,
          maxSoftGapDays: trialResult.bestScoring.components.spacingPenalty.maxSoftGapDays,
          shortGapCount: trialResult.bestScoring.components.spacingPenalty.shortGapCount,
          occurrences: trialResult.bestScoring.components.spacingPenalty.occurrences
        }
      : null,
    preLeaveBreakdown: trialResult.bestScoring.components.preLeavePenalty
      ? {
          penaltyPerOccurrence: trialResult.bestScoring.components.preLeavePenalty.penaltyPerOccurrence,
          preLeaveCount: trialResult.bestScoring.components.preLeavePenalty.preLeaveCount,
          occurrences: trialResult.bestScoring.components.preLeavePenalty.occurrences
        }
      : null,
    crRewardBreakdown: trialResult.bestScoring.components.crReward
      ? {
          rewardPerOccurrence: trialResult.bestScoring.components.crReward.rewardPerOccurrence,
          satisfiedCrCallCount: trialResult.bestScoring.components.crReward.satisfiedCrCallCount,
          occurrences: trialResult.bestScoring.components.crReward.occurrences
        }
      : null,
    dualEligibleIcuBonusBreakdown: trialResult.bestScoring.components.dualEligibleIcuBonus
      ? {
          bonusPerOccurrence: trialResult.bestScoring.components.dualEligibleIcuBonus.bonusPerOccurrence,
          dualEligibleIcuCallCount: trialResult.bestScoring.components.dualEligibleIcuBonus.dualEligibleIcuCallCount,
          occurrences: trialResult.bestScoring.components.dualEligibleIcuBonus.occurrences
        }
      : null,
    standbyAdjacencyBreakdown: trialResult.bestScoring.components.standbyAdjacencyPenalty
      ? {
          penaltyPerAdjacentPair: trialResult.bestScoring.components.standbyAdjacencyPenalty.penaltyPerAdjacentPair,
          adjacentPairCount: trialResult.bestScoring.components.standbyAdjacencyPenalty.adjacentPairCount,
          occurrences: trialResult.bestScoring.components.standbyAdjacencyPenalty.occurrences
        }
      : null,
    standbyCountFairnessBreakdown: trialResult.bestScoring.components.standbyCountFairnessPenalty
      ? {
          weight: trialResult.bestScoring.components.standbyCountFairnessPenalty.weight,
          doctorCount: trialResult.bestScoring.components.standbyCountFairnessPenalty.doctorCount,
          meanStandbyCount: trialResult.bestScoring.components.standbyCountFairnessPenalty.meanStandbyCount,
          minStandbyCount: trialResult.bestScoring.components.standbyCountFairnessPenalty.minStandbyCount,
          maxStandbyCount: trialResult.bestScoring.components.standbyCountFairnessPenalty.maxStandbyCount,
          range: trialResult.bestScoring.components.standbyCountFairnessPenalty.range,
          standardDeviation: trialResult.bestScoring.components.standbyCountFairnessPenalty.standardDeviation,
          rawSumSquaredDeviation: trialResult.bestScoring.components.standbyCountFairnessPenalty.rawSumSquaredDeviation
        }
      : null,
    sectionBalanceBreakdown: trialResult.bestScoring.components.pointBalanceWithinSection
      ? trialResult.bestScoring.components.pointBalanceWithinSection.bySection
      : null,
    firstDays: firstDays,
    pointTotalsDescending: totalsList
  }, null, 2));
}

function debugTransportTrialResult() {
  const headlessResult = runRandomTrials_(200, { seed: 12345 });

  if (!headlessResult.ok) {
    Logger.log(JSON.stringify(headlessResult, null, 2));
    return;
  }

  const transportResult = buildTransportTrialResult_(headlessResult);

  Logger.log(JSON.stringify(transportResult, null, 2));
}
