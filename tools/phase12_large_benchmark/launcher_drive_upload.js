'use strict';

const fs = require('fs');
const path = require('path');

const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

function escapeDriveQueryString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getDriveFileOrThrow(drive, fileId, fields) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: fields || 'id,name,mimeType,parents',
      supportsAllDrives: true
    });
    return response.data;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    throw new Error(`Drive file lookup failed for ID ${fileId}: ${message}`);
  }
}

function ensureFolderMimeType(file, description) {
  if (!file || file.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
    throw new Error(`${description} is not a Drive folder.`);
  }
}

function ensureParentRelationship(file, expectedParentId, description) {
  const parents = Array.isArray(file && file.parents) ? file.parents : [];
  if (!parents.includes(expectedParentId)) {
    throw new Error(`${description} is not under expected parent folder ID ${expectedParentId}.`);
  }
}

async function listChildFoldersByName(drive, parentFolderId, folderName) {
  const query = [
    `'${escapeDriveQueryString(parentFolderId)}' in parents`,
    `name='${escapeDriveQueryString(folderName)}'`,
    `mimeType='${DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed=false'
  ].join(' and ');

  const response = await drive.files.list({
    q: query,
    fields: 'files(id,name,mimeType,parents)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  return Array.isArray(response.data && response.data.files)
    ? response.data.files
    : [];
}

async function createDriveFolder(drive, parentFolderId, folderName) {
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [parentFolderId]
    },
    fields: 'id,name,mimeType,parents',
    supportsAllDrives: true
  });

  return response.data;
}

async function resolveOrCreateChildFolderByName(drive, parentFolderId, folderName) {
  const existing = await listChildFoldersByName(drive, parentFolderId, folderName);

  if (existing.length > 1) {
    throw new Error(
      `Multiple Drive folders named ${folderName} were found under parent folder ID ${parentFolderId}.`
    );
  }

  if (existing.length === 1) {
    return existing[0];
  }

  return createDriveFolder(drive, parentFolderId, folderName);
}

async function resolveNestedFolderPath(drive, rootFolder, relativeFolderPath, folderCache) {
  const cache = folderCache || new Map();
  const normalizedRelativeFolderPath = String(relativeFolderPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');

  if (!normalizedRelativeFolderPath) {
    return rootFolder;
  }

  const cacheKey = `${rootFolder.id}:${normalizedRelativeFolderPath}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const segments = normalizedRelativeFolderPath.split('/').filter(Boolean);
  let currentFolder = rootFolder;
  let traversedPath = '';

  for (const segment of segments) {
    traversedPath = traversedPath ? `${traversedPath}/${segment}` : segment;
    const segmentCacheKey = `${rootFolder.id}:${traversedPath}`;

    if (cache.has(segmentCacheKey)) {
      currentFolder = cache.get(segmentCacheKey);
      continue;
    }

    currentFolder = await resolveOrCreateChildFolderByName(drive, currentFolder.id, segment);
    cache.set(segmentCacheKey, currentFolder);
  }

  cache.set(cacheKey, currentFolder);
  return currentFolder;
}

async function resolveBenchmarkRunsFolder(drive, config) {
  const rootFolder = await getDriveFileOrThrow(
    drive,
    config.driveRootFolderId,
    'id,name,mimeType,parents'
  );
  ensureFolderMimeType(rootFolder, `Drive root folder ${config.driveRootFolderId}`);

  if (config.driveBenchmarkRunsFolderId) {
    const benchmarkRunsFolder = await getDriveFileOrThrow(
      drive,
      config.driveBenchmarkRunsFolderId,
      'id,name,mimeType,parents'
    );
    ensureFolderMimeType(
      benchmarkRunsFolder,
      `Drive benchmark_runs folder ${config.driveBenchmarkRunsFolderId}`
    );
    ensureParentRelationship(
      benchmarkRunsFolder,
      rootFolder.id,
      `Drive benchmark_runs folder ${config.driveBenchmarkRunsFolderId}`
    );

    return {
      rootFolder,
      benchmarkRunsFolder,
      benchmarkRunsFolderSource: 'CONFIGURED_ID'
    };
  }

  const childFolders = await listChildFoldersByName(
    drive,
    rootFolder.id,
    config.driveBenchmarkRunsFolderName
  );

  if (childFolders.length > 1) {
    throw new Error(
      `Multiple Drive folders named ${config.driveBenchmarkRunsFolderName} were found under root folder ID ${rootFolder.id}. ` +
      'Provide PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_ID explicitly.'
    );
  }

  if (childFolders.length === 1) {
    return {
      rootFolder,
      benchmarkRunsFolder: childFolders[0],
      benchmarkRunsFolderSource: 'DISCOVERED_BY_NAME'
    };
  }

  const benchmarkRunsFolder = await createDriveFolder(
    drive,
    rootFolder.id,
    config.driveBenchmarkRunsFolderName
  );

  return {
    rootFolder,
    benchmarkRunsFolder,
    benchmarkRunsFolderSource: 'CREATED_BY_NAME'
  };
}

async function createRunFolderOrThrow(drive, benchmarkRunsFolderId, runFolderName) {
  const existing = await listChildFoldersByName(drive, benchmarkRunsFolderId, runFolderName);

  if (existing.length > 0) {
    throw new Error(
      `Drive run folder already exists under benchmark_runs: ${runFolderName}. ` +
      'Refusing to overwrite existing uploaded artifacts.'
    );
  }

  return createDriveFolder(drive, benchmarkRunsFolderId, runFolderName);
}

async function uploadFile(drive, options) {
  const source = options || {};
  const localPath = path.resolve(source.localPath);
  const parentFolderId = source.parentFolderId;
  const fileName = source.fileName || path.basename(localPath);
  const mimeType = source.mimeType || 'application/json';

  if (!fs.existsSync(localPath)) {
    throw new Error(`Upload source file not found: ${localPath}`);
  }

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId]
    },
    media: {
      mimeType,
      body: fs.createReadStream(localPath)
    },
    fields: 'id,name,mimeType,parents,size',
    supportsAllDrives: true
  });

  return response.data;
}

