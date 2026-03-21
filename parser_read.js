function getRosterSheet_(config, parseResult) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config.sheetName);

  if (!sheet) {
    addIssue_(parseResult, {
      severity: "ERROR",
      category: "STRUCTURE",
      code: "MISSING_SHEET",
      message: "Sheet '" + config.sheetName + "' was not found."
    });
    return null;
  }

  return sheet;
}

function readSheetBlocks_(sheet, config) {
  return {
    dateHeaderValues: sheet.getRange(config.ranges.dateHeader).getValues()[0],
    weekdayValues: sheet.getRange(config.ranges.weekdayHeader).getValues()[0],

    icuOnlyNameValues: sheet.getRange(config.ranges.icuOnlyNames).getValues(),
    icuOnlyRequestValues: sheet.getRange(config.ranges.icuOnlyRequests).getValues(),

    icuHdNameValues: sheet.getRange(config.ranges.icuHdNames).getValues(),
    icuHdRequestValues: sheet.getRange(config.ranges.icuHdRequests).getValues(),

    hdOnlyNameValues: sheet.getRange(config.ranges.hdOnlyNames).getValues(),
    hdOnlyRequestValues: sheet.getRange(config.ranges.hdOnlyRequests).getValues(),

    micuPointValues: sheet.getRange(config.ranges.micuPoints).getValues()[0],
    mhdPointValues: sheet.getRange(config.ranges.mhdPoints).getValues()[0]
  };
}

function validateSheetStructure_(rawBlocks, parseResult) {
  const dateCount = rawBlocks.dateHeaderValues.length;
  const weekdayCount = rawBlocks.weekdayValues.length;
  const micuPointCount = rawBlocks.micuPointValues.length;
  const mhdPointCount = rawBlocks.mhdPointValues.length;

  if (weekdayCount !== dateCount) {
    addIssue_(parseResult, {
      severity: "ERROR",
      category: "STRUCTURE",
      code: "WEEKDAY_COUNT_MISMATCH",
      message: "Weekday header count does not match date header count."
    });
  }

  if (micuPointCount !== dateCount) {
    addIssue_(parseResult, {
      severity: "ERROR",
      category: "STRUCTURE",
      code: "MICU_POINT_COUNT_MISMATCH",
      message: "MICU point row count does not match date header count."
    });
  }

  if (mhdPointCount !== dateCount) {
    addIssue_(parseResult, {
      severity: "ERROR",
      category: "STRUCTURE",
      code: "MHD_POINT_COUNT_MISMATCH",
      message: "MHD point row count does not match date header count."
    });
  }

  validateRequestGridWidth_("ICU_ONLY", rawBlocks.icuOnlyRequestValues, dateCount, parseResult);
  validateRequestGridWidth_("ICU_HD", rawBlocks.icuHdRequestValues, dateCount, parseResult);
  validateRequestGridWidth_("HD_ONLY", rawBlocks.hdOnlyRequestValues, dateCount, parseResult);
}

function validateRequestGridWidth_(sectionKey, grid, dateCount, parseResult) {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].length !== dateCount) {
      addIssue_(parseResult, {
        severity: "ERROR",
        category: "STRUCTURE",
        code: "REQUEST_GRID_WIDTH_MISMATCH",
        message: sectionKey + " request row width does not match date header count."
      });
      return;
    }
  }
}