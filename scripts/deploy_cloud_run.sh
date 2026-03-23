#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load_env.sh"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 worker|orchestrator|both" >&2
  exit 1
fi

repo_root="$CGH_ROSTER_ROOT"
dry_run="${DRY_RUN:-0}"
require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required variable: $name" >&2
    exit 1
  fi
}

append_flag_if_set() {
  local array_name="$1"
  local flag="$2"
  local value="$3"
  if [[ -n "$value" ]]; then
    eval "$array_name+=(\"\$flag\")"
    eval "$array_name+=(\"\$value\")"
  fi
}

append_set_env_var_if_set() {
  local array_name="$1"
  local name="$2"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    eval "$array_name+=(\"\${name}=\${value}\")"
  fi
}

join_by_comma() {
  local first=1
  local item
  for item in "$@"; do
    if [[ $first -eq 1 ]]; then
      printf '%s' "$item"
      first=0
    else
      printf ',%s' "$item"
    fi
  done
}

run_cmd() {
  printf '+ ' >&2
  printf '%q ' "$@" >&2
  printf '\n' >&2
  if [[ "$dry_run" == "1" ]]; then
    return 0
  fi
  "$@"
}

capture_cmd() {
  printf '+ ' >&2
  printf '%q ' "$@" >&2
  printf '\n' >&2
  if [[ "$dry_run" == "1" ]]; then
    return 1
  fi
  "$@"
}

build_and_push_image() {
  local image="$1"
  local dockerfile="$2"
  require_var GCP_PROJECT
  require_var REGION
  require_var AR_REPO
  run_cmd docker buildx build --platform linux/amd64 --file "$dockerfile" --tag "$image" --push "$repo_root"
}

resolve_worker_url() {
  if [[ -n "${WORKER_URL:-}" ]]; then
    printf '%s\n' "$WORKER_URL"
    return 0
  fi

  require_var WORKER_SERVICE
  require_var REGION
  require_var GCP_PROJECT

  if [[ "$dry_run" == "1" ]]; then
    echo "WORKER_URL is required for dry-run orchestrator deploys because the live URL cannot be looked up." >&2
    return 1
  fi

  local resolved
  resolved="$(capture_cmd gcloud run services describe "$WORKER_SERVICE" --region "$REGION" --project "$GCP_PROJECT" --format='value(status.url)')" || true
  if [[ -z "$resolved" ]]; then
    echo "Unable to resolve WORKER_URL from Cloud Run service $WORKER_SERVICE." >&2
    return 1
  fi

  export WORKER_URL="$resolved"
  export BENCHMARK_WORKER_URL="$resolved"
  export PHASE12_WORKER_URL="$resolved"
  printf '%s\n' "$resolved"
}

