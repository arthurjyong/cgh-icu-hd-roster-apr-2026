'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let cachedRuntime = null;
let cachedCacheKey = null;

function getProjectRootDir(options) {
  const source = options || {};
  const envRoot = typeof process.env.TRIAL_COMPUTE_PROJECT_ROOT === 'string'
    ? process.env.TRIAL_COMPUTE_PROJECT_ROOT.trim()
    : '';
  const requestedRoot = typeof source.projectRootDir === 'string'
    ? source.projectRootDir.trim()
    : '';
  const rootDir = requestedRoot || envRoot || path.resolve(__dirname, '..');

  return path.resolve(rootDir);
}

function getPureComputeScriptRelativePaths_() {
  return [
    'engine_snapshot.js',
    'engine_runner.js',
    'allocator_candidates.js',
    'allocator_rules.js',
    'allocator_random.js',
    'rng_seeded.js',
    'scorer_config.js',
    'scorer_main.js'
  ];
}

function getPureComputeScriptPaths(rootDir) {
  const baseDir = getProjectRootDir({ projectRootDir: rootDir });
  return getPureComputeScriptRelativePaths_().map((relativePath) => {
    return {
      relativePath,
      absolutePath: path.join(baseDir, relativePath)
    };
  });
}

function createLoggerBridge() {
  return {
    log: function log() {
      console.log.apply(console, arguments);
    }
  };
}

function createVmContext() {
  const context = {
    console,
    Logger: createLoggerBridge(),
    Math,
    JSON,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    Infinity,
    NaN,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __PURE_COMPUTE_SHA256_HEX__: function sha256Hex(value) {
      return crypto
        .createHash('sha256')
        .update(String(value == null ? '' : value), 'utf8')
        .digest('hex');
    }
  };

  context.global = context;
  context.globalThis = context;
  context.self = context;

  return vm.createContext(context);
}

function loadScriptFileIntoContext(context, fileDescriptor) {
  const filePath = fileDescriptor.absolutePath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Required pure compute file not found: ${fileDescriptor.relativePath}`);
  }

  const code = fs.readFileSync(filePath, 'utf8');
  const script = new vm.Script(code, {
    filename: filePath,
    displayErrors: true
  });

  script.runInContext(context, {
    displayErrors: true
  });
}

function validatePureComputeRuntime(runtime) {
  const requiredFunctionNames = [
    'validateTrialComputeRequest_',
    'runRandomTrialsHeadless_',
    'buildTransportTrialResult_',
    'validateTransportTrialResult_'
  ];

  const issues = [];

  requiredFunctionNames.forEach((functionName) => {
    if (typeof runtime[functionName] !== 'function') {
      issues.push(`Pure compute runtime is missing function: ${functionName}`);
    }
  });

  return issues.length > 0
    ? {
        ok: false,
        message: issues[0],
        issues
      }
    : {
        ok: true,
        requiredFunctionNames
      };
}

function buildPureComputeRuntime(options) {
  const rootDir = getProjectRootDir(options);
  const context = createVmContext();
  const fileDescriptors = getPureComputeScriptPaths(rootDir);

  fileDescriptors.forEach((fileDescriptor) => {
    loadScriptFileIntoContext(context, fileDescriptor);
  });

  const runtime = {
    rootDir,
    loadedFiles: fileDescriptors.map((fileDescriptor) => fileDescriptor.relativePath),
    context,
    validateTrialComputeRequest_: context.validateTrialComputeRequest_,
    runRandomTrialsHeadless_: context.runRandomTrialsHeadless_,
    buildTransportTrialResult_: context.buildTransportTrialResult_,
    validateTransportTrialResult_: context.validateTransportTrialResult_
  };

  const validation = validatePureComputeRuntime(runtime);
  if (!validation.ok) {
    const error = new Error(validation.message || 'Pure compute runtime validation failed.');
    error.validation = validation;
    throw error;
  }

  runtime.validation = validation;
  return runtime;
}

function loadPureComputeRuntime(options) {
  const source = options || {};
  const rootDir = getProjectRootDir(source);
  const forceReload = source.forceReload === true;
  const cacheKey = rootDir;

  if (!forceReload && cachedRuntime && cachedCacheKey === cacheKey) {
    return cachedRuntime;
  }

  const runtime = buildPureComputeRuntime({ projectRootDir: rootDir });
  cachedRuntime = runtime;
  cachedCacheKey = cacheKey;
  return runtime;
}

module.exports = {
  buildPureComputeRuntime,
  createVmContext,
  getProjectRootDir,
  getPureComputeScriptPaths,
  loadPureComputeRuntime,
  validatePureComputeRuntime
};
