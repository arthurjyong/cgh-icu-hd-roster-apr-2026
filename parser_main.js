function parseRosterSheet() {
  const config = getParserConfig();
  const result = createEmptyParseResult_(config);

  const sheet = getRosterSheet_(config, result);
  if (!sheet) {
    finalizeParseResult_(result);
    return result;
  }

  const rawBlocks = readSheetBlocks_(sheet, config);

  validateSheetStructure_(rawBlocks, result);

  result.calendarDays = parseCalendarDays_(rawBlocks, result);
  result.doctors = parseDoctors_(rawBlocks, result);
  result.doctorDayEntries = parseAllDoctorDayEntries_(rawBlocks, result.doctors, result.calendarDays, result);

  applyPreviousDaySoftPenalties_(result.doctorDayEntries, result.calendarDays, result.doctors);

  result.availabilityMap = buildAvailabilityMap_(
    result.doctorDayEntries,
    result.doctors,
    result.calendarDays
  );

  finalizeParseResult_(result);
  return result;
}

function createEmptyParseResult_(config) {
  return {
    ok: true,
    config: config,
    calendarDays: [],
    doctors: [],
    doctorDayEntries: {},
    availabilityMap: {},
    issues: [],
    summary: {
      dateCount: 0,
      doctorCount: 0,
      warningCount: 0,
      errorCount: 0
    }
  };
}