function generateRoster() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Example: write dummy assignments into rows 35-38 for columns B to I
  const output = [
    ['Arthur', '', '', 'Matthew', '', '', '', ''],
    ['', 'Jeevan', '', '', '', 'Sylvia', '', ''],
    ['', '', 'Laura', '', 'Sean', '', '', ''],
    ['', '', '', '', '', '', 'Anushka', '']
  ];

  sheet.getRange(35, 2, 4, 8).setValues(output);
  SpreadsheetApp.getActiveSpreadsheet().toast('Dummy roster written');
}

function runDebugCandidatePoolsForFirstDate() {
  debugBuildCandidatePoolsForFirstDate_();
}

function runWriteBestRandomTrialToSheetLocalDirect() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "LOCAL_DIRECT"
  });
}

function runWriteBestRandomTrialToSheetSimulatedExternal() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "LOCAL_SIMULATED_EXTERNAL"
  });
}

function runWriteBestRandomTrialToSheetExternalHttp() {
  runWriteBestRandomTrialToSheetWithInvocationOptions_({
    mode: "EXTERNAL_HTTP"
  });
}

function debugLocalDirectTransportTrialResult() {
  debugTransportTrialResultForInvocationMode_("LOCAL_DIRECT");
}

function debugExternalHttpTransportTrialResult() {
  debugTransportTrialResultForInvocationMode_("EXTERNAL_HTTP");
}

function debugBuildComputeSnapshotForExternalHttp() {
  const result = buildDebugComputeSnapshotForInvocation_({
    trialCount: 200,
    seed: 12345
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugWriteComputeSnapshotForExternalHttpToDrive() {
  const result = writeDebugComputeSnapshotForInvocationToDrive_({
    trialCount: 200,
    seed: 12345
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function exportPhase12BenchmarkSnapshotToDrive() {
  const result = exportPhase12BenchmarkSnapshotToDrive_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}