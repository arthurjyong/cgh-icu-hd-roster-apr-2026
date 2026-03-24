'use strict';

const assert = require('assert');

const runCampaignModule = require('./run_campaign');

assert.ok(runCampaignModule, 'run_campaign module should load.');
assert.strictEqual(typeof runCampaignModule.runCampaign, 'function', 'runCampaign export must be a function.');
assert.ok(Array.isArray(runCampaignModule.DEFAULT_LADDER), 'DEFAULT_LADDER export must be an array.');
assert.strictEqual(runCampaignModule.DEFAULT_LADDER.length > 0, true, 'DEFAULT_LADDER should not be empty.');

console.log('run_campaign module load test passed');
