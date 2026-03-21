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