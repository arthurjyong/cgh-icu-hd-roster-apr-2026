FROM node:20-slim

ENV NODE_ENV=production \
    PORT=8080 \
    TRIAL_COMPUTE_PROJECT_ROOT=/app

WORKDIR /app

COPY worker/package.json ./worker/package.json
COPY worker/server.js ./worker/server.js
COPY worker/load_pure_compute.js ./worker/load_pure_compute.js

COPY engine_snapshot.js ./engine_snapshot.js
COPY engine_runner.js ./engine_runner.js
COPY allocator_candidates.js ./allocator_candidates.js
COPY allocator_rules.js ./allocator_rules.js
COPY allocator_random.js ./allocator_random.js
COPY rng_seeded.js ./rng_seeded.js
COPY scorer_config.js ./scorer_config.js
COPY scorer_main.js ./scorer_main.js

EXPOSE 8080

CMD ["node", "worker/server.js"]
