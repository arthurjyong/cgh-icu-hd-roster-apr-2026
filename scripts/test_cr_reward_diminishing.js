#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scorerSource = fs.readFileSync(path.join(__dirname, '..', 'scorer_main.js'), 'utf8');
const context = { console, Math };
vm.createContext(context);
vm.runInContext(scorerSource, context);

const computeCrReward_ = context.computeCrReward_;
assert.strictEqual(typeof computeCrReward_, 'function', 'computeCrReward_ should be defined');

const BASE = 2000;

function buildRow(doctorId, crCount) {
  const callAssignments = [];
  for (let i = 0; i < crCount; i++) {
    callAssignments.push({
      dateKey: `2026-04-${String(i + 1).padStart(2, '0')}`,
      slotKey: i % 2 === 0 ? 'MICU_CALL' : 'MHD_CALL',
      crPreferenceApplies: true,
      rawText: 'CR',
      codes: ['CR']
    });
  }

  return {
    doctorId,
    fullName: doctorId,
    section: 'A',
    callAssignments
  };
}

function runScenario(rows) {
  return computeCrReward_({ doctorTimelines: { rows } }, { CR_CALL_REWARD: BASE });
}

const oneCr = runScenario([buildRow('doc1', 1)]);
assert.strictEqual(oneCr.score, 2000, '1 CR should yield base reward');

const twoCr = runScenario([buildRow('doc1', 2)]);
assert.strictEqual(twoCr.score, 3000, '2 CRs same doctor should yield base + base/2');

const threeCr = runScenario([buildRow('doc1', 3)]);
assert.strictEqual(threeCr.score, 3500, '3 CRs same doctor should yield base + base/2 + base/4');

const threeDoctors = runScenario([
  buildRow('doc1', 1),
  buildRow('doc2', 1),
  buildRow('doc3', 1)
]);
assert.strictEqual(threeDoctors.score, 6000, '3 doctors with 1 CR each should yield 3 * base');

const occurrences = threeCr.occurrences.map((o) => o.reward);
assert.strictEqual(occurrences.join(','), '2000,1000,500', 'Occurrence rewards should decay geometrically by doctor');

console.log('CR diminishing reward checks passed.');
