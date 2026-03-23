function getScorerConfigSheetName_() {
  return "SCORER_CONFIG";
}

function getScorerConfigHeaderRow_() {
  return ["Key", "Value", "Description", "Effect", "Suggested Range", "Notes"];
}

function getScorerConfigDataStartRow_() {
  return 3;
}

function cloneSimpleObject_(source) {
  const target = {};
  const keys = Object.keys(source || {});

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    target[key] = source[key];
  }

  return target;
}

function getScorerFingerprintVersion_() {
  return "v1";
}

function getScorerIdentityPayloadVersion_() {
  return "scorer_identity_payload_v1";
}

function stableSortObjectKeysDeep_(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObjectKeysDeep_);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const keys = Object.keys(value).sort();
  const result = {};

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    result[key] = stableSortObjectKeysDeep_(value[key]);
  }

  return result;
}

function stableStringifyJson_(value) {
  return JSON.stringify(stableSortObjectKeysDeep_(value));
}

function computeSha256HexForScorerFingerprint_(text) {
  const normalizedText = String(text === null || text === undefined ? "" : text);

  if (typeof __PURE_COMPUTE_SHA256_HEX__ === "function") {
    return __PURE_COMPUTE_SHA256_HEX__(normalizedText);
  }

  if (typeof Utilities !== "undefined" && Utilities && typeof Utilities.computeDigest === "function") {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizedText);
    let hex = "";

    for (let i = 0; i < digest.length; i++) {
      let value = digest[i];
      if (value < 0) {
        value += 256;
      }
      const piece = value.toString(16);
      hex += piece.length === 1 ? "0" + piece : piece;
    }

    return hex;
  }

  throw new Error("SHA-256 helper is not available for scorer fingerprint generation.");
}

function buildScorerSourceLabel_(scorerConfigResult) {
  if (!scorerConfigResult || typeof scorerConfigResult !== "object") {
    return "UNKNOWN";
  }

  const source = scorerConfigResult.source ? String(scorerConfigResult.source) : "UNKNOWN";
  const sheetName = scorerConfigResult.sheetName ? String(scorerConfigResult.sheetName) : "";

  return sheetName ? source + ":" + sheetName : source;
}

function buildScorerIdentityPayload_(scorerConfigResult) {
  const resolved = scorerConfigResult && typeof scorerConfigResult === "object"
    ? scorerConfigResult
    : {};
  const weights = resolved.weights && typeof resolved.weights === "object"
    ? cloneSimpleObject_(resolved.weights)
    : {};
  const definitions = getScorerConfigDefinitions_();
  const definitionKeys = [];

  for (let i = 0; i < definitions.length; i++) {
    definitionKeys.push(definitions[i].key);
  }

  return {
    payloadVersion: getScorerIdentityPayloadVersion_(),
    scorerFingerprintVersion: getScorerFingerprintVersion_(),
    scorerLogicVersion: typeof getScorerLogicVersion_ === "function"
      ? getScorerLogicVersion_()
      : "unknown",
    scorerContractVersion: typeof getScoringContractVersion_ === "function"
      ? getScoringContractVersion_()
      : null,
    scorerSource: buildScorerSourceLabel_(resolved),
    scorerConfigSource: resolved.source || null,
    scorerConfigSheetName: resolved.sheetName || null,
    scorerConfigDefinitionKeys: definitionKeys,
    scorerComponentKeys: typeof getScorerComponentKeys_ === "function"
      ? getScorerComponentKeys_()
      : [],
    defaultWeights: typeof getDefaultScorerWeights_ === "function"
      ? cloneSimpleObject_(getDefaultScorerWeights_())
      : {},
    resolvedWeights: weights
  };
}

function attachScorerFingerprintMetadata_(scorerConfigResult) {
  const source = scorerConfigResult && typeof scorerConfigResult === "object"
    ? cloneSimpleObject_(scorerConfigResult)
    : {};
  const payload = buildScorerIdentityPayload_(source);
  const payloadJson = stableStringifyJson_(payload);
  const fullHash = computeSha256HexForScorerFingerprint_(payloadJson);
  const fingerprintVersion = getScorerFingerprintVersion_();
  const scorerSource = buildScorerSourceLabel_(source);

  source.scorerIdentityPayload = payload;
  source.scorerIdentityPayloadJson = payloadJson;
  source.scorerFingerprintVersion = fingerprintVersion;
  source.scorerFingerprintHash = fullHash;
  source.scorerFingerprint = "scorerfp:" + fingerprintVersion + ":" + fullHash;
  source.scorerFingerprintShort = "scorerfp:" + fingerprintVersion + ":" + fullHash.slice(0, 16);
  source.scorerSource = scorerSource;

  return source;
}

