#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function loadScript(relativePath, context) {
  const fullPath = path.join(repoRoot, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(code, context, { filename: relativePath });
}

function createContext() {
  const context = vm.createContext({
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    parseInt,
    parseFloat,
    isFinite,
    SpreadsheetApp: {
      getActive: () => ({
        getId: () => 'sheet-id-1',
        getName: () => 'sheet-name-1'
      }),
      getActiveSheet: () => ({
        getName: () => 'SCORER_CONFIG'
      })
    },
    Session: {
      getScriptTimeZone: () => 'Etc/UTC'
    },
    Utilities: {
      formatDate: () => '20260324_120000'
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => '',
        setProperties: () => {},
        deleteProperty: () => {}
      })
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({
        timeBased: () => ({
          everyMinutes: () => ({
            create: () => ({ getUniqueId: () => 'trigger-1' })
          })
        })
      })
    },
    UrlFetchApp: {
      fetch: () => {
        throw new Error('UrlFetchApp.fetch should not be called in this validator.');
      }
    },
    Logger: {
      log: () => {}
    }
  });

  return context;
}

function makeRow(header, valuesByKey) {
  return header.map((columnName) => Object.prototype.hasOwnProperty.call(valuesByKey, columnName) ? valuesByKey[columnName] : '');
}

function run() {
  const context = createContext();
  loadScript('benchmark_ui.js', context);
  loadScript('benchmark_trials.js', context);
  loadScript('benchmark_result_import.js', context);
  loadScript('benchmark_orchestration.js', context);

  // chunk plan generation
  const exactChunkPlan = context.deriveBenchmarkCampaignChunkPlanFromTarget_(500000);
  assert.deepStrictEqual(Array.from(exactChunkPlan.campaignTrialCounts), [5000]);
  assert.strictEqual(exactChunkPlan.campaignRepeats, 100);

  const remainderChunkPlan = context.deriveBenchmarkCampaignChunkPlanFromTarget_(13000);
  assert.deepStrictEqual(Array.from(remainderChunkPlan.campaignTrialCounts), [5000, 5000, 3000]);
  assert.strictEqual(remainderChunkPlan.campaignRepeats, 1);

  // payload construction (trialCounts + repeats)
  const payload = context.buildBenchmarkCampaignStartPayload_(
    {
      ok: true,
      contractVersion: 'compute_snapshot_v2',
      export: {
        fileId: 'file-1',
        fileName: 'snapshot.json',
        exportedAtIso: '2026-03-24T00:00:00.000Z'
      }
    },
    {
      targetMaxTrialCount: 13000,
      expandedTrialCounts: [5000, 3000],
      seedOverride: '777'
    }
  );
  assert.deepStrictEqual(Array.from(payload.campaignTrialCounts), [5000, 5000, 3000]);
  assert.strictEqual(payload.campaignRepeats, 1);

  // append + dedupe + non-wipe simulation
  const header = Array.from(context.getBenchmarkTrialsHeader_());
  const existingRows = [
    {
      CampaignFolderName: 'campaign_a',
      RunFolderName: 'run_0001',
      ArtifactFileName: 'benchmark_campaign_report_v1.json',
      TrialCount: 5000,
      RepeatIndex: 1,
      RunId: 'cmp_a_tc_0005000_r01'
    }
  ];

  context.readBenchmarkTrialsRowsAsObjects_ = () => ({ ok: true, rows: existingRows });

  const duplicateByRunId = makeRow(header, {
    CampaignFolderName: 'campaign_a',
    RunFolderName: 'run_0001',
    ArtifactFileName: 'benchmark_campaign_report_v1.json',
    TrialCount: 5000,
    RepeatIndex: 1,
    RunId: 'cmp_a_tc_0005000_r01'
  });

  const duplicateByFallback = makeRow(header, {
    CampaignFolderName: 'campaign_a',
    RunFolderName: 'run_0002',
    ArtifactFileName: 'benchmark_campaign_report_v1.json',
    TrialCount: 3000,
    RepeatIndex: 1,
    RunId: ''
  });

  existingRows.push({
    CampaignFolderName: 'campaign_a',
    RunFolderName: 'run_0002',
    ArtifactFileName: 'benchmark_campaign_report_v1.json',
    TrialCount: 3000,
    RepeatIndex: 1,
    RunId: ''
  });

  const newRow = makeRow(header, {
    CampaignFolderName: 'campaign_b',
    RunFolderName: 'run_0001',
    ArtifactFileName: 'benchmark_campaign_report_v1.json',
    TrialCount: 5000,
    RepeatIndex: 1,
    RunId: 'cmp_b_tc_0005000_r01'
  });

  const dedupe = context.filterBenchmarkTrialsRowsForAppendDeduping_([
    duplicateByRunId,
    duplicateByFallback,
    newRow
  ]);

  assert.strictEqual(dedupe.skippedDuplicateRowCount, 2);
  assert.strictEqual(dedupe.rowsToAppend.length, 1);

  console.log('PASS: chunk plan generation uses fixed 5000 chunking with remainder handling.');
  console.log('PASS: payload construction uses campaignTrialCounts + campaignRepeats from 5000 chunk policy.');
  console.log('PASS: append dedupe skips duplicate rows by RunId and fallback key while preserving new rows.');
  console.log('PASS: non-wipe behavior is compatible with accumulated BENCHMARK_TRIALS rows across campaigns.');
}

run();
