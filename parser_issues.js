function addIssue_(parseResult, issueData) {
  parseResult.issues.push({
    severity: issueData.severity || "ERROR",
    category: issueData.category || "GENERAL",
    code: issueData.code || "UNKNOWN",
    message: issueData.message || "Unknown issue",
    cellA1: issueData.cellA1 || null,
    doctorId: issueData.doctorId || null,
    dateKey: issueData.dateKey || null,
    rawText: issueData.rawText || null
  });
}

function finalizeParseResult_(parseResult) {
  let warningCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parseResult.issues.length; i++) {
    const issue = parseResult.issues[i];
    if (issue.severity === "WARNING") warningCount++;
    if (issue.severity === "ERROR") errorCount++;
  }

  parseResult.summary.dateCount = parseResult.calendarDays.length;
  parseResult.summary.doctorCount = parseResult.doctors.length;
  parseResult.summary.warningCount = warningCount;
  parseResult.summary.errorCount = errorCount;
  parseResult.ok = errorCount === 0;
}