function getScorerConfigDefinitions_() {
  const defaults = getDefaultScorerWeights_();

  return [
    {
      key: "UNFILLED_SLOT_PENALTY_MULTIPLIER",
      defaultValue: defaults.UNFILLED_SLOT_PENALTY_MULTIPLIER,
      description: "Penalty multiplier per unfilled slot.",
      effect: "Very large penalty so rosters with empty required slots lose heavily.",
      suggestedRange: "> 0, usually very large (e.g. 100000 to 5000000)",
      notes: "Must be > 0. Keep this much larger than normal soft-score components.",
      required: true,
      mustBeNumber: true,
      minExclusive: 0
    },
    {
      key: "WITHIN_SECTION_POINT_BALANCE_WEIGHT",
      defaultValue: defaults.WITHIN_SECTION_POINT_BALANCE_WEIGHT,
      description: "Weight for point fairness within each doctor section.",
      effect: "Higher value pushes more equal point spread within ICU-only / ICU-HD / HD-only groups.",
      suggestedRange: "0 to 20",
      notes: "May be 0 to disable this component.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "GLOBAL_POINT_BALANCE_WEIGHT",
      defaultValue: defaults.GLOBAL_POINT_BALANCE_WEIGHT,
      description: "Weight for overall point fairness across all doctors.",
      effect: "Higher value makes whole-roster point balance more important.",
      suggestedRange: "> 0, often 0.5 to 20",
      notes: "Must be > 0 because global fairness is a core scorer objective.",
      required: true,
      mustBeNumber: true,
      minExclusive: 0
    },
    {
      key: "BASE_SHORT_GAP_CALL_PENALTY",
      defaultValue: defaults.BASE_SHORT_GAP_CALL_PENALTY,
      description: "Base penalty for short spacing between calls.",
      effect: "Higher value penalizes clustered calls more strongly.",
      suggestedRange: "0 to 1000",
      notes: "May be 0 to disable soft spacing penalty. Gap of 1 day is still handled elsewhere as invalid.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "MAX_SOFT_GAP_DAYS",
      defaultValue: defaults.MAX_SOFT_GAP_DAYS,
      description: "Largest call-gap (in days) that still receives spacing penalty.",
      effect: "Calls closer than or equal to this gap get penalized. Larger gaps get no spacing penalty.",
      suggestedRange: "Integer, 2 to 10",
      notes: "Must be an integer >= 2.",
      required: true,
      mustBeNumber: true,
      integerOnly: true,
      minInclusive: 2
    },
    {
      key: "PRE_LEAVE_CALL_PENALTY",
      defaultValue: defaults.PRE_LEAVE_CALL_PENALTY,
      description: "Penalty for assigning a call immediately before leave/training style dates.",
      effect: "Higher value discourages calls on dates that trigger pre-leave soft penalty.",
      suggestedRange: "0 to 1000",
      notes: "May be 0 to disable this soft penalty.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "CR_CALL_REWARD",
      defaultValue: defaults.CR_CALL_REWARD,
      description: "Reward for assigning a doctor to a day they requested call (CR).",
      effect: "Higher value increases preference for satisfying CR requests.",
      suggestedRange: "0 to 1000",
      notes: "May be 0 to ignore CR reward.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "DUAL_ELIGIBLE_ICU_CALL_BONUS",
      defaultValue: defaults.DUAL_ELIGIBLE_ICU_CALL_BONUS,
      description: "Bonus for assigning dual-eligible doctors to MICU call.",
      effect: "Higher value nudges ICU/HD doctors toward MICU call when otherwise reasonable.",
      suggestedRange: "0 to 500",
      notes: "May be 0 to disable this soft bonus.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "STANDBY_ADJACENT_TO_CALL_PENALTY",
      defaultValue: defaults.STANDBY_ADJACENT_TO_CALL_PENALTY,
      description: "Penalty for standby adjacent to a call for the same doctor.",
      effect: "Higher value discourages call/standby clustering across adjacent days.",
      suggestedRange: "0 to 500",
      notes: "May be 0 to disable this soft penalty.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    },
    {
      key: "STANDBY_COUNT_FAIRNESS_WEIGHT",
      defaultValue: defaults.STANDBY_COUNT_FAIRNESS_WEIGHT,
      description: "Weight for fairness of standby assignment counts.",
      effect: "Higher value pushes more even standby distribution across doctors.",
      suggestedRange: "0 to 20",
      notes: "May be 0 to ignore standby-count fairness.",
      required: true,
      mustBeNumber: true,
      minInclusive: 0
    }
  ];
}

function buildScorerConfigDefinitionMap_() {
  const definitions = getScorerConfigDefinitions_();
  const byKey = {};

  for (let i = 0; i < definitions.length; i++) {
    const definition = definitions[i];
    byKey[definition.key] = definition;
  }

  return byKey;
}

function isScorerConfigRowBlank_(row) {
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    if (cell !== null && cell !== "") {
      return false;
    }
  }

  return true;
}

