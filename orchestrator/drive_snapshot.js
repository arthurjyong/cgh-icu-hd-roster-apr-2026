'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { createDriveAuthGateway } = require('../tools/phase12_large_benchmark/launcher_drive_auth');

function ensureDir(dirPath) {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true });
}

function sanitizeFileName(name, fallback) {
  const source = typeof name === 'string' && name.trim() ? name.trim() : String(fallback || 'snapshot.json');
  const cleaned = source
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || 'snapshot.json';
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function streamToFile(readStream, destinationPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destinationPath);

    readStream.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);

    readStream.pipe(output);
  });
}

async function lookupDriveFileMetadata(drive, fileId) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size,md5Checksum,createdTime,modifiedTime'
    });

    return response && response.data ? response.data : null;
  } catch (error) {
    throw new Error(`Drive file lookup failed for ID ${fileId}: ${error.message}`);
  }
}

async function downloadDriveFileToPath(drive, fileId, destinationPath) {
  try {
    const response = await drive.files.get(
      {
        fileId,
        alt: 'media'
      },
      {
        responseType: 'stream'
      }
    );

    if (!response || !response.data || typeof response.data.pipe !== 'function') {
      throw new Error('Drive download response did not return a readable stream.');
    }

    await streamToFile(response.data, destinationPath);
  } catch (error) {
    throw new Error(`Drive file download failed for ID ${fileId}: ${error.message}`);
  }
}

function validateRequiredString(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

async function downloadSnapshotFromDrive(options) {
  const source = options || {};
  const fileId = validateRequiredString('fileId', source.fileId);
  const outputDir = path.resolve(validateRequiredString('outputDir', source.outputDir));
  const config = source.config || {};

  validateRequiredString('config.driveOAuthClientCredentialsFile', config.driveOAuthClientCredentialsFile);
  validateRequiredString('config.driveOAuthTokenFile', config.driveOAuthTokenFile);

  ensureDir(outputDir);

  const gateway = await createDriveAuthGateway({
    config: {
      driveOAuthClientCredentialsFile: config.driveOAuthClientCredentialsFile,
      driveOAuthTokenFile: config.driveOAuthTokenFile
    }
  });

  const metadata = await lookupDriveFileMetadata(gateway.drive, fileId);
  if (!metadata) {
    throw new Error(`Drive file lookup returned no metadata for ID ${fileId}.`);
  }

  const resolvedFileName = sanitizeFileName(
    metadata.name,
    typeof source.fileNameHint === 'string' && source.fileNameHint.trim()
      ? source.fileNameHint.trim()
      : `${fileId}.json`
  );
  const localPath = path.join(outputDir, resolvedFileName);

  await downloadDriveFileToPath(gateway.drive, fileId, localPath);

  if (!fs.existsSync(localPath)) {
    throw new Error(`Downloaded file was not created: ${localPath}`);
  }

  const stat = fs.statSync(localPath);
  if (!stat.isFile()) {
    throw new Error(`Downloaded path is not a file: ${localPath}`);
  }
  if (stat.size <= 0) {
    throw new Error(`Downloaded file is empty: ${localPath}`);
  }

  return {
    fileId,
    fileName: resolvedFileName,
    mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType : null,
    localPath,
    sha256: computeFileSha256(localPath),
    byteSize: stat.size,
    downloadedAt: new Date().toISOString(),
    usedCachedToken: !!gateway.usedCachedToken,
    principalEmail: gateway.principalEmail || null,
    principalDisplayName: gateway.principalDisplayName || null,
    driveMetadata: {
      size: metadata.size != null ? String(metadata.size) : null,
      md5Checksum: typeof metadata.md5Checksum === 'string' ? metadata.md5Checksum : null,
      createdTime: typeof metadata.createdTime === 'string' ? metadata.createdTime : null,
      modifiedTime: typeof metadata.modifiedTime === 'string' ? metadata.modifiedTime : null
    }
  };
}

module.exports = {
  downloadSnapshotFromDrive
};
