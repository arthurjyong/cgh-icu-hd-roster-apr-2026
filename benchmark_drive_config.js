function getPhase12BenchmarkDrivePropertyKeys_() {
  return {
    rootFolderId: "PHASE12_BENCHMARK_DRIVE_ROOT_FOLDER_ID",
    snapshotsFolderId: "PHASE12_BENCHMARK_DRIVE_SNAPSHOTS_FOLDER_ID",
    benchmarkRunsFolderId: "PHASE12_BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_ID"
  };
}

function getPhase12BenchmarkDriveFolderNames_() {
  return {
    rootFolderName: "cgh-icu-hd-roster-apr-2026",
    snapshotsFolderName: "snapshots",
    benchmarkRunsFolderName: "benchmark_runs"
  };
}

function getStoredPhase12BenchmarkDriveFolderIds_() {
  const keys = getPhase12BenchmarkDrivePropertyKeys_();
  const properties = PropertiesService.getScriptProperties();

  return {
    rootFolderId: properties.getProperty(keys.rootFolderId),
    snapshotsFolderId: properties.getProperty(keys.snapshotsFolderId),
    benchmarkRunsFolderId: properties.getProperty(keys.benchmarkRunsFolderId)
  };
}

function persistPhase12BenchmarkDriveFolderIds_(folderIds) {
  const keys = getPhase12BenchmarkDrivePropertyKeys_();
  const properties = PropertiesService.getScriptProperties();
  const values = {};

  values[keys.rootFolderId] = folderIds && folderIds.rootFolderId
    ? String(folderIds.rootFolderId)
    : "";

  values[keys.snapshotsFolderId] = folderIds && folderIds.snapshotsFolderId
    ? String(folderIds.snapshotsFolderId)
    : "";

  values[keys.benchmarkRunsFolderId] = folderIds && folderIds.benchmarkRunsFolderId
    ? String(folderIds.benchmarkRunsFolderId)
    : "";

  properties.setProperties(values, false);
}

function tryGetDriveFolderById_(folderId) {
  if (typeof folderId !== "string" || !folderId.trim()) {
    return null;
  }

  try {
    return DriveApp.getFolderById(folderId.trim());
  } catch (error) {
    return null;
  }
}

function folderHasParentFolderId_(folder, parentFolderId) {
  if (!folder || typeof parentFolderId !== "string" || !parentFolderId.trim()) {
    return false;
  }

  const parents = folder.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() === parentFolderId) {
      return true;
    }
  }

  return false;
}

function findSingleDriveFolderByNameOrNull_(folderName, disambiguationPropertyKey) {
  const iterator = DriveApp.getFoldersByName(folderName);
  const matches = [];

  while (iterator.hasNext() && matches.length < 2) {
    matches.push(iterator.next());
  }

  if (matches.length === 0) {
    return {
      ok: true,
      folder: null,
      matchCount: 0
    };
  }

  if (matches.length > 1 || iterator.hasNext()) {
    return {
      ok: false,
      message:
        'Multiple Drive folders named "' + folderName + '" were found. ' +
        "Set Script Property " + disambiguationPropertyKey + " to the intended folder ID."
    };
  }

  return {
    ok: true,
    folder: matches[0],
    matchCount: 1
  };
}

function findSingleChildFolderByNameOrNull_(parentFolder, childFolderName, disambiguationPropertyKey) {
  const iterator = parentFolder.getFoldersByName(childFolderName);
  const matches = [];

  while (iterator.hasNext() && matches.length < 2) {
    matches.push(iterator.next());
  }

  if (matches.length === 0) {
    return {
      ok: true,
      folder: null,
      matchCount: 0
    };
  }

  if (matches.length > 1 || iterator.hasNext()) {
    return {
      ok: false,
      message:
        'Multiple child folders named "' + childFolderName + '" were found under root folder ID ' +
        parentFolder.getId() + ". Set Script Property " + disambiguationPropertyKey +
        " to the intended folder ID."
    };
  }

  return {
    ok: true,
    folder: matches[0],
    matchCount: 1
  };
}

function resolvePhase12BenchmarkRootFolder_(storedFolderIds, folderNames, propertyKeys) {
  const storedFolder = tryGetDriveFolderById_(
    storedFolderIds ? storedFolderIds.rootFolderId : null
  );

  if (storedFolder) {
    return {
      ok: true,
      folder: storedFolder,
      source: "SCRIPT_PROPERTIES",
      created: false
    };
  }

  const discovered = findSingleDriveFolderByNameOrNull_(
    folderNames.rootFolderName,
    propertyKeys.rootFolderId
  );

  if (discovered.ok !== true) {
    return discovered;
  }

  if (discovered.folder) {
    return {
      ok: true,
      folder: discovered.folder,
      source: "DISCOVERED_BY_NAME",
      created: false
    };
  }

  return {
    ok: true,
    folder: DriveApp.createFolder(folderNames.rootFolderName),
    source: "CREATED_BY_NAME",
    created: true
  };
}

