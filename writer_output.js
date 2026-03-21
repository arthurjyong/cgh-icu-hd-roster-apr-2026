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
  const issues = [];
  const slotKeys = ["MICU_CALL", "MICU_STANDBY", "MHD_CALL", "MHD_STANDBY"];

  if (!transportResult) {
    issues.push("transportResult is required.");
  }

  if (!transportResult || transportResult.ok !== true) {
    issues.push("transportResult must be ok.");
  }

  if (!transportResult || transportResult.contractVersion !== "transport_trial_result_v1") {
    issues.push("transportResult.contractVersion must be transport_trial_result_v1.");
  }

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
        message: issues[0],
        issues: issues
      }
    : {
        ok: true,
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
  const prepared = prepareRandomTrialsSnapshot_(trialCount);

  if (prepared.ok !== true) {
    Logger.log(JSON.stringify(prepared, null, 2));
    return;
  }

  const transportResult = invokeTrialCompute_(prepared.snapshot, {
    mode: "LOCAL_SIMULATED_EXTERNAL",
    includeBestAllocation: true,
    includeCandidatePoolsSummary: true,
    includeBestScoring: false
  });

  if (transportResult.ok !== true) {
    Logger.log(JSON.stringify(transportResult, null, 2));
    return;
  }

  writeTransportTrialResultToSheet_(transportResult);

  const bestTrial = transportResult.bestTrial || {};
  const scoringSummary = bestTrial.scoringSummary || {};

  Logger.log(JSON.stringify({
    message: "Best trial allocation written to Sheet1 rows 35-38.",
    invocationMode: "LOCAL_SIMULATED_EXTERNAL",
    trialCount: trialCount,
    bestScore: bestTrial.score,
    meanPoints: scoringSummary.meanPoints || null,
    standardDeviation: scoringSummary.standardDeviation || null,
    minPoints: scoringSummary.minPoints || null,
    maxPoints: scoringSummary.maxPoints || null,
    range: scoringSummary.range || null
  }, null, 2));
}