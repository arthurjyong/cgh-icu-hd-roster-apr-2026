FROM node:20-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Copy orchestrator runtime files.
COPY orchestrator/server.js ./orchestrator/server.js
COPY orchestrator/run_campaign.js ./orchestrator/run_campaign.js
COPY orchestrator/campaign_state.js ./orchestrator/campaign_state.js
COPY orchestrator/drive_snapshot.js ./orchestrator/drive_snapshot.js

# Copy the entire Phase 12 launcher subtree because run_campaign.js depends on it.
COPY tools/phase12_large_benchmark ./tools/phase12_large_benchmark

# Copy the local pure-compute surface that the launcher runtime still imports.
COPY worker/load_pure_compute.js ./worker/load_pure_compute.js
COPY engine_snapshot.js ./engine_snapshot.js
COPY engine_runner.js ./engine_runner.js
COPY allocator_candidates.js ./allocator_candidates.js
COPY allocator_rules.js ./allocator_rules.js
COPY allocator_random.js ./allocator_random.js
COPY rng_seeded.js ./rng_seeded.js
COPY scorer_config.js ./scorer_config.js
COPY scorer_main.js ./scorer_main.js

# Install launcher dependencies in-place.
WORKDIR /app/tools/phase12_large_benchmark
RUN npm install --omit=dev

# Return to app root for the runtime command.
WORKDIR /app

EXPOSE 8080

CMD ["node", "orchestrator/server.js"]