function normalizeScorerConfigKey_(rawKey) {
  if (rawKey === null || rawKey === undefined) return "";
  return String(rawKey).trim();
}

function parseScorerConfigNumber_(rawValue) {
  if (typeof rawValue === "number") {
    if (isFinite(rawValue)) {
      return { ok: true, value: rawValue };
    }

    return { ok: false, message: "Value must be a finite number." };
  }

  if (rawValue === null || rawValue === undefined) {
    return { ok: false, message: "Value is blank." };
  }

  const text = String(rawValue).trim();
  if (text === "") {
    return { ok: false, message: "Value is blank." };
  }

  const parsed = Number(text);
  if (!isFinite(parsed)) {
    return { ok: false, message: 'Value "' + text + '" is not a valid number.' };
  }

  return { ok: true, value: parsed };
}

function validateScorerConfigValue_(definition, parsedValue) {
  const issues = [];

  if (definition.integerOnly && Math.floor(parsedValue) !== parsedValue) {
    issues.push(definition.key + " must be an integer.");
  }

  if (typeof definition.minInclusive === "number" && parsedValue < definition.minInclusive) {
    issues.push(definition.key + " must be >= " + definition.minInclusive + ".");
  }

  if (typeof definition.minExclusive === "number" && parsedValue <= definition.minExclusive) {
    issues.push(definition.key + " must be > " + definition.minExclusive + ".");
  }

  if (typeof definition.maxInclusive === "number" && parsedValue > definition.maxInclusive) {
    issues.push(definition.key + " must be <= " + definition.maxInclusive + ".");
  }

  if (typeof definition.maxExclusive === "number" && parsedValue >= definition.maxExclusive) {
    issues.push(definition.key + " must be < " + definition.maxExclusive + ".");
  }

  return issues;
}

function readScorerConfigSheet_() {
  const ss = SpreadsheetApp.getActive();
  const sheetName = getScorerConfigSheetName_();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      ok: true,
      exists: false,
      sheetName: sheetName,
      entries: [],
      issues: []
    };
  }

  const startRow = getScorerConfigDataStartRow_();
  const headerRow = getScorerConfigHeaderRow_();
  const columnCount = headerRow.length;
  const definitions = getScorerConfigDefinitions_();
  const rowCount = definitions.length;
  const entries = [];
  const issues = [];
  const rowNumberByKey = {};

  if (rowCount <= 0) {
    return {
      ok: true,
      exists: true,
      sheetName: sheetName,
      entries: [],
      issues: []
    };
  }

  const values = sheet.getRange(startRow, 1, rowCount, columnCount).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowNumber = startRow + i;

    if (isScorerConfigRowBlank_(row)) {
      continue;
    }

    const key = normalizeScorerConfigKey_(row[0]);
    const rawValue = row[1];

    if (!key) {
      issues.push("SCORER_CONFIG row " + rowNumber + " is non-blank but Key is missing.");
      continue;
    }

    if (rowNumberByKey[key]) {
      issues.push(
        'SCORER_CONFIG has duplicate key "' + key + '" at rows ' +
        rowNumberByKey[key] + " and " + rowNumber + "."
      );
      continue;
    }

    rowNumberByKey[key] = rowNumber;

    entries.push({
      rowNumber: rowNumber,
      key: key,
      rawValue: rawValue,
      description: row[2],
      effect: row[3],
      suggestedRange: row[4],
      notes: row[5]
    });
  }

  return {
    ok: issues.length === 0,
    exists: true,
    sheetName: sheetName,
    entries: entries,
    issues: issues
  };
}

