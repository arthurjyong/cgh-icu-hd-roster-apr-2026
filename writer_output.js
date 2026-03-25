function getOutputRowMap_() {
  return {
    MICU_CALL: 35,
    MICU_STANDBY: 36,
    MHD_CALL: 37,
    MHD_STANDBY: 38
  };
}

function writeAllocationToSheet_(allocationResult) {
  if (!allocationResult) {
    throw new Error("allocationResult is required.");
  }

  if (allocationResult.ok !== true) {
    throw new Error("Cannot write allocation because allocationResult is not ok.");
  }

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("Sheet1");
  if (!sheet) {
    throw new Error('Sheet "Sheet1" not found.');
  }

  const outputRowMap = getOutputRowMap_();
  const slotKeys = ["MICU_CALL", "MICU_STANDBY", "MHD_CALL", "MHD_STANDBY"];
  const startColumn = 2; // column B
  const dayCount = allocationResult.days.length;

  const rowValuesBySlot = {
    MICU_CALL: [],
    MICU_STANDBY: [],
    MHD_CALL: [],
    MHD_STANDBY: []
  };

  for (let i = 0; i < allocationResult.days.length; i++) {
    const day = allocationResult.days[i];

    for (let j = 0; j < slotKeys.length; j++) {
      const slotKey = slotKeys[j];
      const assigned = day.assignments[slotKey];
      rowValuesBySlot[slotKey].push(assigned ? assigned.fullName : "");
    }
  }

  for (let j = 0; j < slotKeys.length; j++) {
    const slotKey = slotKeys[j];
    const row = outputRowMap[slotKey];
    const values = [rowValuesBySlot[slotKey]];

    sheet.getRange(row, startColumn, 1, dayCount).setValues(values);
  }
}

function validateTransportTrialResultForWriteback_(transportResult) {
  const generalValidation = validateTransportTrialResult_(transportResult);
  if (generalValidation.ok !== true) {
    return {
      ok: false,
      contractKind: "transport_trial_result_writeback",
      message: generalValidation.message,
      issues: generalValidation.issues || [],
      generalValidation: generalValidation
    };
  }

  const issues = [];
  const slotKeys = ["MICU_CALL", "MICU_STANDBY", "MHD_CALL", "MHD_STANDBY"];
  const bestAllocation = transportResult ? transportResult.bestAllocation : null;

  if (!bestAllocation) {
    issues.push("transportResult.bestAllocation is required for sheet writeback.");
  } else {
    if (bestAllocation.ok !== true) {
      issues.push("transportResult.bestAllocation must be ok.");
    }

    if (!Array.isArray(bestAllocation.days)) {
      issues.push("transportResult.bestAllocation.days must be an array.");
    } else {
      for (let i = 0; i < bestAllocation.days.length; i++) {
        const day = bestAllocation.days[i];

        if (!day || typeof day !== "object") {
          issues.push("transportResult.bestAllocation.days[" + i + "] must be an object.");
          continue;
        }

        if (!day.assignments || typeof day.assignments !== "object") {
          issues.push("transportResult.bestAllocation.days[" + i + "].assignments must be an object.");
          continue;
        }

        for (let j = 0; j < slotKeys.length; j++) {
          const slotKey = slotKeys[j];

          if (!Object.prototype.hasOwnProperty.call(day.assignments, slotKey)) {
            issues.push(
              "transportResult.bestAllocation.days[" + i + "].assignments." + slotKey + " is required."
            );
            continue;
          }

          const assigned = day.assignments[slotKey];

          if (assigned !== null) {
            if (typeof assigned !== "object") {
              issues.push(
                "transportResult.bestAllocation.days[" + i + "].assignments." + slotKey + " must be an object or null."
              );
              continue;
            }

            if (typeof assigned.fullName !== "string") {
              issues.push(
                "transportResult.bestAllocation.days[" + i + "].assignments." + slotKey + ".fullName must be a string."
              );
            }
          }
        }
      }
    }
  }

  return issues.length > 0
    ? {
        ok: false,
        contractKind: "transport_trial_result_writeback",
        message: issues[0],
        issues: issues,
        contractVersion: transportResult ? transportResult.contractVersion : null
      }
    : {
        ok: true,
        contractKind: "transport_trial_result_writeback",
        contractVersion: transportResult.contractVersion,
        dayCount: bestAllocation.days.length
      };
}