function resolvePhase12BenchmarkChildFolder_(rootFolder, storedFolderId, childFolderName, propertyKey) {
  const storedFolder = tryGetDriveFolderById_(storedFolderId);

  if (storedFolder && folderHasParentFolderId_(storedFolder, rootFolder.getId())) {
    return {
      ok: true,
      folder: storedFolder,
      source: "SCRIPT_PROPERTIES",
      created: false
    };
  }

  const discovered = findSingleChildFolderByNameOrNull_(
    rootFolder,
    childFolderName,
    propertyKey
  );

  if (discovered.ok !== true) {
    return discovered;
  }

  if (discovered.folder) {
    return {
      ok: true,
      folder: discovered.folder,
      source: "DISCOVERED_BY_NAME",
      created: false
    };
  }

  return {
    ok: true,
    folder: rootFolder.createFolder(childFolderName),
    source: "CREATED_BY_NAME",
    created: true
  };
}

function ensurePhase12BenchmarkDriveLayout_() {
  const propertyKeys = getPhase12BenchmarkDrivePropertyKeys_();
  const folderNames = getPhase12BenchmarkDriveFolderNames_();
  const storedFolderIdsBefore = getStoredPhase12BenchmarkDriveFolderIds_();

  const rootResult = resolvePhase12BenchmarkRootFolder_(
    storedFolderIdsBefore,
    folderNames,
    propertyKeys
  );

  if (rootResult.ok !== true) {
    return {
      ok: false,
      message: rootResult.message || "Failed to resolve Phase 12 benchmark root Drive folder.",
      propertyKeys: propertyKeys,
      folderNames: folderNames,
      storedFolderIdsBefore: storedFolderIdsBefore
    };
  }

  const snapshotsResult = resolvePhase12BenchmarkChildFolder_(
    rootResult.folder,
    storedFolderIdsBefore.snapshotsFolderId,
    folderNames.snapshotsFolderName,
    propertyKeys.snapshotsFolderId
  );

  if (snapshotsResult.ok !== true) {
    return {
      ok: false,
      message: snapshotsResult.message || "Failed to resolve Phase 12 snapshots Drive folder.",
      propertyKeys: propertyKeys,
      folderNames: folderNames,
      storedFolderIdsBefore: storedFolderIdsBefore,
      rootFolderId: rootResult.folder.getId()
    };
  }

  const benchmarkRunsResult = resolvePhase12BenchmarkChildFolder_(
    rootResult.folder,
    storedFolderIdsBefore.benchmarkRunsFolderId,
    folderNames.benchmarkRunsFolderName,
    propertyKeys.benchmarkRunsFolderId
  );

  if (benchmarkRunsResult.ok !== true) {
    return {
      ok: false,
      message: benchmarkRunsResult.message || "Failed to resolve Phase 12 benchmark_runs Drive folder.",
      propertyKeys: propertyKeys,
      folderNames: folderNames,
      storedFolderIdsBefore: storedFolderIdsBefore,
      rootFolderId: rootResult.folder.getId()
    };
  }

  const resolvedFolderIds = {
    rootFolderId: rootResult.folder.getId(),
    snapshotsFolderId: snapshotsResult.folder.getId(),
    benchmarkRunsFolderId: benchmarkRunsResult.folder.getId()
  };

  persistPhase12BenchmarkDriveFolderIds_(resolvedFolderIds);

  return {
    ok: true,
    message: "Phase 12 benchmark Drive layout resolved.",
    propertyKeys: propertyKeys,
    folderNames: folderNames,
    storedFolderIdsBefore: storedFolderIdsBefore,
    folderIds: resolvedFolderIds,

    resolution: {
      rootFolder: {
        source: rootResult.source,
        created: rootResult.created
      },
      snapshotsFolder: {
        source: snapshotsResult.source,
        created: snapshotsResult.created
      },
      benchmarkRunsFolder: {
        source: benchmarkRunsResult.source,
        created: benchmarkRunsResult.created
      }
    },

    rootFolder: rootResult.folder,
    snapshotsFolder: snapshotsResult.folder,
    benchmarkRunsFolder: benchmarkRunsResult.folder
  };
}

function getPhase12BenchmarkDriveRootFolder_() {
  const layout = ensurePhase12BenchmarkDriveLayout_();
  if (layout.ok !== true) {
    throw new Error(layout.message || "Failed to resolve Phase 12 benchmark Drive root folder.");
  }

  return layout.rootFolder;
}

function getPhase12BenchmarkSnapshotsFolder_() {
  const layout = ensurePhase12BenchmarkDriveLayout_();
  if (layout.ok !== true) {
    throw new Error(layout.message || "Failed to resolve Phase 12 benchmark snapshots Drive folder.");
  }

  return layout.snapshotsFolder;
}

function getPhase12BenchmarkRunsFolder_() {
  const layout = ensurePhase12BenchmarkDriveLayout_();
  if (layout.ok !== true) {
    throw new Error(layout.message || "Failed to resolve Phase 12 benchmark runs Drive folder.");
  }

  return layout.benchmarkRunsFolder;
}

function debugEnsurePhase12BenchmarkDriveLayout() {
  const layout = ensurePhase12BenchmarkDriveLayout_();

  Logger.log(JSON.stringify({
    ok: layout.ok === true,
    message: layout.message || null,
    propertyKeys: layout.propertyKeys || null,
    folderNames: layout.folderNames || null,
    storedFolderIdsBefore: layout.storedFolderIdsBefore || null,
    folderIds: layout.folderIds || null,
    resolution: layout.resolution || null
  }, null, 2));
}