function buildResolvedScorerWeights_() {
  const defaults = getDefaultScorerWeights_();
  const sheetName = getScorerConfigSheetName_();
  const readResult = readScorerConfigSheet_();

  if (!readResult.exists) {
    return attachScorerFingerprintMetadata_({
      ok: true,
      source: "CODE_DEFAULTS",
      sheetName: sheetName,
      weights: cloneSimpleObject_(defaults),
      issues: []
    });
  }

  const issues = readResult.issues ? readResult.issues.slice() : [];
  const definitions = getScorerConfigDefinitions_();
  const definitionMap = buildScorerConfigDefinitionMap_();
  const entryByKey = {};
  const parsedOverrides = {};

  for (let i = 0; i < readResult.entries.length; i++) {
    const entry = readResult.entries[i];
    entryByKey[entry.key] = entry;

    const definition = definitionMap[entry.key];
    if (!definition) {
      issues.push(
        'SCORER_CONFIG row ' + entry.rowNumber + ' has unknown key "' + entry.key + '".'
      );
      continue;
    }

    const parsedNumber = parseScorerConfigNumber_(entry.rawValue);
    if (!parsedNumber.ok) {
      issues.push(
        'SCORER_CONFIG row ' + entry.rowNumber + ' key "' + entry.key + '": ' + parsedNumber.message
      );
      continue;
    }

    const valueIssues = validateScorerConfigValue_(definition, parsedNumber.value);
    for (let j = 0; j < valueIssues.length; j++) {
      issues.push(
        'SCORER_CONFIG row ' + entry.rowNumber + ' key "' + entry.key + '": ' + valueIssues[j]
      );
    }

    if (valueIssues.length === 0) {
      parsedOverrides[entry.key] = parsedNumber.value;
    }
  }

  for (let i = 0; i < definitions.length; i++) {
    const definition = definitions[i];
    if (definition.required && !entryByKey[definition.key]) {
      issues.push('SCORER_CONFIG is missing required key "' + definition.key + '".');
    }
  }

  if (issues.length > 0) {
    return attachScorerFingerprintMetadata_({
      ok: false,
      source: "SCORER_CONFIG",
      sheetName: sheetName,
      weights: null,
      issues: issues,
      message: "SCORER_CONFIG exists but is invalid. Fix the sheet or remove the tab to fall back to code defaults."
    });
  }

  const resolvedWeights = cloneSimpleObject_(defaults);
  const overrideKeys = Object.keys(parsedOverrides);

  for (let i = 0; i < overrideKeys.length; i++) {
    const key = overrideKeys[i];
    resolvedWeights[key] = parsedOverrides[key];
  }

  return attachScorerFingerprintMetadata_({
    ok: true,
    source: "SCORER_CONFIG",
    sheetName: sheetName,
    weights: resolvedWeights,
    issues: []
  });
}

function extractExistingScorerConfigValueMap_(sheet) {
  const valueMap = {};
  const startRow = getScorerConfigDataStartRow_();
  const rowCount = getScorerConfigDefinitions_().length;

  if (rowCount <= 0) {
    return valueMap;
  }

  const values = sheet.getRange(startRow, 1, rowCount, 2).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const key = normalizeScorerConfigKey_(row[0]);

    if (!key) {
      continue;
    }

    valueMap[key] = row[1];
  }

  return valueMap;
}

function buildScorerConfigSheetRows_(existingValueMap) {
  const rows = [];
  const definitions = getScorerConfigDefinitions_();

  rows.push([
    "SCORER_CONFIG",
    "Edit the Value column only. If this tab exists, all required keys must stay valid or scoring will fail loudly.",
    "",
    "",
    "",
    ""
  ]);

  rows.push(getScorerConfigHeaderRow_());

  for (let i = 0; i < definitions.length; i++) {
    const definition = definitions[i];
    const preservedValue = existingValueMap && Object.prototype.hasOwnProperty.call(existingValueMap, definition.key)
      ? existingValueMap[definition.key]
      : definition.defaultValue;

    const valueToWrite = preservedValue === "" || preservedValue === null || preservedValue === undefined
      ? definition.defaultValue
      : preservedValue;

    rows.push([
      definition.key,
      valueToWrite,
      definition.description,
      definition.effect,
      definition.suggestedRange,
      definition.notes
    ]);
  }

  return rows;
}

function formatScorerConfigSheet_(sheet, rowCount, columnCount) {
  sheet.setFrozenRows(2);

  sheet.getRange(1, 2, 1, 5).breakApart();
  sheet.getRange(1, 2, 1, 5).merge();

  sheet.getRange(1, 1, 1, columnCount)
    .setFontWeight("bold")
    .setWrap(true);

  sheet.getRange(2, 1, 1, columnCount)
    .setFontWeight("bold");

  sheet.getRange(1, 1, rowCount, columnCount)
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setColumnWidths(1, 1, 240);
  sheet.setColumnWidths(2, 1, 120);
  sheet.setColumnWidths(3, 1, 320);
  sheet.setColumnWidths(4, 1, 360);
  sheet.setColumnWidths(5, 1, 220);
  sheet.setColumnWidths(6, 1, 320);
}

