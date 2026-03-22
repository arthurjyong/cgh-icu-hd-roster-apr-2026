'use strict';

const path = require('path');

function resolveProjectRootDir(options) {
  const source = options || {};
  const explicit = typeof source.projectRootDir === 'string'
    ? source.projectRootDir.trim()
    : '';

  return path.resolve(explicit || path.resolve(__dirname, '..', '..'));
}

function resolveWorkerLoadPureComputeModulePath(options) {
  const projectRootDir = resolveProjectRootDir(options);
  return path.join(projectRootDir, 'worker', 'load_pure_compute.js');
}

function loadWorkerRuntimeModule(options) {
  const modulePath = resolveWorkerLoadPureComputeModulePath(options);
  return require(modulePath);
}

function createRuntimeValidatorGateway(options) {
  const projectRootDir = resolveProjectRootDir(options);
  const runtimeModule = loadWorkerRuntimeModule({ projectRootDir });

  if (!runtimeModule || typeof runtimeModule.loadPureComputeRuntime !== 'function') {
    throw new Error('worker/load_pure_compute.js must export loadPureComputeRuntime().');
  }

  const runtime = runtimeModule.loadPureComputeRuntime({
    projectRootDir,
    forceReload: !!(options && options.forceReload)
  });

  if (!runtime || typeof runtime !== 'object') {
    throw new Error('Failed to load pure compute runtime.');
  }

  if (typeof runtime.validateTrialComputeRequest_ !== 'function') {
    throw new Error('Pure compute runtime is missing validateTrialComputeRequest_().');
  }

  if (typeof runtime.validateTransportTrialResult_ !== 'function') {
    throw new Error('Pure compute runtime is missing validateTransportTrialResult_().');
  }

  return {
    projectRootDir,
    loadedFiles: Array.isArray(runtime.loadedFiles) ? runtime.loadedFiles.slice() : [],
    validateRequest(requestBody) {
      return runtime.validateTrialComputeRequest_(requestBody);
    },
    validateTransportResult(transportResult) {
      return runtime.validateTransportTrialResult_(transportResult);
    }
  };
}

module.exports = {
  createRuntimeValidatorGateway,
  loadWorkerRuntimeModule,
  resolveProjectRootDir,
  resolveWorkerLoadPureComputeModulePath
};