function writeTransportTrialResultToSheet_(transportResult) {
  const validation = validateTransportTrialResultForWriteback_(transportResult);

  if (validation.ok !== true) {
    throw new Error(validation.message);
  }

  writeAllocationToSheet_(transportResult.bestAllocation);
}

function normalizeMonthlyCallPointDoctorName_(value) {
  if (typeof trimmedStringOrBlank_ === "function") {
    return trimmedStringOrBlank_(value);
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function toFiniteCallPointNumberOrZero_(value, contextLabel) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  Logger.log(
    'Non-numeric call point value encountered at %s. Treating as 0. Raw value=%s',
    contextLabel,
    JSON.stringify(value)
  );
  return 0;
}

function getMonthlyCallPointDoctorRowBlocks_() {
  return [
    { startRow: 4, endRow: 11 },
    { startRow: 14, endRow: 20 },
    { startRow: 23, endRow: 30 }
  ];
}

function recomputeMonthlyCallPointsFromFinalRoster_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("Sheet1");
  if (!sheet) {
    throw new Error('Sheet "Sheet1" not found.');
  }

  const doctorRowBlocks = getMonthlyCallPointDoctorRowBlocks_();
  const dateStartColumn = 2; // B
  const dateColumnCount = 28; // B:AC
  const outputColumn = 31; // AE
  const micuPointsRow = 32;
  const mhdPointsRow = 33;
  const micuCallRow = 35;
  const mhdCallRow = 37;

  const doctorNameToRow = {};
  const doctorTotals = {};
  const doctorNamesByRow = {};
  const doctorRowsByName = {};

  for (let i = 0; i < doctorRowBlocks.length; i++) {
    const block = doctorRowBlocks[i];
    const rowCount = block.endRow - block.startRow + 1;
    const names = sheet.getRange(block.startRow, 1, rowCount, 1).getValues();
    for (let r = 0; r < rowCount; r++) {
      const rowNumber = block.startRow + r;
      const doctorName = normalizeMonthlyCallPointDoctorName_(names[r][0]);
      if (!doctorName) {
        doctorNamesByRow[rowNumber] = "";
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(doctorNameToRow, doctorName)) {
        throw new Error(
          'Duplicate doctor name "' + doctorName + '" in master list rows ' +
          doctorNameToRow[doctorName] + " and " + rowNumber + "."
        );
      }
      doctorNameToRow[doctorName] = rowNumber;
      doctorRowsByName[doctorName] = rowNumber;
      doctorNamesByRow[rowNumber] = doctorName;
      doctorTotals[doctorName] = 0;
    }
  }

  const pointsRows = sheet.getRange(micuPointsRow, dateStartColumn, 2, dateColumnCount).getValues();
  const callRows = sheet.getRange(micuCallRow, dateStartColumn, 3, dateColumnCount).getValues();

  const micuCalls = callRows[0];
  const mhdCalls = callRows[2];
  for (let colOffset = 0; colOffset < dateColumnCount; colOffset++) {
    const columnNumber = dateStartColumn + colOffset;

    const micuDoctor = normalizeMonthlyCallPointDoctorName_(micuCalls[colOffset]);
    if (micuDoctor) {
      if (!Object.prototype.hasOwnProperty.call(doctorTotals, micuDoctor)) {
        throw new Error(
          'MICU Call row contains unknown doctor "' + micuDoctor + '" at ' +
          "R" + micuCallRow + "C" + columnNumber + "."
        );
      }
      doctorTotals[micuDoctor] += toFiniteCallPointNumberOrZero_(
        pointsRows[0][colOffset],
        "R" + micuPointsRow + "C" + columnNumber
      );
    }

    const mhdDoctor = normalizeMonthlyCallPointDoctorName_(mhdCalls[colOffset]);
    if (mhdDoctor) {
      if (!Object.prototype.hasOwnProperty.call(doctorTotals, mhdDoctor)) {
        throw new Error(
          'MHD Call row contains unknown doctor "' + mhdDoctor + '" at ' +
          "R" + mhdCallRow + "C" + columnNumber + "."
        );
      }
      doctorTotals[mhdDoctor] += toFiniteCallPointNumberOrZero_(
        pointsRows[1][colOffset],
        "R" + mhdPointsRow + "C" + columnNumber
      );
    }
  }

  for (let i = 0; i < doctorRowBlocks.length; i++) {
    const block = doctorRowBlocks[i];
    const rowCount = block.endRow - block.startRow + 1;
    const outputValues = [];
    for (let r = 0; r < rowCount; r++) {
      const rowNumber = block.startRow + r;
      const doctorName = doctorNamesByRow[rowNumber];
      outputValues.push([doctorName ? doctorTotals[doctorName] : ""]);
    }
    sheet.getRange(block.startRow, outputColumn, rowCount, 1).setValues(outputValues);
  }

  const doctorPointTotals = Object.keys(doctorTotals)
    .map(function(doctorName) {
      return {
        doctorName: doctorName,
        rowNumber: doctorRowsByName[doctorName] || null,
        totalCallPoints: doctorTotals[doctorName]
      };
    })
    .sort(function(a, b) {
      return (a.rowNumber || 0) - (b.rowNumber || 0);
    });

  return {
    ok: true,
    updatedDoctorCount: Object.keys(doctorTotals).length,
    outputColumn: "AE",
    doctorPointTotals: doctorPointTotals
  };
}

