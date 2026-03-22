#!/usr/bin/env node
'use strict';

const { buildLauncherConfig } = require('./launcher_config');
const { loadSnapshotFile, buildChunkPlan, buildPlanSummary } = require('./launcher_plan');

function main() {
  const config = buildLauncherConfig({
    argv: process.argv.slice(2),
    env: process.env
  });

  const snapshotInfo = loadSnapshotFile(config.snapshotPath);
  const chunkPlan = buildChunkPlan(config);
  const summary = buildPlanSummary(config, snapshotInfo, chunkPlan);

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const message = error && error.message ? error.message : String(error);

  process.stderr.write(JSON.stringify({
    ok: false,
    launcherPhase: '12C',
    message
  }, null, 2) + '\n');

  process.exit(1);
}