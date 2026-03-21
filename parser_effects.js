function applyPreviousDaySoftPenalties_(doctorDayEntries, calendarDays, doctors) {
  for (let d = 0; d < doctors.length; d++) {
    const doctorId = doctors[d].doctorId;

    for (let i = 0; i < calendarDays.length; i++) {
      const currentDateKey = calendarDays[i].dateKey;
      const currentEntry = doctorDayEntries[doctorId][currentDateKey];

      if (!currentEntry.prevDaySoftPenaltyTrigger) continue;
      if (i === 0) continue;

      const previousDateKey = calendarDays[i - 1].dateKey;
      const previousEntry = doctorDayEntries[doctorId][previousDateKey];

      previousEntry.prevDaySoftPenaltyApplies = true;
      previousEntry.prevDaySoftPenaltySourceDate = currentDateKey;
      previousEntry.prevDaySoftPenaltyReasonCodes = currentEntry.prevDayPenaltyTriggerCodes.slice();
    }
  }
}

function buildAvailabilityMap_(doctorDayEntries, doctors, calendarDays) {
  const availabilityMap = {};

  for (let d = 0; d < doctors.length; d++) {
    const doctor = doctors[d];
    availabilityMap[doctor.doctorId] = {};

    for (let i = 0; i < calendarDays.length; i++) {
      const dateKey = calendarDays[i].dateKey;
      const entry = doctorDayEntries[doctor.doctorId][dateKey];

      availabilityMap[doctor.doctorId][dateKey] = {
        doctorId: doctor.doctorId,
        dateKey: dateKey,
        eligibleSlots: doctor.eligibleSlots,
        canDoMICU: doctor.canDoMICU,
        canDoMHD: doctor.canDoMHD,
        rawText: entry.rawText,
        codes: entry.codes,
        sameDayHardBlocked: entry.sameDayHardBlock,
        sameDayHardBlockReasonCodes: entry.sameDayHardBlockCodes || [],
        crPreferenceApplies: entry.hasCR,
        prevDaySoftPenaltyApplies: entry.prevDaySoftPenaltyApplies === true,
        prevDaySoftPenaltySourceDate: entry.prevDaySoftPenaltySourceDate || null,
        prevDaySoftPenaltyReasonCodes: entry.prevDaySoftPenaltyReasonCodes || []
      };
    }
  }

  return availabilityMap;
}