require_orchestrator_runtime_oauth_paths() {
  require_var ORCH_DRIVE_OAUTH_CLIENT_CREDENTIALS_RUNTIME_FILE
  require_var ORCH_DRIVE_OAUTH_TOKEN_RUNTIME_FILE

  if [[ "$ORCH_DRIVE_OAUTH_CLIENT_CREDENTIALS_RUNTIME_FILE" != /* ]]; then
    echo "ORCH_DRIVE_OAUTH_CLIENT_CREDENTIALS_RUNTIME_FILE must be an absolute container runtime path." >&2
    exit 1
  fi
  if [[ "$ORCH_DRIVE_OAUTH_TOKEN_RUNTIME_FILE" != /* ]]; then
    echo "ORCH_DRIVE_OAUTH_TOKEN_RUNTIME_FILE must be an absolute container runtime path." >&2
    exit 1
  fi
}

deploy_worker() {
  require_var WORKER_SERVICE
  require_var WORKER_IMAGE
  require_var WORKER_DOCKERFILE
  require_var TRIAL_COMPUTE_EXTERNAL_TOKEN

  build_and_push_image "$WORKER_IMAGE" "$WORKER_DOCKERFILE"

  local args=(gcloud run deploy "$WORKER_SERVICE" --image "$WORKER_IMAGE" --region "$REGION" --project "$GCP_PROJECT")
  local env_pairs=("TRIAL_COMPUTE_EXTERNAL_TOKEN=$TRIAL_COMPUTE_EXTERNAL_TOKEN")

  append_set_env_var_if_set env_pairs TRIAL_COMPUTE_PROJECT_ROOT

  if [[ "${WORKER_ALLOW_UNAUTHENTICATED:-false}" == "true" ]]; then
    args+=(--allow-unauthenticated)
  else
    args+=(--no-allow-unauthenticated)
  fi

  append_flag_if_set args --service-account "${WORKER_SERVICE_ACCOUNT:-}"
  append_flag_if_set args --memory "${WORKER_MEMORY:-}"
  append_flag_if_set args --cpu "${WORKER_CPU:-}"
  append_flag_if_set args --timeout "${WORKER_TIMEOUT:-}"
  append_flag_if_set args --concurrency "${WORKER_CONCURRENCY:-}"
  append_flag_if_set args --min-instances "${WORKER_MIN_INSTANCES:-}"
  append_flag_if_set args --max-instances "${WORKER_MAX_INSTANCES:-}"

  args+=(--set-env-vars "$(join_by_comma "${env_pairs[@]}")")
  run_cmd "${args[@]}"

  if [[ "$dry_run" != "1" ]]; then
    resolve_worker_url >/dev/null
  fi
}

deploy_orchestrator() {
  require_var ORCH_SERVICE
  require_var ORCH_IMAGE
  require_var ORCH_DOCKERFILE
  require_var ORCHESTRATOR_AUTH_TOKEN
  require_var WORKER_TOKEN
  require_var DRIVE_ROOT_FOLDER_ID
  require_var DRIVE_BENCHMARK_RUNS_FOLDER_ID
  require_orchestrator_runtime_oauth_paths

  local worker_url
  worker_url="$(resolve_worker_url)"

  build_and_push_image "$ORCH_IMAGE" "$ORCH_DOCKERFILE"

  local args=(gcloud run deploy "$ORCH_SERVICE" --image "$ORCH_IMAGE" --region "$REGION" --project "$GCP_PROJECT")
  local env_pairs=(
    "BENCHMARK_ORCHESTRATOR_AUTH_TOKEN=$ORCHESTRATOR_AUTH_TOKEN"
    "BENCHMARK_WORKER_URL=$worker_url"
    "BENCHMARK_WORKER_TOKEN=$WORKER_TOKEN"
    "BENCHMARK_DRIVE_ROOT_FOLDER_ID=$DRIVE_ROOT_FOLDER_ID"
    "BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_ID=$DRIVE_BENCHMARK_RUNS_FOLDER_ID"
    "BENCHMARK_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE=$ORCH_DRIVE_OAUTH_CLIENT_CREDENTIALS_RUNTIME_FILE"
    "BENCHMARK_DRIVE_OAUTH_TOKEN_FILE=$ORCH_DRIVE_OAUTH_TOKEN_RUNTIME_FILE"
  )

  append_set_env_var_if_set env_pairs BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_NAME
  append_set_env_var_if_set env_pairs BENCHMARK_ORCHESTRATOR_OUTPUT_ROOT
  append_set_env_var_if_set env_pairs BENCHMARK_ORCHESTRATOR_CHUNK_TRIALS
  append_set_env_var_if_set env_pairs BENCHMARK_ORCHESTRATOR_TOP_N
  append_set_env_var_if_set env_pairs BENCHMARK_ORCHESTRATOR_REQUEST_TIMEOUT_MS
  append_set_env_var_if_set env_pairs BENCHMARK_ORCHESTRATOR_STATUS_POLL_INTERVAL_MS

  if [[ "${ORCH_ALLOW_UNAUTHENTICATED:-false}" == "true" ]]; then
    args+=(--allow-unauthenticated)
  else
    args+=(--no-allow-unauthenticated)
  fi

  append_flag_if_set args --service-account "${ORCH_SERVICE_ACCOUNT:-}"
  append_flag_if_set args --memory "${ORCH_MEMORY:-}"
  append_flag_if_set args --cpu "${ORCH_CPU:-}"
  append_flag_if_set args --timeout "${ORCH_TIMEOUT:-}"
  append_flag_if_set args --concurrency "${ORCH_CONCURRENCY:-}"
  append_flag_if_set args --min-instances "${ORCH_MIN_INSTANCES:-}"
  append_flag_if_set args --max-instances "${ORCH_MAX_INSTANCES:-}"

  args+=(--set-env-vars "$(join_by_comma "${env_pairs[@]}")")
  run_cmd "${args[@]}"
}

case "$TARGET" in
  worker)
    deploy_worker
    ;;
  orchestrator)
    deploy_orchestrator
    ;;
  both)
    deploy_worker
    deploy_orchestrator
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    echo "Usage: $0 worker|orchestrator|both" >&2
    exit 1
    ;;
esac
