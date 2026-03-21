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

function runWriteBestRandomTrialToSheet() {
  const trialCount = 200;
  const trialResult = runRandomTrials_(trialCount);

  if (!trialResult.ok) {
    Logger.log(JSON.stringify(trialResult, null, 2));
    return;
  }

  writeAllocationToSheet_(trialResult.bestAllocation);

  Logger.log(JSON.stringify({
    message: "Best trial allocation written to Sheet1 rows 35-38.",
    trialCount: trialCount,
    bestScore: trialResult.bestScore,
    meanPoints: trialResult.bestScoring.meanPoints,
    standardDeviation: trialResult.bestScoring.standardDeviation,
    minPoints: trialResult.bestScoring.minPoints,
    maxPoints: trialResult.bestScoring.maxPoints,
    range: trialResult.bestScoring.range
  }, null, 2));
}