function getScorerConfigValueColumnIndex_() {
  return 2; // Column B
}

function getScorerConfigValueStartRow_() {
  return getScorerConfigDataStartRow_();
}

function getScorerConfigValueRowCount_() {
  return getScorerConfigDefinitions_().length;
}

function getScorerConfigValueRange_(sheet) {
  return sheet.getRange(
    getScorerConfigValueStartRow_(),
    getScorerConfigValueColumnIndex_(),
    getScorerConfigValueRowCount_(),
    1
  );
}

function buildScorerConfigValidationFormula_(rowNumber, definition) {
  const cellRef = "B" + rowNumber;

  if (definition.integerOnly) {
    if (typeof definition.minInclusive === "number") {
      return '=AND(ISNUMBER(' + cellRef + '),' + cellRef + '=INT(' + cellRef + '),' + cellRef + '>=' + definition.minInclusive + ')';
    }

    if (typeof definition.minExclusive === "number") {
      return '=AND(ISNUMBER(' + cellRef + '),' + cellRef + '=INT(' + cellRef + '),' + cellRef + '>' + definition.minExclusive + ')';
    }

    return '=AND(ISNUMBER(' + cellRef + '),' + cellRef + '=INT(' + cellRef + '))';
  }

  if (typeof definition.minExclusive === "number") {
    return '=AND(ISNUMBER(' + cellRef + '),' + cellRef + '>' + definition.minExclusive + ')';
  }

  if (typeof definition.minInclusive === "number") {
    return '=AND(ISNUMBER(' + cellRef + '),' + cellRef + '>=' + definition.minInclusive + ')';
  }

  return '=ISNUMBER(' + cellRef + ')';
}

function applyScorerConfigDataValidation_(sheet) {
  const definitions = getScorerConfigDefinitions_();
  const startRow = getScorerConfigDataStartRow_();

  for (let i = 0; i < definitions.length; i++) {
    const rowNumber = startRow + i;
    const definition = definitions[i];
    const range = sheet.getRange(rowNumber, getScorerConfigValueColumnIndex_());
    const formula = buildScorerConfigValidationFormula_(rowNumber, definition);

    const rule = SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(formula)
      .setAllowInvalid(false)
      .build();

    range.setDataValidation(rule);
  }
}

function removeExistingScorerConfigProtections_(sheet) {
  const sheetProtections = SpreadsheetApp.getActive().getProtections(SpreadsheetApp.ProtectionType.SHEET);

  for (let i = 0; i < sheetProtections.length; i++) {
    const protection = sheetProtections[i];
    const protectedSheet = protection.getRange ? protection.getRange() : null;

    if (protection.getSheet && protection.getSheet() && protection.getSheet().getSheetId() === sheet.getSheetId()) {
      protection.remove();
    }
  }
}

function applyScorerConfigProtection_(sheet) {
  removeExistingScorerConfigProtections_(sheet);

  const protection = sheet.protect()
    .setDescription("SCORER_CONFIG except B3:B12");

  protection.setWarningOnly(false);
  protection.setUnprotectedRanges([getScorerConfigValueRange_(sheet)]);

  // Follow Google's owner-only pattern for protected sheets.
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());

  // Re-add self explicitly after removal.
  protection.addEditor(me);

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}

function initializeScorerConfigSheet_() {
  const ss = SpreadsheetApp.getActive();
  const sheetName = getScorerConfigSheetName_();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const existingValueMap = extractExistingScorerConfigValueMap_(sheet);
  const rows = buildScorerConfigSheetRows_(existingValueMap);
  const rowCount = rows.length;
  const columnCount = rows[0].length;

  sheet.clear();
  sheet.getRange(1, 1, rowCount, columnCount).setValues(rows);
  formatScorerConfigSheet_(sheet, rowCount, columnCount);
  applyScorerConfigDataValidation_(sheet);
  applyScorerConfigProtection_(sheet);

  return {
    ok: true,
    sheetName: sheetName,
    rowCount: rowCount,
    columnCount: columnCount,
    message: "SCORER_CONFIG sheet initialized/refreshed."
  };
}

function setupScorerConfigSheet() {
  const result = initializeScorerConfigSheet_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugReadResolvedScorerWeights() {
  const result = buildResolvedScorerWeights_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