function getDefaultTrialComputeInvocationMode_() {
  return "LOCAL_SIMULATED_EXTERNAL";
}

function getTrialComputeInvocationOptions_(overrides) {
  const options = {
    mode: getDefaultTrialComputeInvocationMode_(),
    includeBestAllocation: true,
    includeCandidatePoolsSummary: true,
    includeBestScoring: false
  };

  const extra = overrides || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    options[keys[i]] = extra[keys[i]];
  }

  return options;
}

function runWriteGreedyAllocationToSheet() {
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

  const allocationResult = allocateAllDaysGreedy_(candidatePools);
  if (allocationResult.ok !== true) {
    Logger.log(JSON.stringify(allocationResult, null, 2));
    return;
  }

  writeAllocationToSheet_(allocationResult);

  Logger.log(JSON.stringify({
    message: "Greedy allocation written to Sheet1 rows 35-38.",
    summary: allocationResult.summary
  }, null, 2));
}

function runWriteRandomAllocationToSheet() {
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

  writeAllocationToSheet_(allocationResult);

  Logger.log(JSON.stringify({
    message: "Random allocation written to Sheet1 rows 35-38.",
    summary: allocationResult.summary
  }, null, 2));
}

function runWriteBestRandomTrialToSheetWithInvocationOptions_(overrideOptions) {
  const trialCount = 200;
  const invocationOptions = getTrialComputeInvocationOptions_(overrideOptions);
  const prepared = prepareRandomTrialsSnapshot_(trialCount);

  if (prepared.ok !== true) {
    Logger.log(JSON.stringify(prepared, null, 2));
    return;
  }

  const transportResult = invokeTrialCompute_(prepared.snapshot, invocationOptions);

  if (transportResult.ok !== true) {
    Logger.log(JSON.stringify(transportResult, null, 2));
    return;
  }

  writeTransportTrialResultToSheet_(transportResult);

  const bestTrial = transportResult.bestTrial || {};
  const scoringSummary = bestTrial.scoringSummary || {};

  Logger.log(JSON.stringify({
    message: "Best trial allocation written to Sheet1 rows 35-38.",
    invocationMode: invocationOptions.mode,
    trialCount: trialCount,
    bestScore: bestTrial.score,
    meanPoints: scoringSummary.meanPoints || null,
    standardDeviation: scoringSummary.standardDeviation || null,
    minPoints: scoringSummary.minPoints || null,
    maxPoints: scoringSummary.maxPoints || null,
    range: scoringSummary.range || null
  }, null, 2));
}

function runWriteBestRandomTrialToSheet() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_();
}