async function findChildFileByName(drive, parentFolderId, fileName) {
  const query = [
    `'${escapeDriveQueryString(parentFolderId)}' in parents`,
    `name='${escapeDriveQueryString(fileName)}'`,
    'trashed=false'
  ].join(' and ');

  const response = await drive.files.list({
    q: query,
    fields: 'files(id,name,mimeType,parents)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const files = Array.isArray(response.data && response.data.files) ? response.data.files : [];
  if (files.length > 1) {
    throw new Error(`Multiple files named ${fileName} were found in folder ${parentFolderId}.`);
  }
  return files.length === 1 ? files[0] : null;
}

async function uploadFinalArtifactsToDrive(options) {
  const source = options || {};
  const driveAuthGateway = source.driveAuthGateway;
  const config = source.config || {};
  const artifactSet = source.artifactSet || {};
  const drive = driveAuthGateway && driveAuthGateway.drive;

  if (!drive) {
    throw new Error('driveAuthGateway.drive is required.');
  }

  if (!artifactSet.runFolderName) {
    throw new Error('artifactSet.runFolderName is required.');
  }

  if (!Array.isArray(artifactSet.files) || artifactSet.files.length === 0) {
    throw new Error('artifactSet.files must contain at least one uploadable file.');
  }

  const folderResolution = await resolveBenchmarkRunsFolder(drive, config);
  const allowExistingRunFolder = source.allowExistingRunFolder === true;
  const existingRunFolders = await listChildFoldersByName(
    drive,
    folderResolution.benchmarkRunsFolder.id,
    artifactSet.runFolderName
  );
  if (existingRunFolders.length > 1) {
    throw new Error(`Multiple run folders named ${artifactSet.runFolderName} were found under benchmark_runs.`);
  }
  let runFolder = null;
  if (existingRunFolders.length === 1) {
    if (!allowExistingRunFolder) {
      throw new Error(
        `Drive run folder already exists under benchmark_runs: ${artifactSet.runFolderName}. ` +
        'Refusing to overwrite existing uploaded artifacts.'
      );
    }
    runFolder = existingRunFolders[0];
  } else {
    runFolder = await createRunFolderOrThrow(
      drive,
      folderResolution.benchmarkRunsFolder.id,
      artifactSet.runFolderName
    );
  }

  const folderCache = new Map();
  const uploadedFiles = [];
  const replaceExistingFiles = source.replaceExistingFiles === true;

  for (const fileDescriptor of artifactSet.files) {
    const relativePath = String(fileDescriptor.relativePath || '').replace(/\\/g, '/');
    const pathParts = relativePath.split('/').filter(Boolean);

    if (pathParts.length === 0) {
      throw new Error(`artifactSet file has empty relativePath: ${relativePath}`);
    }

    const relativeFolderPath = pathParts.length > 1
      ? pathParts.slice(0, pathParts.length - 1).join('/')
      : '';

    const parentFolder = await resolveNestedFolderPath(
      drive,
      runFolder,
      relativeFolderPath,
      folderCache
    );

    const targetFileName = pathParts[pathParts.length - 1];
    if (replaceExistingFiles) {
      const existingFile = await findChildFileByName(drive, parentFolder.id, targetFileName);
      if (existingFile) {
        await drive.files.delete({
          fileId: existingFile.id,
          supportsAllDrives: true
        });
      }
    }

    const driveFile = await uploadFile(drive, {
      localPath: fileDescriptor.localPath,
      parentFolderId: parentFolder.id,
      fileName: targetFileName,
      mimeType: fileDescriptor.mimeType || 'application/json'
    });

    uploadedFiles.push({
      relativePath,
      localPath: path.resolve(fileDescriptor.localPath),
      driveFileId: driveFile.id,
      driveFileName: driveFile.name,
      parentFolderId: parentFolder.id,
      size: driveFile.size || null
    });
  }

  return {
    ok: true,
    authMode: driveAuthGateway.authMode || 'OAUTH_DESKTOP',
    principalEmail: driveAuthGateway.principalEmail || null,
    principalDisplayName: driveAuthGateway.principalDisplayName || null,
    credentialsFilePath: driveAuthGateway.credentialsFilePath || null,
    tokenFilePath: driveAuthGateway.tokenFilePath || null,
    rootFolder: {
      id: folderResolution.rootFolder.id,
      name: folderResolution.rootFolder.name
    },
    benchmarkRunsFolder: {
      id: folderResolution.benchmarkRunsFolder.id,
      name: folderResolution.benchmarkRunsFolder.name,
      source: folderResolution.benchmarkRunsFolderSource
    },
    runFolder: {
      id: runFolder.id,
      name: runFolder.name
    },
    uploadedFiles
  };
}

module.exports = {
  DRIVE_FOLDER_MIME_TYPE,
  createDriveFolder,
  createRunFolderOrThrow,
  escapeDriveQueryString,
  getDriveFileOrThrow,
  listChildFoldersByName,
  resolveBenchmarkRunsFolder,
  resolveNestedFolderPath,
  resolveOrCreateChildFolderByName,
  uploadFile,
  findChildFileByName,
  uploadFinalArtifactsToDrive
};
