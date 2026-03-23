const path = require('path');
const { runCampaign } = require('./run_campaign');

async function main() {
  const result = await runCampaign({
    campaignId: 'campaign-test-half-ladder',
    campaignBatchLabel: 'phase14_run_campaign_test',
    snapshotPath: '/Users/arthuryong/Downloads/compute_snapshot_v2__CGH_ICU_HD_MO_Call_Apr_2026__Sheet1__20260322_225448__t1__seed-null.json',
    workerUrl: process.env.PHASE12_WORKER_URL,
    workerToken: process.env.PHASE12_WORKER_TOKEN,
    chunkTrials: 1000,
    baseSeed: '12345',
    campaignTrialCounts: [1, 5, 10],
    campaignRepeats: 3,
    outputRootDir: path.join(process.cwd(), 'tmp', 'phase14_campaigns'),
    uploadToDrive: false
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('runCampaign test failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});