function parseCalendarDays_(rawBlocks, parseResult) {
  const days = [];
  const seenDateKeys = {};

  for (let i = 0; i < rawBlocks.dateHeaderValues.length; i++) {
    const rawDate = rawBlocks.dateHeaderValues[i];
    const rawWeekday = rawBlocks.weekdayValues[i];
    const rawMicuPoints = rawBlocks.micuPointValues[i];
    const rawMhdPoints = rawBlocks.mhdPointValues[i];

    const columnNumber = 2 + i;
    const dateCellA1 = getColumnLetter_(columnNumber) + "1";
    const micuPointCellA1 = getColumnLetter_(columnNumber) + "32";
    const mhdPointCellA1 = getColumnLetter_(columnNumber) + "33";

    const dateObject = new Date(rawDate);
    const isValidDate = !isNaN(dateObject.getTime());

    let dateKey = "INVALID_DATE_" + columnNumber;
    if (!isValidDate) {
      addIssue_(parseResult, {
        severity: "ERROR",
        category: "CALENDAR",
        code: "INVALID_DATE",
        message: "Invalid date value in header row.",
        cellA1: dateCellA1,
        rawText: String(rawDate)
      });
    } else {
      dateKey = formatDateKey_(dateObject);

      if (seenDateKeys[dateKey]) {
        addIssue_(parseResult, {
          severity: "ERROR",
          category: "CALENDAR",
          code: "DUPLICATE_DATE",
          message: "Duplicate date found: " + dateKey,
          cellA1: dateCellA1,
          rawText: dateKey
        });
      } else {
        seenDateKeys[dateKey] = true;
      }
    }

    const micuCallPoints = parsePointValue_(rawMicuPoints, micuPointCellA1, "MICU", parseResult);
    const mhdCallPoints = parsePointValue_(rawMhdPoints, mhdPointCellA1, "MHD", parseResult);

    days.push({
      index: i,
      columnNumber: columnNumber,
      dateValue: rawDate,
      dateKey: dateKey,
      weekdayLabel: rawWeekday,
      micuCallPoints: micuCallPoints,
      mhdCallPoints: mhdCallPoints
    });
  }

  return days;
}

function parsePointValue_(rawValue, cellA1, pointType, parseResult) {
  if (typeof rawValue !== "number" || isNaN(rawValue)) {
    addIssue_(parseResult, {
      severity: "ERROR",
      category: "POINTS",
      code: "INVALID_POINT_VALUE",
      message: pointType + " call points must be numeric.",
      cellA1: cellA1,
      rawText: String(rawValue)
    });
    return null;
  }

  return rawValue;
}

function formatDateKey_(dateObject) {
  return dateObject.getFullYear() + "-" +
    pad2_(dateObject.getMonth() + 1) + "-" +
    pad2_(dateObject.getDate());
}

function pad2_(n) {
  return n < 10 ? "0" + n : String(n);
}