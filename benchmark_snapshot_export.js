function getPhase12BenchmarkSnapshotExportDefaults_() {
  return {
    trialCount: 1,
    seed: null
  };
}

function sanitizePhase12ArtifactNamePart_(value, fallbackValue) {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || fallbackValue;
}

function buildPhase12BenchmarkSnapshotExportContext_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const timezone = spreadsheet.getSpreadsheetTimeZone()
    || Session.getScriptTimeZone()
    || "Asia/Singapore";

  const exportedAt = new Date();

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet ? sheet.getName() : null,
    timezone: timezone,
    exportedAt: exportedAt,
    exportedAtStamp: Utilities.formatDate(exportedAt, timezone, "yyyyMMdd_HHmmss"),
    exportedAtIso: Utilities.formatDate(exportedAt, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'")
  };
}

function buildPhase12BenchmarkSnapshotFileName_(snapshot, context) {
  const contractVersion = snapshot && snapshot.contractVersion
    ? snapshot.contractVersion
    : "compute_snapshot_v2";

  const spreadsheetPart = sanitizePhase12ArtifactNamePart_(
    context && context.spreadsheetName ? context.spreadsheetName : null,
    "spreadsheet"
  );

  const sheetPart = sanitizePhase12ArtifactNamePart_(
    context && context.sheetName ? context.sheetName : null,
    "sheet"
  );

  const trialCountPart = snapshot
    && snapshot.trialSpec
    && typeof snapshot.trialSpec.trialCount === "number"
    ? String(snapshot.trialSpec.trialCount)
    : "unknown";

  const seedValue = snapshot
    && snapshot.trialSpec
    && Object.prototype.hasOwnProperty.call(snapshot.trialSpec, "seed")
    ? snapshot.trialSpec.seed
    : null;

  const seedPart = seedValue === null || seedValue === undefined || seedValue === ""
    ? "null"
    : sanitizePhase12ArtifactNamePart_(String(seedValue), "seed");

  const timestampPart = context && context.exportedAtStamp
    ? context.exportedAtStamp
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Singapore", "yyyyMMdd_HHmmss");

  return [
    contractVersion,
    spreadsheetPart,
    sheetPart,
    timestampPart,
    "t" + trialCountPart,
    "seed-" + seedPart
  ].join("__") + ".json";
}

function buildPhase12BenchmarkSnapshotFileDescription_(snapshot, context) {
  const parts = [
    "Phase 12 benchmark compute snapshot artifact",
    "contractVersion=" + (snapshot && snapshot.contractVersion ? snapshot.contractVersion : "unknown"),
    "spreadsheetId=" + (context && context.spreadsheetId ? context.spreadsheetId : "unknown"),
    "sheetName=" + (context && context.sheetName ? context.sheetName : "unknown"),
    "exportedAt=" + (context && context.exportedAtIso ? context.exportedAtIso : "unknown")
  ];

  return parts.join(" | ");
}

function exportPhase12BenchmarkSnapshotToDrive_() {
  const defaults = getPhase12BenchmarkSnapshotExportDefaults_();
  const context = buildPhase12BenchmarkSnapshotExportContext_();

  const prepared = prepareRandomTrialsSnapshot_(defaults.trialCount, {
    seed: defaults.seed
  });

  if (prepared.ok !== true) {
    return {
      ok: false,
      message: prepared.message || "Failed to prepare compute snapshot for Drive export.",
      stage: "prepare_snapshot",
      trialCount: defaults.trialCount,
      seed: defaults.seed,
      prepared: prepared
    };
  }

  const snapshotValidation = validateComputeSnapshot_(prepared.snapshot);

  if (snapshotValidation.ok !== true) {
    return {
      ok: false,
      message: snapshotValidation.message || "Prepared compute snapshot is invalid.",
      stage: "validate_snapshot",
      trialCount: defaults.trialCount,
      seed: defaults.seed,
      validation: snapshotValidation
    };
  }

  const driveLayout = ensurePhase12BenchmarkDriveLayout_();

  if (driveLayout.ok !== true) {
    return {
      ok: false,
      message: driveLayout.message || "Failed to resolve Phase 12 benchmark Drive layout.",
      stage: "resolve_drive_layout",
      trialCount: defaults.trialCount,
      seed: defaults.seed,
      driveLayout: driveLayout
    };
  }

  const snapshot = prepared.snapshot;
  const fileName = buildPhase12BenchmarkSnapshotFileName_(snapshot, context);
  const jsonText = JSON.stringify(snapshot, null, 2);
  const blob = Utilities.newBlob(jsonText, "application/json", fileName);
  const file = driveLayout.snapshotsFolder.createFile(blob);

  file.setDescription(buildPhase12BenchmarkSnapshotFileDescription_(snapshot, context));

  return {
    ok: true,
    message: "Phase 12 benchmark snapshot exported to Drive.",
    contractVersion: snapshot.contractVersion,
    trialSpec: {
      trialCount: snapshot.trialSpec ? snapshot.trialSpec.trialCount : null,
      seed: snapshot.trialSpec ? snapshot.trialSpec.seed : null
    },
    metadata: {
      dateCount: snapshot.metadata ? snapshot.metadata.dateCount : null,
      doctorCount: snapshot.metadata ? snapshot.metadata.doctorCount : null
    },
    spreadsheet: {
      spreadsheetId: context.spreadsheetId,
      spreadsheetName: context.spreadsheetName,
      sheetName: context.sheetName,
      timezone: context.timezone
    },
    export: {
      exportedAtIso: context.exportedAtIso,
      exportedAtStamp: context.exportedAtStamp,
      fileId: file.getId(),
      fileName: file.getName(),
      fileSizeBytes: blob.getBytes().length,
      mimeType: blob.getContentType()
    },
    drive: {
      rootFolderId: driveLayout.folderIds ? driveLayout.folderIds.rootFolderId : null,
      snapshotsFolderId: driveLayout.folderIds ? driveLayout.folderIds.snapshotsFolderId : null,
      benchmarkRunsFolderId: driveLayout.folderIds ? driveLayout.folderIds.benchmarkRunsFolderId : null,
      snapshotsFolderName: driveLayout.folderNames ? driveLayout.folderNames.snapshotsFolderName : null
    }
  };
}