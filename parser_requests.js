function parseRequestCell_(rawText) {
  const config = getParserConfig();
  const allowedCodes = config.allowedCodes;
  const hardBlockCodes = config.hardBlockCodes;
  const prevDayPenaltyCodes = config.prevDayPenaltyCodes;

  const text = rawText == null ? "" : String(rawText).trim().toUpperCase();

  if (text === "") {
    return {
      rawText: "",
      tokens: [],
      codes: [],
      invalidTokens: [],
      duplicateCodes: [],
      hasCR: false,
      sameDayHardBlock: false,
      prevDaySoftPenaltyTrigger: false
    };
  }

  const tokens = text.split(",").map(function(x) {
    return x.trim();
  }).filter(function(x) {
    return x !== "";
  });

  const seen = {};
  const validCodes = [];
  const invalidTokens = [];
  const duplicateCodes = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (allowedCodes.indexOf(token) === -1) {
      invalidTokens.push(token);
      continue;
    }

    if (seen[token]) {
      duplicateCodes.push(token);
      continue;
    }

    seen[token] = true;
    validCodes.push(token);
  }

  const hasCR = validCodes.indexOf("CR") !== -1;

  const sameDayHardBlockCodes = validCodes.filter(function(code) {
    return hardBlockCodes.indexOf(code) !== -1;
  });

  const prevDayPenaltyTriggerCodes = validCodes.filter(function(code) {
    return prevDayPenaltyCodes.indexOf(code) !== -1;
  });

  const sameDayHardBlock = sameDayHardBlockCodes.length > 0;
  const prevDaySoftPenaltyTrigger = prevDayPenaltyTriggerCodes.length > 0;

  const hasCRAndHardBlock = hasCR && sameDayHardBlock;
  const hasNC = validCodes.indexOf("NC") !== -1;
  const hardBlockCount = validCodes.filter(function(code) {
    return hardBlockCodes.indexOf(code) !== -1;
  }).length;
  const hasNCAndOtherHardBlock = hasNC && hardBlockCount > 1;
  const hasMultipleHardBlockCodes = hardBlockCount > 1;

  return {
    rawText: text,
    tokens: tokens,
    codes: validCodes,
    invalidTokens: invalidTokens,
    duplicateCodes: duplicateCodes,
    hasCR: hasCR,
    sameDayHardBlockCodes: sameDayHardBlockCodes,
    prevDayPenaltyTriggerCodes: prevDayPenaltyTriggerCodes,
    sameDayHardBlock: sameDayHardBlock,
    prevDaySoftPenaltyTrigger: prevDaySoftPenaltyTrigger,
    hasCRAndHardBlock: hasCRAndHardBlock,
    hasNCAndOtherHardBlock: hasNCAndOtherHardBlock,
    hasMultipleHardBlockCodes: hasMultipleHardBlockCodes
  };
}

function parseAllDoctorDayEntries_(rawBlocks, doctors, calendarDays, parseResult) {
  const entries = {};

  for (let d = 0; d < doctors.length; d++) {
    const doctor = doctors[d];
    entries[doctor.doctorId] = {};
  }

  fillDoctorEntriesForSection_(entries, calendarDays, rawBlocks.icuOnlyRequestValues, "ICU_ONLY", 4, parseResult);
  fillDoctorEntriesForSection_(entries, calendarDays, rawBlocks.icuHdRequestValues, "ICU_HD", 14, parseResult);
  fillDoctorEntriesForSection_(entries, calendarDays, rawBlocks.hdOnlyRequestValues, "HD_ONLY", 23, parseResult);

  return entries;
}

function fillDoctorEntriesForSection_(entries, calendarDays, requestGrid, sectionKey, startRow, parseResult) {
  for (let rowOffset = 0; rowOffset < requestGrid.length; rowOffset++) {
    const rowNumber = startRow + rowOffset;
    const doctorId = sectionKey + "_R" + rowNumber;

    for (let col = 0; col < calendarDays.length; col++) {
      const rawText = requestGrid[rowOffset][col];
      const columnNumber = 2 + col;
      const cellA1 = getColumnLetter_(columnNumber) + rowNumber;
      const parsed = parseRequestCell_(rawText);
      const dateKey = calendarDays[col].dateKey;

      if (parsed.invalidTokens.length > 0) {
        addIssue_(parseResult, {
          severity: "ERROR",
          category: "REQUEST_CODE",
          code: "INVALID_CODE",
          message: "Invalid request code(s): " + parsed.invalidTokens.join(", "),
          doctorId: doctorId,
          dateKey: dateKey,
          rawText: parsed.rawText,
          cellA1: cellA1
        });
      }

      if (parsed.duplicateCodes.length > 0) {
        addIssue_(parseResult, {
          severity: "WARNING",
          category: "REQUEST_CODE",
          code: "DUPLICATE_CODE",
          message: "Duplicate request code(s): " + parsed.duplicateCodes.join(", "),
          doctorId: doctorId,
          dateKey: dateKey,
          rawText: parsed.rawText,
          cellA1: cellA1
        });
      }

      if (parsed.hasCRAndHardBlock) {
        addIssue_(parseResult, {
          severity: "WARNING",
          category: "REQUEST_CONFLICT",
          code: "CR_WITH_HARD_BLOCK",
          message: "CR appears together with a hard-block code.",
          doctorId: doctorId,
          dateKey: dateKey,
          rawText: parsed.rawText,
          cellA1: cellA1
        });
      }

      if (parsed.hasNCAndOtherHardBlock) {
        addIssue_(parseResult, {
          severity: "WARNING",
          category: "REQUEST_CONFLICT",
          code: "NC_WITH_OTHER_HARD_BLOCK",
          message: "NC appears together with another hard-block code.",
          doctorId: doctorId,
          dateKey: dateKey,
          rawText: parsed.rawText,
          cellA1: cellA1
        });
      }

      if (parsed.hasMultipleHardBlockCodes) {
        addIssue_(parseResult, {
          severity: "WARNING",
          category: "REQUEST_CONFLICT",
          code: "MULTIPLE_HARD_BLOCK_CODES",
          message: "Multiple hard-block codes appear in the same cell.",
          doctorId: doctorId,
          dateKey: dateKey,
          cellA1: cellA1,
          rawText: parsed.rawText
        });
      }

      entries[doctorId][dateKey] = {
        doctorId: doctorId,
        dateKey: dateKey,
        rawText: parsed.rawText,
        tokens: parsed.tokens,
        codes: parsed.codes,
        invalidTokens: parsed.invalidTokens,
        duplicateCodes: parsed.duplicateCodes,
        hasCR: parsed.hasCR,
        sameDayHardBlockCodes: parsed.sameDayHardBlockCodes,
        prevDayPenaltyTriggerCodes: parsed.prevDayPenaltyTriggerCodes,
        sameDayHardBlock: parsed.sameDayHardBlock,
        prevDaySoftPenaltyTrigger: parsed.prevDaySoftPenaltyTrigger,
        hasCRAndHardBlock: parsed.hasCRAndHardBlock,
        hasNCAndOtherHardBlock: parsed.hasNCAndOtherHardBlock,
        hasMultipleHardBlockCodes: parsed.hasMultipleHardBlockCodes,
        cellA1: cellA1
      };
    }
  }
}

function getColumnLetter_(columnNumber) {
  let temp = "";
  let n = columnNumber;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    temp = String.fromCharCode(65 + remainder) + temp;
    n = Math.floor((n - 1) / 26);
  }

  return temp;
}