'use strict';

const fs = require('fs');
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive'
];

function readDesktopOAuthCredentialsFile(credentialsFilePath) {
  const absolutePath = path.resolve(credentialsFilePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Drive OAuth client credentials file not found: ${absolutePath}`);
  }

  const rawText = fs.readFileSync(absolutePath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Drive OAuth client credentials file is not valid JSON: ${absolutePath}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Drive OAuth client credentials JSON must be an object.');
  }

  const clientConfig = parsed.installed || parsed.web;
  if (!clientConfig || typeof clientConfig !== 'object') {
    throw new Error(
      'Drive OAuth client credentials JSON must contain an installed or web client configuration.'
    );
  }

  if (typeof clientConfig.client_id !== 'string' || !clientConfig.client_id.trim()) {
    throw new Error('Drive OAuth client credentials JSON is missing client_id.');
  }

  if (typeof clientConfig.client_secret !== 'string' || !clientConfig.client_secret.trim()) {
    throw new Error('Drive OAuth client credentials JSON is missing client_secret.');
  }

  return {
    absolutePath,
    json: parsed,
    clientConfig
  };
}

function readJsonFileOrNull(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const rawText = fs.readFileSync(absolutePath, 'utf8');

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`OAuth token file is not valid JSON: ${absolutePath}`);
  }
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

async function loadSavedDesktopOAuthTokenIfExists(tokenFilePath) {
  const tokenJson = readJsonFileOrNull(tokenFilePath);

  if (!tokenJson) {
    return null;
  }

  try {
    return google.auth.fromJSON(tokenJson);
  } catch (error) {
    throw new Error(`Failed to load cached OAuth token from ${path.resolve(tokenFilePath)}: ${error.message}`);
  }
}

function buildAuthorizedUserPayload(credentialsFile, authClient) {
  const clientConfig = credentialsFile.clientConfig;
  const refreshToken = authClient
    && authClient.credentials
    && typeof authClient.credentials.refresh_token === 'string'
    && authClient.credentials.refresh_token.trim()
    ? authClient.credentials.refresh_token.trim()
    : '';

  if (!refreshToken) {
    throw new Error(
      'Desktop OAuth flow did not return a refresh_token. Remove the token file and re-authorize, ' +
      'ensuring offline access is granted.'
    );
  }

  return {
    type: 'authorized_user',
    client_id: clientConfig.client_id,
    client_secret: clientConfig.client_secret,
    refresh_token: refreshToken
  };
}

function saveDesktopOAuthToken(tokenFilePath, credentialsFile, authClient) {
  const absolutePath = path.resolve(tokenFilePath);
  ensureParentDirectory(absolutePath);
  const payload = buildAuthorizedUserPayload(credentialsFile, authClient);
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
  return absolutePath;
}

async function fetchCurrentDriveUser(drive) {
  try {
    const response = await drive.about.get({
      fields: 'user(displayName,emailAddress)'
    });

    return response && response.data && response.data.user
      ? response.data.user
      : null;
  } catch (error) {
    return null;
  }
}

async function createDriveAuthGateway(options) {
  const source = options || {};
  const config = source.config || {};
  const credentialsFilePath = config.driveOAuthClientCredentialsFile;
  const tokenFilePath = config.driveOAuthTokenFile;

  if (typeof credentialsFilePath !== 'string' || !credentialsFilePath.trim()) {
    throw new Error('driveOAuthClientCredentialsFile is required for Drive upload.');
  }

  if (typeof tokenFilePath !== 'string' || !tokenFilePath.trim()) {
    throw new Error('driveOAuthTokenFile is required for Drive upload.');
  }

  const credentialsFile = readDesktopOAuthCredentialsFile(credentialsFilePath);
  let authClient = await loadSavedDesktopOAuthTokenIfExists(tokenFilePath);
  let usedCachedToken = !!authClient;

  if (!authClient) {
    authClient = await authenticate({
      scopes: DRIVE_SCOPES,
      keyfilePath: credentialsFile.absolutePath
    });

    saveDesktopOAuthToken(tokenFilePath, credentialsFile, authClient);
    usedCachedToken = false;
  }

  const drive = google.drive({
    version: 'v3',
    auth: authClient
  });

  const currentUser = await fetchCurrentDriveUser(drive);

  return {
    authMode: 'OAUTH_DESKTOP',
    credentialsFilePath: credentialsFile.absolutePath,
    tokenFilePath: path.resolve(tokenFilePath),
    usedCachedToken,
    principalEmail: currentUser && currentUser.emailAddress ? currentUser.emailAddress : null,
    principalDisplayName: currentUser && currentUser.displayName ? currentUser.displayName : null,
    drive,
    authClient
  };
}

module.exports = {
  DRIVE_SCOPES,
  createDriveAuthGateway,
  loadSavedDesktopOAuthTokenIfExists,
  readDesktopOAuthCredentialsFile,
  saveDesktopOAuthToken
};
