function hotfixInstallManualCallPointsFormula() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('ROSTER FOR MANUAL EDIT');
  if (!sheet) {
    throw new Error('Sheet not found: ROSTER FOR MANUAL EDIT');
  }

  var startRow = 4;
  var endRow = 200;
  var startCol = 2;
  var endCol = 30;
  var startColLetter = hotfixColumnToLetter_(startCol);
  var endColLetter = hotfixColumnToLetter_(endCol);
  var nameValues = sheet.getRange(startRow, 1, endRow - startRow + 1, 1).getValues();
  var appliedRows = [];

  for (var i = 0; i < nameValues.length; i++) {
    var row = startRow + i;
    var rawName = nameValues[i][0];
    var name = rawName == null ? '' : String(rawName).trim();
    if (!name) {
      continue;
    }
    if (name.charAt(0) === '<' && name.charAt(name.length - 1) === '>') {
      continue;
    }

    var formula =
      '=SUMPRODUCT((LOWER(TRIM($' + startColLetter + '$35:$' + endColLetter + '$35))=LOWER(TRIM($A' + row + ')))*$' + startColLetter + '$32:$' + endColLetter + '$32)' +
      '+SUMPRODUCT((LOWER(TRIM($' + startColLetter + '$37:$' + endColLetter + '$37))=LOWER(TRIM($A' + row + ')))*$' + startColLetter + '$33:$' + endColLetter + '$33)';
    sheet.getRange(row, 31).setFormula(formula);
    appliedRows.push(row);
  }

  var result = {
    ok: true,
    sheetName: sheet.getName(),
    formulaColumn: 'AE',
    dateColumns: startColLetter + ':' + endColLetter,
    doctorRowCount: appliedRows.length,
    appliedRows: appliedRows,
    appliedAtIso: new Date().toISOString()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function hotfixColumnToLetter_(columnNumber) {
  var column = Number(columnNumber);
  var letter = '';
  while (column > 0) {
    var temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = Math.floor((column - temp - 1) / 26);
  }
  return letter;
}

function hotfixClearManualCallPointsFormula() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('ROSTER FOR MANUAL EDIT');
  if (!sheet) {
    throw new Error('Sheet not found: ROSTER FOR MANUAL EDIT');
  }

  sheet.getRange(4, 31, 197, 1).clearContent();

  var result = {
    ok: true,
    sheetName: sheet.getName(),
    clearedRange: 'AE4:AE200',
    clearedAtIso: new Date().toISOString()
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function hotfixStopBenchmarkControlPlaneNow() {
  const stopResult = stopActiveBenchmarkCampaignPolling();
  const clearResult = clearActiveBenchmarkCampaignUiAndState_();
  const stateAfter = debugActiveBenchmarkCampaignState();
  const configAfter = debugBenchmarkOrchestratorConfig();
  const result = {
    ok: true,
    at: new Date().toISOString(),
    stopResult: stopResult,
    clearResult: clearResult,
    stateAfter: stateAfter,
    configAfter: configAfter
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runManualRosterScoringHotfix() {
  var CFG = {
    sheetName: 'ROSTER FOR MANUAL EDIT',
    rowDateHeader: 1,
    rowMicuPoints: 32,
    rowMhdPoints: 33,
    rowManualStart: 35,
    rowManualEnd: 38,
    rowReportStart: 60,
    colReportStart: 1,
    reportWidth: 10,
    maxReportRows: 220,
    fallbackColStart: 16, // P
    fallbackColEnd: 29, // AC
    strictMode: true,
    maxSampleItems: 12,
    emptyTokens: { '': true, '-': true, '—': true, 'na': true, 'n/a': true, 'none': true },
    nameSplitRegex: /[\n,;/&]+/,
    slotKeys: ['MICU_CALL', 'MICU_STANDBY', 'MHD_CALL', 'MHD_STANDBY'],
    sectionBlocks: [
      { section: 'ICU_ONLY', startRow: 4, endRow: 11 },
      { section: 'ICU_HD', startRow: 14, endRow: 20 },
      { section: 'HD_ONLY', startRow: 23, endRow: 30 }
    ]
  };

  var RUN = {
    runId: 'manual-hotfix-' + new Date().getTime(),
    startedAtIso: new Date().toISOString(),
    status: 'INIT',
    okToWrite: false,
    writeAttempted: false,
    writeSuccess: false,
    scorerMode: 'none'
  };

  var LOGS = [];
  var DIAG = {
    blockers: [],
    warnings: [],
    counts: {
      doctorsParsed: 0,
      assignmentColumns: 0,
      slotsParsed: 0,
      assignedSlots: 0,
      blankSlots: 0,
      unknownDoctors: 0,
      parseErrors: 0
    },
    samples: {
      unknownDoctors: [],
      parseErrors: []
    },
    warningOverflowCount: 0
  };

  var RAW = null;
  var CTX = null;
  var ALLOC = null;
  var SCORE = null;
  var HEALTH = null;

  function logEvent_(level, step, msg, data) {
    LOGS.push({
      ts: new Date().toISOString(),
      level: level,
      step: step,
      msg: msg,
      data: data || null
    });
  }

  function addBlocker_(code, msg, meta) {
    DIAG.blockers.push({ code: code, msg: msg, meta: meta || null });
    logEvent_('ERROR', code, msg, meta || null);
  }

  function addWarning_(code, msg, meta) {
    if (DIAG.warnings.length < 40) {
      DIAG.warnings.push({ code: code, msg: msg, meta: meta || null });
    } else {
      DIAG.warningOverflowCount += 1;
    }
    logEvent_('WARN', code, msg, meta || null);
  }

  function bumpCount_(key, inc) {
    var n = typeof inc === 'number' ? inc : 1;
    if (typeof DIAG.counts[key] !== 'number') {
      DIAG.counts[key] = 0;
    }
    DIAG.counts[key] += n;
  }

  function pushSample_(bucket, item) {
    if (!DIAG.samples[bucket]) {
      DIAG.samples[bucket] = [];
    }
    if (DIAG.samples[bucket].length < CFG.maxSampleItems) {
      DIAG.samples[bucket].push(item);
    }
  }

  function normalizeName_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function isEmptyToken_(value) {
    var token = normalizeName_(value);
    return Object.prototype.hasOwnProperty.call(CFG.emptyTokens, token);
  }

  function toDateKey_(value, index) {
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    var s = value === null || value === undefined ? '' : String(value).trim();
    if (s) return s;
    return 'DAY_' + String(index + 1);
  }

  function safeGetValues_(sheet, row, col, numRows, numCols, label) {
    try {
      return sheet.getRange(row, col, numRows, numCols).getValues();
    } catch (err) {
      addBlocker_('RANGE_READ_FAILED', 'Failed reading range for ' + label + ': ' + err.message, {
        row: row,
        col: col,
        numRows: numRows,
        numCols: numCols,
        label: label
      });
      return null;
    }
  }

  function detectScoringColumnWindow_(sheet) {
    // Final locked contract for manual roster scoring:
    // B:AC (2..29), 28 columns.
    // This avoids auto-detection drift and keeps scoring stable.

    return {
      startCol: 2,   // B
      endCol: 29,    // AC
      colCount: 28,
      source: 'locked_contract_B_AC'
    };
  }

  function readManualGrid_(sheet) {
    var window = detectScoringColumnWindow_(sheet);
    bumpCount_('assignmentColumns', window.colCount);
    logEvent_('INFO', 'COLUMN_WINDOW', 'Detected scoring column window', window);

    var doctorMasterRaw = [];
    for (var b = 0; b < CFG.sectionBlocks.length; b++) {
      var block = CFG.sectionBlocks[b];
      var blockRows = block.endRow - block.startRow + 1;
      var names = safeGetValues_(sheet, block.startRow, 1, blockRows, 1, 'doctor_names_' + block.section);
      var requests = safeGetValues_(sheet, block.startRow, window.startCol, blockRows, window.colCount, 'requests_' + block.section);
      if (!names || !requests) continue;
      doctorMasterRaw.push({ section: block.section, startRow: block.startRow, names: names, requests: requests });
    }

    return {
      window: window,
      dateHeaderRaw: safeGetValues_(sheet, CFG.rowDateHeader, window.startCol, 1, window.colCount, 'date_header'),
      micuPointsRaw: safeGetValues_(sheet, CFG.rowMicuPoints, window.startCol, 1, window.colCount, 'micu_points'),
      mhdPointsRaw: safeGetValues_(sheet, CFG.rowMhdPoints, window.startCol, 1, window.colCount, 'mhd_points'),
      manualAssignmentsRaw: safeGetValues_(sheet, CFG.rowManualStart, window.startCol, 4, window.colCount, 'manual_rows_35_38'),
      doctorMasterRaw: doctorMasterRaw
    };
  }

  function buildContext_(raw) {
    // Use fixed doctor blocks only (same as roster contract) to avoid
    // accidentally parsing labels/headers as doctors.

    var doctors = [];
    var doctorByName = {};
    var doctorByAlias = {};
    var availabilityMap = {};

    function indexAlias_(alias, doctor) {
      if (!alias) return;
      if (!Object.prototype.hasOwnProperty.call(doctorByAlias, alias)) {
        doctorByAlias[alias] = doctor;
        return;
      }
      if (doctorByAlias[alias] && doctorByAlias[alias].doctorId !== doctor.doctorId) {
        doctorByAlias[alias] = null; // ambiguous alias
      }
    }

    function addAliases_(normalized, doctor) {
      var cleaned = normalized.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
      indexAlias_(normalized, doctor);
      indexAlias_(cleaned, doctor);

      var words = cleaned ? cleaned.split(' ') : [];
      if (words.length >= 2) {
        for (var len = 2; len < words.length; len++) {
          indexAlias_(words.slice(0, len).join(' '), doctor);
        }
      }
    }

    for (var i = 0; i < (raw.doctorMasterRaw || []).length; i++) {
      var block = raw.doctorMasterRaw[i];

      for (var r = 0; r < (block.names || []).length; r++) {
        var sourceRow = block.startRow + r;
        var fullName = block.names[r][0] == null ? '' : String(block.names[r][0]).trim();

        if (!fullName) continue;
        if (fullName.charAt(0) === '<' && fullName.charAt(fullName.length - 1) === '>') continue;

        var normalized = normalizeName_(fullName);
        if (!normalized) continue;

        if (doctorByName[normalized]) {
          addBlocker_('DUPLICATE_DOCTOR_NAME', 'Duplicate doctor name found: ' + fullName, {
            fullName: fullName,
            existingDoctorId: doctorByName[normalized].doctorId,
            row: sourceRow
          });
          continue;
        }

        var section = block.section;
        var doctorId = section + '_R' + sourceRow;
        var doctor = {
          doctorId: doctorId,
          fullName: fullName,
          section: section,
          sourceRow: sourceRow,
          canDoMICU: section !== 'HD_ONLY',
          canDoMHD: section !== 'ICU_ONLY',
          eligibleSlots: section === 'ICU_ONLY'
            ? ['MICU_CALL', 'MICU_STANDBY']
            : section === 'HD_ONLY'
              ? ['MHD_CALL', 'MHD_STANDBY']
              : ['MICU_CALL', 'MICU_STANDBY', 'MHD_CALL', 'MHD_STANDBY']
        };

        doctors.push(doctor);
        doctorByName[normalized] = doctor;
        addAliases_(normalized, doctor);

        var reqRow = block.requests && block.requests[r] ? block.requests[r] : [];
        availabilityMap[doctorId] = {};

        for (var c = 0; c < raw.window.colCount; c++) {
          var dateKey = toDateKey_(raw.dateHeaderRaw && raw.dateHeaderRaw[0] ? raw.dateHeaderRaw[0][c] : '', c);
          var reqRaw = reqRow[c];
          var reqText = reqRaw == null ? '' : String(reqRaw).trim();
          var reqCodes = reqText
            ? reqText.split(/[,\s]+/).map(function(x) { return x.trim().toUpperCase(); }).filter(function(x) { return x; })
            : [];

          availabilityMap[doctorId][dateKey] = {
            crPreferenceApplies: reqCodes.indexOf('CR') !== -1,
            prevDaySoftPenaltyApplies:
              reqCodes.indexOf('AL') !== -1 || reqCodes.indexOf('TL') !== -1 || reqCodes.indexOf('SL') !== -1 ||
              reqCodes.indexOf('MC') !== -1 || reqCodes.indexOf('HL') !== -1 || reqCodes.indexOf('NSL') !== -1 ||
              reqCodes.indexOf('OPL') !== -1 || reqCodes.indexOf('EMCC') !== -1 || reqCodes.indexOf('EXAM') !== -1,
            prevDaySoftPenaltySourceDate: null,
            prevDaySoftPenaltyReasonCodes: reqCodes
          };
        }
      }
    }

    if (doctors.length === 0) {
      addBlocker_('NO_DOCTORS_PARSED', 'No doctors were parsed from the manual tab.');
    }

    bumpCount_('doctorsParsed', doctors.length);

    var calendarDays = [];
    for (var d = 0; d < raw.window.colCount; d++) {
      calendarDays.push({
        index: d,
        dateKey: toDateKey_(raw.dateHeaderRaw && raw.dateHeaderRaw[0] ? raw.dateHeaderRaw[0][d] : '', d),
        micuCallPoints: Number(raw.micuPointsRaw && raw.micuPointsRaw[0] ? raw.micuPointsRaw[0][d] : 0) || 0,
        mhdCallPoints: Number(raw.mhdPointsRaw && raw.mhdPointsRaw[0] ? raw.mhdPointsRaw[0][d] : 0) || 0
      });
    }

    return {
      doctors: doctors,
      doctorByName: doctorByName,
      doctorByAlias: doctorByAlias,
      calendarDays: calendarDays,
      availabilityMap: availabilityMap
    };
  }

  function parseAssignmentCell_(value, rowNumber, colNumber) {
    // Simplified parser:
    // - Accept blank/empty tokens as unfilled
    // - Preserve comma-form names as a single person candidate
    // - Only treat hard delimiters (; / & newline) as multi-person separators
    // - Avoid over-splitting full names with spaces

    if (value === null || value === undefined) {
      return { tokens: [], candidates: [], raw: '', issues: [] };
    }

    var raw = String(value).trim();
    if (!raw) {
      return { tokens: [], candidates: [], raw: '', issues: [] };
    }

    if (isEmptyToken_(raw)) {
      return { tokens: [], candidates: [], raw: raw, issues: [] };
    }

    var issues = [];
    var candidates = [raw];

    // Support "Last, First" / "Family, Given..." style as SAME person
    if (raw.indexOf(',') !== -1) {
      var commaParts = raw.split(',').map(function(x) { return String(x).trim(); }).filter(function(x) { return x; });
      if (commaParts.length === 2) {
        candidates.push((commaParts[0] + ' ' + commaParts[1]).trim());
      }
    }

    // Explicit multi-person separators only (not comma, because comma can be name format)
    var multiTokens = raw.split(/[\n;/&]+/).map(function(x) { return String(x).trim(); }).filter(function(x) { return x; });

    if (multiTokens.length > 1) {
      issues.push({
        type: 'MULTIPLE_TOKENS',
        row: rowNumber,
        col: colNumber,
        raw: raw,
        tokens: multiTokens
      });

      // Keep first token for deterministic behavior, but include all as candidates
      candidates = candidates.concat(multiTokens);
      return {
        tokens: [multiTokens[0]],
        candidates: candidates,
        raw: raw,
        issues: issues
      };
    }

    return {
      tokens: [raw],
      candidates: candidates,
      raw: raw,
      issues: issues
    };
  }

  function resolveDoctorFromCandidates_(candidates, context) {
    // Strict resolver for point integrity:
    // 1) exact full-name match
    // 2) exact alias match (from buildContext_ alias table)
    // NO fuzzy prefix guessing (to avoid silently assigning points to wrong doctor)

    var seen = {};
    var byName = context && context.doctorByName ? context.doctorByName : {};
    var byAlias = context && context.doctorByAlias ? context.doctorByAlias : {};

    for (var i = 0; i < (candidates || []).length; i++) {
      var raw = candidates[i];
      var normalized = normalizeName_(raw).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!normalized || seen[normalized]) continue;
      seen[normalized] = true;

      if (byName[normalized]) {
        return byName[normalized];
      }

      if (byAlias[normalized]) {
        return byAlias[normalized];
      }
    }

    // unresolved -> caller will mark as unknown (safer than wrong point assignment)
    return null;
  }

  function buildAllocation_(raw, context) {
    var rows = raw.manualAssignmentsRaw || [];
    if (rows.length !== 4) {
      addBlocker_('MANUAL_ROWS_MISSING', 'Manual assignment rows 35-38 not readable as 4 rows.', { rowCount: rows.length });
    }

    var days = [];
    var unknownDoctors = {};
    var parseErrors = [];

    for (var colOffset = 0; colOffset < raw.window.colCount; colOffset++) {
      var dateKey = context.calendarDays[colOffset] ? context.calendarDays[colOffset].dateKey : ('DAY_' + (colOffset + 1));
      var assignments = {};

      for (var slotIndex = 0; slotIndex < CFG.slotKeys.length; slotIndex++) {
        var slotKey = CFG.slotKeys[slotIndex];
        var cellValue = rows[slotIndex] ? rows[slotIndex][colOffset] : '';
        bumpCount_('slotsParsed', 1);

        var parsed = parseAssignmentCell_(cellValue, CFG.rowManualStart + slotIndex, raw.window.startCol + colOffset);
        for (var issueIndex = 0; issueIndex < parsed.issues.length; issueIndex++) {
          var issue = parsed.issues[issueIndex];
          parseErrors.push(issue);
          bumpCount_('parseErrors', 1);
          pushSample_('parseErrors', issue);
          addWarning_('ASSIGNMENT_PARSE_WARNING', 'Manual assignment parse warning at R' + issue.row + 'C' + issue.col, issue);
        }

        if (parsed.tokens.length === 0) {
          assignments[slotKey] = null;
          bumpCount_('blankSlots', 1);
          continue;
        }

        var token = parsed.tokens[0];
        var doctor = resolveDoctorFromCandidates_(parsed.candidates || [token], context);

        if (!doctor) {
          assignments[slotKey] = null;
          unknownDoctors[token] = true;
          bumpCount_('unknownDoctors', 1);
          continue;
        }

        assignments[slotKey] = {
          doctorId: doctor.doctorId,
          fullName: doctor.fullName,
          section: doctor.section,
          rawText: parsed.raw,
          codes: [],
          crPreferenceApplies: false,
          prevDaySoftPenaltyApplies: false,
          prevDaySoftPenaltySourceDate: null,
          prevDaySoftPenaltyReasonCodes: []
        };
        bumpCount_('assignedSlots', 1);
      }

      days.push({
        dateKey: dateKey,
        assignments: assignments,
        unfilledSlotKeys: CFG.slotKeys.filter(function(key) { return assignments[key] === null; })
      });
    }

    var unknownList = Object.keys(unknownDoctors);
    for (var u = 0; u < unknownList.length; u++) {
      pushSample_('unknownDoctors', unknownList[u]);
    }

    var allocation = {
      ok: true,
      days: days,
      summary: {
        totalDayCount: days.length,
        totalSlotCount: days.length * CFG.slotKeys.length,
        totalUnfilledSlotCount: DIAG.counts.blankSlots + DIAG.counts.unknownDoctors
      }
    };

    return {
      allocation: allocation,
      diagnostics: {
        unknownDoctors: unknownList,
        parseErrors: parseErrors
      }
    };
  }

  function buildParseResultForScorer_(context) {
    // Exact-machine parity mode:
    // pass through the same derived context used by scorer so manual result
    // is evaluated with the same logic/components as normal roster scoring.

    return {
      ok: true,
      doctors: context.doctors || [],
      calendarDays: context.calendarDays || [],
      availabilityMap: context.availabilityMap || {},
      issues: []
    };
  }

  function buildFallbackScore_(allocation, context) {
    // Parity-first hotfix: fallback scoring is intentionally disabled.
    // Returning a non-ok payload forces health gate to skip write when
    // machine scorer parity cannot be guaranteed.

    return {
      ok: false,
      contractVersion: 2,
      totalScore: Number.POSITIVE_INFINITY,
      message: 'Fallback scoring disabled for manual hotfix parity mode. scoreAllocation_ is required.',
      scorerMode: 'fallback_disabled',
      allocationSummary: allocation && allocation.summary ? allocation.summary : null,
      doctorCount: context && context.doctors ? context.doctors.length : 0
    };
  }

  function runScoring_(allocation, context) {
    // Strict parity mode:
    // must use project scorer (scoreAllocation_) to match machine results exactly.
    // If unavailable or invalid, block write instead of using fallback scoring.

    try {
      if (typeof scoreAllocation_ !== 'function') {
        addBlocker_(
          'SCORER_NOT_AVAILABLE',
          'scoreAllocation_ is not available. Parity scoring cannot run in manual hotfix.'
        );
        RUN.scorerMode = 'unavailable';
        return null;
      }

      var parsed = buildParseResultForScorer_(context);
      var scored = scoreAllocation_(allocation, parsed);

      if (!scored || scored.ok !== true) {
        addBlocker_('SCORER_FAILED', 'scoreAllocation_ returned non-ok result.', {
          scorerResult: scored || null
        });
        RUN.scorerMode = 'rich_failed';
        return null;
      }

      RUN.scorerMode = 'rich';
      return scored;

    } catch (err) {
      addBlocker_('SCORER_EXCEPTION', 'Scorer execution threw exception: ' + err.message, {
        stack: err && err.stack ? String(err.stack) : null
      });
      RUN.scorerMode = 'rich_exception';
      return null;
    }
  }

  function buildTopBottomDoctors_(doctorRows) {
    var rows = (doctorRows || []).slice();
    rows.sort(function(a, b) {
      var pa = Number(a.totalCallPoints || 0);
      var pb = Number(b.totalCallPoints || 0);
      if (pb !== pa) return pb - pa;
      return String(a.fullName || '').localeCompare(String(b.fullName || ''));
    });

    return {
      top: rows.slice(0, 3),
      bottom: rows.slice(Math.max(rows.length - 3, 0))
    };
  }

  function assessHealth_(allocationBuildResult, scoreResult) {
    var blockers = DIAG.blockers.slice();
    var warnings = DIAG.warnings.slice();

    if (!allocationBuildResult || !allocationBuildResult.allocation) {
      blockers.push({ code: 'ALLOCATION_MISSING', msg: 'Allocation build result missing.' });
    }

    if (!scoreResult || scoreResult.ok !== true) {
      blockers.push({ code: 'SCORE_MISSING', msg: 'Score result missing or not ok.' });
    }

    // strict unknown-doctor gate
    if (
      CFG.strictMode &&
      allocationBuildResult &&
      allocationBuildResult.diagnostics &&
      allocationBuildResult.diagnostics.unknownDoctors &&
      allocationBuildResult.diagnostics.unknownDoctors.length > 0
    ) {
      blockers.push({
        code: 'UNKNOWN_DOCTORS_STRICT',
        msg: 'Unknown doctors present in manual rows while strict mode is enabled.',
        meta: { unknownDoctors: allocationBuildResult.diagnostics.unknownDoctors }
      });
    }

    // structural sanity checks
    var dayCount = allocationBuildResult && allocationBuildResult.allocation && allocationBuildResult.allocation.days
      ? allocationBuildResult.allocation.days.length
      : 0;
    var expectedSlots = dayCount * 4; // MICU_CALL, MICU_STANDBY, MHD_CALL, MHD_STANDBY
    var observedSlots = DIAG.counts.slotsParsed || 0;
    var assignedSlots = DIAG.counts.assignedSlots || 0;
    var blankSlots = DIAG.counts.blankSlots || 0;
    var unknownSlots = DIAG.counts.unknownDoctors || 0;

    if (observedSlots !== expectedSlots) {
      blockers.push({
        code: 'SLOT_COUNT_MISMATCH',
        msg: 'Parsed slot count does not match expected dayCount*4.',
        meta: { observedSlots: observedSlots, expectedSlots: expectedSlots, dayCount: dayCount }
      });
    }

    if (assignedSlots + blankSlots + unknownSlots !== observedSlots) {
      blockers.push({
        code: 'SLOT_ACCOUNTING_MISMATCH',
        msg: 'assigned + blank + unknown does not reconcile to slotsParsed.',
        meta: {
          assignedSlots: assignedSlots,
          blankSlots: blankSlots,
          unknownSlots: unknownSlots,
          slotsParsed: observedSlots
        }
      });
    }

    // parity audit: scorer point totals vs direct recompute from allocation/points rows
    if (scoreResult && scoreResult.ok === true && scoreResult.summaries && scoreResult.summaries.pointTotals) {
      var scorerRows = scoreResult.summaries.pointTotals.rows || [];
      var scorerByDoctorId = {};
      for (var i = 0; i < scorerRows.length; i++) {
        var sr = scorerRows[i];
        scorerByDoctorId[sr.doctorId] = Number(sr.totalCallPoints || 0);
      }

      var calByDate = {};
      var calDays = (CTX && CTX.calendarDays) ? CTX.calendarDays : [];
      for (var d = 0; d < calDays.length; d++) {
        calByDate[calDays[d].dateKey] = calDays[d];
      }

      var directByDoctorId = {};
      var docs = (CTX && CTX.doctors) ? CTX.doctors : [];
      for (var j = 0; j < docs.length; j++) {
        directByDoctorId[docs[j].doctorId] = 0;
      }

      var days = allocationBuildResult && allocationBuildResult.allocation ? allocationBuildResult.allocation.days : [];
      for (var k = 0; k < days.length; k++) {
        var day = days[k];
        var cal = calByDate[day.dateKey] || { micuCallPoints: 0, mhdCallPoints: 0 };
        var a = day.assignments || {};

        if (a.MICU_CALL && a.MICU_CALL.doctorId) {
          directByDoctorId[a.MICU_CALL.doctorId] += Number(cal.micuCallPoints) || 0;
        }
        if (a.MHD_CALL && a.MHD_CALL.doctorId) {
          directByDoctorId[a.MHD_CALL.doctorId] += Number(cal.mhdCallPoints) || 0;
        }
      }

      var mismatchSamples = [];
      var doctorIds = Object.keys(directByDoctorId);
      for (var m = 0; m < doctorIds.length; m++) {
        var doctorId = doctorIds[m];
        var directPts = Number(directByDoctorId[doctorId] || 0);
        var scorerPts = Number(scorerByDoctorId[doctorId] || 0);
        if (Math.abs(directPts - scorerPts) > 1e-9) {
          mismatchSamples.push({
            doctorId: doctorId,
            directCallPoints: directPts,
            scorerCallPoints: scorerPts
          });
        }
      }

      if (mismatchSamples.length > 0) {
        warnings.push({
          code: 'POINT_TOTAL_PARITY_WARNING',
          msg: 'Scorer point totals differ from direct recompute.',
          meta: { mismatchCount: mismatchSamples.length, sample: mismatchSamples.slice(0, 5) }
        });
      }
    }

    return {
      okToWrite: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      counts: DIAG.counts
    };
  }

  function rowFixed_(cells, width) {
    var row = [];
    for (var i = 0; i < width; i++) {
      row.push(i < cells.length ? cells[i] : '');
    }
    return row;
  }

  function shapeRect_(rows, width) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push(rowFixed_(rows[i], width));
    }
    return out;
  }

  function assertRect_(rows, width) {
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i] || rows[i].length !== width) {
        throw new Error('Rectangular shape assertion failed at row index ' + i + '.');
      }
    }
  }

  function buildReportRows_(scoreResult, allocationBuildResult) {
    var rows = [];

    var doctors = (CTX && CTX.doctors) ? CTX.doctors : [];
    var calendarDays = (CTX && CTX.calendarDays) ? CTX.calendarDays : [];
    var availabilityMap = (CTX && CTX.availabilityMap) ? CTX.availabilityMap : {};

    var calByDate = {};
    for (var c = 0; c < calendarDays.length; c++) {
      calByDate[calendarDays[c].dateKey] = calendarDays[c];
    }

    var directCallPointsByDoctorId = {};
    var standbyCountByDoctorId = {};
    var crRequestedByDoctorId = {};
    var crFulfilledByDoctorId = {};

    for (var d = 0; d < doctors.length; d++) {
      var doctorId = doctors[d].doctorId;
      directCallPointsByDoctorId[doctorId] = 0;
      standbyCountByDoctorId[doctorId] = 0;
      crRequestedByDoctorId[doctorId] = 0;
      crFulfilledByDoctorId[doctorId] = 0;

      var doctorAvailability = availabilityMap[doctorId] || {};
      var dateKeys = Object.keys(doctorAvailability);
      for (var dk = 0; dk < dateKeys.length; dk++) {
        var dateKey = dateKeys[dk];
        if (doctorAvailability[dateKey] && doctorAvailability[dateKey].crPreferenceApplies) {
          crRequestedByDoctorId[doctorId] += 1;
        }
      }
    }

    var allocDays = allocationBuildResult && allocationBuildResult.allocation && allocationBuildResult.allocation.days
      ? allocationBuildResult.allocation.days
      : [];

    for (var i = 0; i < allocDays.length; i++) {
      var day = allocDays[i];
      var dateKey = day.dateKey;
      var cal = calByDate[dateKey] || { micuCallPoints: 0, mhdCallPoints: 0 };
      var a = day.assignments || {};

      // MICU call
      if (a.MICU_CALL && a.MICU_CALL.doctorId) {
        var micuDocId = a.MICU_CALL.doctorId;
        directCallPointsByDoctorId[micuDocId] += Number(cal.micuCallPoints) || 0;

        if (availabilityMap[micuDocId] && availabilityMap[micuDocId][dateKey] && availabilityMap[micuDocId][dateKey].crPreferenceApplies) {
          crFulfilledByDoctorId[micuDocId] += 1;
        }
      }

      // MHD call
      if (a.MHD_CALL && a.MHD_CALL.doctorId) {
        var mhdDocId = a.MHD_CALL.doctorId;
        directCallPointsByDoctorId[mhdDocId] += Number(cal.mhdCallPoints) || 0;

        if (availabilityMap[mhdDocId] && availabilityMap[mhdDocId][dateKey] && availabilityMap[mhdDocId][dateKey].crPreferenceApplies) {
          crFulfilledByDoctorId[mhdDocId] += 1;
        }
      }

      // Standby
      if (a.MICU_STANDBY && a.MICU_STANDBY.doctorId) {
        standbyCountByDoctorId[a.MICU_STANDBY.doctorId] += 1;
      }
      if (a.MHD_STANDBY && a.MHD_STANDBY.doctorId) {
        standbyCountByDoctorId[a.MHD_STANDBY.doctorId] += 1;
      }
    }

    var doctorRows = [];
    var totalCrRequested = 0;
    var totalCrFulfilled = 0;
    for (var x = 0; x < doctors.length; x++) {
      var doc = doctors[x];
      var docId = doc.doctorId;
      var requested = Number(crRequestedByDoctorId[docId] || 0);
      var fulfilled = Number(crFulfilledByDoctorId[docId] || 0);
      var unfulfilled = Math.max(requested - fulfilled, 0);

      totalCrRequested += requested;
      totalCrFulfilled += fulfilled;

      doctorRows.push({
        doctorId: docId,
        fullName: doc.fullName,
        section: doc.section,
        totalCallPoints: Number(directCallPointsByDoctorId[docId] || 0),
        standbyCount: Number(standbyCountByDoctorId[docId] || 0),
        crFulfilled: fulfilled,
        crUnfulfilled: unfulfilled
      });
    }
    var totalCrUnfulfilled = Math.max(totalCrRequested - totalCrFulfilled, 0);

    var topBottom = buildTopBottomDoctors_(doctorRows);

    // Header + components
    rows.push(['MANUAL ROSTER HOTFIX SCORE REPORT', '', '', '', '', '', '', '', '', '']);
    rows.push(['Run ID', RUN.runId, 'Started', RUN.startedAtIso, 'Scorer Mode', RUN.scorerMode, '', '', '', '']);
    rows.push(['Total Score', scoreResult.totalScore, 'Contract', scoreResult.contractVersion || '', '', '', '', '', '', '']);
    rows.push(['Component', 'Score', '', '', '', '', '', '', '', '']);

    var componentOrder = [
      'unfilledPenalty',
      'pointBalanceWithinSection',
      'pointBalanceGlobal',
      'spacingPenalty',
      'preLeavePenalty',
      'crReward',
      'dualEligibleIcuBonus',
      'standbyAdjacencyPenalty',
      'standbyCountFairnessPenalty'
    ];
    for (var k = 0; k < componentOrder.length; k++) {
      var key = componentOrder[k];
      var comp = scoreResult.components && scoreResult.components[key] ? scoreResult.components[key] : null;
      rows.push([key, comp ? comp.score : 'N/A', '', '', '', '', '', '', '', '']);
    }

    // Diagnostics + CR totals
    rows.push(['', '', '', '', '', '', '', '', '', '']);
    rows.push(['Diagnostics', '', '', '', '', '', '', '', '', '']);
    rows.push(['Assigned Slots', DIAG.counts.assignedSlots, 'Blank Slots', DIAG.counts.blankSlots, 'Unknown Doctors', DIAG.counts.unknownDoctors, '', '', '', '']);
    rows.push(['Parse Errors', DIAG.counts.parseErrors, 'Total Days', allocDays.length, '', '', '', '', '', '']);
    rows.push(['CR Requested', totalCrRequested, 'CR Fulfilled', totalCrFulfilled, 'CR Unfulfilled', totalCrUnfulfilled, '', '', '', '']);

    // Doctor table (removed CallPts(Scorer) + Delta)
    rows.push(['', '', '', '', '', '', '', '', '', '']);
    rows.push(['Doctor', 'Section', 'CallPoints', 'StandbyCount', 'CR Fulfilled', 'CR Unfulfilled', '', '', '', '']);
    for (var r = 0; r < doctorRows.length; r++) {
      var dr = doctorRows[r];
      rows.push([dr.fullName, dr.section, dr.totalCallPoints, dr.standbyCount, dr.crFulfilled, dr.crUnfulfilled, '', '', '', '']);
    }

    // Occurrences
    rows.push(['', '', '', '', '', '', '', '', '', '']);
    rows.push(['Occurrences', 'Count', '', '', '', '', '', '', '', '']);
    var spacingOccurrences = scoreResult.components && scoreResult.components.spacingPenalty && scoreResult.components.spacingPenalty.occurrences
      ? scoreResult.components.spacingPenalty.occurrences.length : 0;
    var preLeaveOccurrences = scoreResult.components && scoreResult.components.preLeavePenalty && scoreResult.components.preLeavePenalty.occurrences
      ? scoreResult.components.preLeavePenalty.occurrences.length : 0;
    var adjacencyOccurrences = scoreResult.components && scoreResult.components.standbyAdjacencyPenalty && scoreResult.components.standbyAdjacencyPenalty.occurrences
      ? scoreResult.components.standbyAdjacencyPenalty.occurrences.length : 0;
    rows.push(['Spacing', spacingOccurrences, '', '', '', '', '', '', '', '']);
    rows.push(['PreLeave', preLeaveOccurrences, '', '', '', '', '', '', '', '']);
    rows.push(['Adjacency', adjacencyOccurrences, '', '', '', '', '', '', '', '']);

    // Top / bottom
    rows.push(['', '', '', '', '', '', '', '', '', '']);
    rows.push(['Top Doctors by Call Points', '', '', '', '', '', '', '', '', '']);
    for (var t = 0; t < topBottom.top.length; t++) {
      rows.push([topBottom.top[t].fullName, topBottom.top[t].totalCallPoints || 0, '', '', '', '', '', '', '', '']);
    }
    rows.push(['Bottom Doctors by Call Points', '', '', '', '', '', '', '', '', '']);
    for (var btm = 0; btm < topBottom.bottom.length; btm++) {
      rows.push([topBottom.bottom[btm].fullName, topBottom.bottom[btm].totalCallPoints || 0, '', '', '', '', '', '', '', '']);
    }

    if (DIAG.warnings.length > 0) {
      rows.push(['', '', '', '', '', '', '', '', '', '']);
      rows.push(['Warnings', '', '', '', '', '', '', '', '', '']);
      for (var w = 0; w < DIAG.warnings.length; w++) {
        rows.push([DIAG.warnings[w].code, DIAG.warnings[w].msg, '', '', '', '', '', '', '', '']);
      }
    }

    return shapeRect_(rows, CFG.reportWidth);
  }

  function writeReport_(sheet, rows) {
    try {
      assertRect_(rows, CFG.reportWidth);
      RUN.writeAttempted = true;
      sheet.getRange(CFG.rowReportStart, CFG.colReportStart, CFG.maxReportRows, CFG.reportWidth).clearContent();
      sheet.getRange(CFG.rowReportStart, CFG.colReportStart, rows.length, CFG.reportWidth).setValues(rows);
      RUN.writeSuccess = true;
    } catch (err) {
      addBlocker_('REPORT_WRITE_FAILED', 'Failed writing report to sheet: ' + err.message, {
        rowCount: rows ? rows.length : 0,
        width: CFG.reportWidth
      });
      RUN.writeSuccess = false;
    }
  }

  function emitExecutionLog_(payload) {
    // Lean logger: summary always, details only when non-empty.

    var summary = {
      status: payload.status,
      runId: payload.runId,
      startedAtIso: payload.startedAtIso,
      finishedAtIso: payload.finishedAtIso,
      scorerMode: payload.scorerMode,
      okToWrite: payload.okToWrite,
      writeAttempted: payload.writeAttempted,
      writeSuccess: payload.writeSuccess,
      counts: payload.counts,
      blockerCount: payload.blockers ? payload.blockers.length : 0,
      warningCount: payload.warnings ? payload.warnings.length : 0,
      warningOverflowCount: payload.warningOverflowCount || 0
    };

    Logger.log(JSON.stringify(summary, null, 2));

    if (payload.blockers && payload.blockers.length > 0) {
      Logger.log('BLOCKERS: ' + JSON.stringify(payload.blockers, null, 2));
    }

    if (payload.warnings && payload.warnings.length > 0) {
      Logger.log('WARNINGS: ' + JSON.stringify(payload.warnings, null, 2));
    }

    var hasUnknownSamples =
      payload.samples &&
      payload.samples.unknownDoctors &&
      payload.samples.unknownDoctors.length > 0;

    var hasParseSamples =
      payload.samples &&
      payload.samples.parseErrors &&
      payload.samples.parseErrors.length > 0;

    if (hasUnknownSamples || hasParseSamples) {
      Logger.log('SAMPLES: ' + JSON.stringify(payload.samples, null, 2));
    }
  }

  try {
    logEvent_('INFO', 'START', 'Manual roster hotfix scoring started.');
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(CFG.sheetName);

    if (!sheet) {
      addBlocker_('SHEET_NOT_FOUND', 'Sheet not found: ' + CFG.sheetName);
    } else {
      RUN.status = 'SHEET_OK';
      RAW = readManualGrid_(sheet);

      if (DIAG.blockers.length === 0) {
        RUN.status = 'READ_OK';
        CTX = buildContext_(RAW);
      }

      if (DIAG.blockers.length === 0) {
        RUN.status = 'CONTEXT_OK';
        ALLOC = buildAllocation_(RAW, CTX);
      }

      if (DIAG.blockers.length === 0 && ALLOC && ALLOC.allocation) {
        RUN.status = 'ALLOCATION_OK';
        SCORE = runScoring_(ALLOC.allocation, CTX);
      }

      HEALTH = assessHealth_(ALLOC, SCORE);
      RUN.okToWrite = HEALTH.okToWrite;

      if (HEALTH.okToWrite) {
        var reportRows = buildReportRows_(SCORE, ALLOC);
        writeReport_(sheet, reportRows);
        RUN.status = RUN.writeSuccess ? 'WRITE_OK' : 'FAILED_NO_WRITE';
      } else {
        RUN.status = 'FAILED_NO_WRITE';
        logEvent_('WARN', 'WRITE_SKIPPED', 'Write skipped because run health is not ok.', {
          blockerCount: HEALTH.blockers.length
        });
      }
    }
  } catch (outerErr) {
    addBlocker_('UNHANDLED_EXCEPTION', 'Unhandled error in runManualRosterScoringHotfix: ' + outerErr.message, {
      stack: outerErr && outerErr.stack ? String(outerErr.stack) : null
    });
    RUN.status = 'FAILED_NO_WRITE';
  }

  var payload = {
    status: RUN.status,
    runId: RUN.runId,
    startedAtIso: RUN.startedAtIso,
    finishedAtIso: new Date().toISOString(),
    scorerMode: RUN.scorerMode,
    okToWrite: RUN.okToWrite,
    writeAttempted: RUN.writeAttempted,
    writeSuccess: RUN.writeSuccess,
    blockers: (HEALTH && HEALTH.blockers) ? HEALTH.blockers : DIAG.blockers,
    warnings: (HEALTH && HEALTH.warnings) ? HEALTH.warnings : DIAG.warnings,
    warningOverflowCount: DIAG.warningOverflowCount,
    counts: DIAG.counts,
    samples: DIAG.samples,
    logs: LOGS
  };

  emitExecutionLog_(payload);
  return payload;
}