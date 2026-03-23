#!/usr/bin/env bash

# Source this file to load canonical repo env, local overrides, secret-file indirection,
# and compatibility aliases for existing Phase 12 / benchmark tooling.

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  _cgh_load_env_script="${BASH_SOURCE[0]}"
else
  _cgh_load_env_script="$0"
fi

if [[ "${_cgh_load_env_script}" == "$0" ]]; then
  echo "scripts/load_env.sh must be sourced: source scripts/load_env.sh" >&2
  exit 1
fi

_cgh_repo_root="$(cd "$(dirname "${_cgh_load_env_script}")/.." && pwd)"
export CGH_ROSTER_ROOT="${CGH_ROSTER_ROOT:-$_cgh_repo_root}"

_cgh_source_if_exists() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    # shellcheck disable=SC1090
    source "$file_path"
  fi
}

_cgh_trim_trailing_newlines() {
  local value="$1"
  value="${value%$'\n'}"
  value="${value%$'\r'}"
  printf '%s' "$value"
}

_cgh_read_secret_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    echo "Secret file not found: $file_path" >&2
    return 1
  fi
  local value
  value="$(<"$file_path")"
  _cgh_trim_trailing_newlines "$value"
}

_cgh_abspath() {
  local value="$1"
  if [[ -z "$value" ]]; then
    return 0
  fi
  if [[ "$value" == ~* ]]; then
    value="${value/#\~/$HOME}"
  fi
  if [[ "$value" == /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$_cgh_repo_root/$value"
  fi
}

_cgh_export_path_var_if_set() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    export "$name=$(_cgh_abspath "$value")"
  fi
}

_cgh_load_secret_from_file_var() {
  local secret_var="$1"
  local file_var="$2"
  local current_value="${!secret_var:-}"
  local file_path="${!file_var:-}"
  if [[ -n "$current_value" || -z "$file_path" ]]; then
    return 0
  fi
  local resolved
  resolved="$(_cgh_abspath "$file_path")"
  export "$file_var=$resolved"
  export "$secret_var=$(_cgh_read_secret_file "$resolved")"
}

_cgh_source_if_exists "$_cgh_repo_root/.env.shared"
_cgh_source_if_exists "$_cgh_repo_root/.env.local"

export CGH_ROSTER_ROOT="${CGH_ROSTER_ROOT:-$_cgh_repo_root}"
_cgh_export_path_var_if_set CGH_ROSTER_ROOT
_cgh_export_path_var_if_set CGH_SECRETS_ROOT
_cgh_export_path_var_if_set CGH_TMP_ROOT
_cgh_export_path_var_if_set WORKER_SOURCE_DIR
_cgh_export_path_var_if_set ORCH_SOURCE_DIR
_cgh_export_path_var_if_set WORKER_DOCKERFILE
_cgh_export_path_var_if_set ORCH_DOCKERFILE
_cgh_export_path_var_if_set DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE
_cgh_export_path_var_if_set DRIVE_OAUTH_TOKEN_FILE
_cgh_export_path_var_if_set WORKER_TOKEN_FILE
_cgh_export_path_var_if_set ORCHESTRATOR_AUTH_TOKEN_FILE
_cgh_export_path_var_if_set ORCHESTRATOR_OUTPUT_ROOT

_cgh_load_secret_from_file_var WORKER_TOKEN WORKER_TOKEN_FILE
_cgh_load_secret_from_file_var ORCHESTRATOR_AUTH_TOKEN ORCHESTRATOR_AUTH_TOKEN_FILE

if [[ -z "${TRIAL_COMPUTE_EXTERNAL_TOKEN:-}" && -n "${WORKER_TOKEN:-}" ]]; then
  export TRIAL_COMPUTE_EXTERNAL_TOKEN="$WORKER_TOKEN"
fi

if [[ -z "${BENCHMARK_WORKER_URL:-}" && -n "${WORKER_URL:-}" ]]; then
  export BENCHMARK_WORKER_URL="$WORKER_URL"
fi
if [[ -z "${BENCHMARK_WORKER_TOKEN:-}" && -n "${WORKER_TOKEN:-}" ]]; then
  export BENCHMARK_WORKER_TOKEN="$WORKER_TOKEN"
fi
if [[ -z "${WORKER_AUTH_TOKEN:-}" && -n "${WORKER_TOKEN:-}" ]]; then
  export WORKER_AUTH_TOKEN="$WORKER_TOKEN"
fi
if [[ -z "${WORKER_TOKEN:-}" && -n "${BENCHMARK_WORKER_TOKEN:-}" ]]; then
  export WORKER_TOKEN="$BENCHMARK_WORKER_TOKEN"
fi

export BENCHMARK_ORCHESTRATOR_AUTH_TOKEN="${BENCHMARK_ORCHESTRATOR_AUTH_TOKEN:-${ORCHESTRATOR_AUTH_TOKEN:-}}"
export ORCHESTRATOR_AUTH_TOKEN="${ORCHESTRATOR_AUTH_TOKEN:-${BENCHMARK_ORCHESTRATOR_AUTH_TOKEN:-}}"

export BENCHMARK_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE="${BENCHMARK_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE:-${DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE:-}}"
export BENCHMARK_DRIVE_OAUTH_TOKEN_FILE="${BENCHMARK_DRIVE_OAUTH_TOKEN_FILE:-${DRIVE_OAUTH_TOKEN_FILE:-}}"
export BENCHMARK_DRIVE_ROOT_FOLDER_ID="${BENCHMARK_DRIVE_ROOT_FOLDER_ID:-${DRIVE_ROOT_FOLDER_ID:-}}"
export BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_ID="${BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_ID:-${DRIVE_BENCHMARK_RUNS_FOLDER_ID:-}}"
export BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_NAME="${BENCHMARK_DRIVE_BENCHMARK_RUNS_FOLDER_NAME:-${DRIVE_BENCHMARK_RUNS_FOLDER_NAME:-}}"
export BENCHMARK_ORCHESTRATOR_OUTPUT_ROOT="${BENCHMARK_ORCHESTRATOR_OUTPUT_ROOT:-${ORCHESTRATOR_OUTPUT_ROOT:-}}"
export BENCHMARK_ORCHESTRATOR_CHUNK_TRIALS="${BENCHMARK_ORCHESTRATOR_CHUNK_TRIALS:-${ORCHESTRATOR_CHUNK_TRIALS:-}}"
export BENCHMARK_ORCHESTRATOR_TOP_N="${BENCHMARK_ORCHESTRATOR_TOP_N:-${ORCHESTRATOR_TOP_N:-}}"
export BENCHMARK_ORCHESTRATOR_REQUEST_TIMEOUT_MS="${BENCHMARK_ORCHESTRATOR_REQUEST_TIMEOUT_MS:-${ORCHESTRATOR_REQUEST_TIMEOUT_MS:-}}"
export BENCHMARK_ORCHESTRATOR_STATUS_POLL_INTERVAL_MS="${BENCHMARK_ORCHESTRATOR_STATUS_POLL_INTERVAL_MS:-${ORCHESTRATOR_STATUS_POLL_INTERVAL_MS:-}}"

# Phase 12 / 13 launcher compatibility aliases.
export PHASE12_WORKER_URL="${PHASE12_WORKER_URL:-${WORKER_URL:-}}"
export PHASE12_WORKER_TOKEN="${PHASE12_WORKER_TOKEN:-${WORKER_TOKEN:-}}"
export PHASE12_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE="${PHASE12_DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE:-${DRIVE_OAUTH_CLIENT_CREDENTIALS_FILE:-}}"
export PHASE12_DRIVE_OAUTH_TOKEN_FILE="${PHASE12_DRIVE_OAUTH_TOKEN_FILE:-${DRIVE_OAUTH_TOKEN_FILE:-}}"
export PHASE12_DRIVE_ROOT_FOLDER_ID="${PHASE12_DRIVE_ROOT_FOLDER_ID:-${DRIVE_ROOT_FOLDER_ID:-}}"
export PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_ID="${PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_ID:-${DRIVE_BENCHMARK_RUNS_FOLDER_ID:-}}"
export PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_NAME="${PHASE12_DRIVE_BENCHMARK_RUNS_FOLDER_NAME:-${DRIVE_BENCHMARK_RUNS_FOLDER_NAME:-}}"
export PHASE12_OUTPUT_ROOT_DIR="${PHASE12_OUTPUT_ROOT_DIR:-${CGH_TMP_ROOT:-$_cgh_repo_root/tmp}}"
export PHASE12_REQUEST_TIMEOUT_MS="${PHASE12_REQUEST_TIMEOUT_MS:-${ORCHESTRATOR_REQUEST_TIMEOUT_MS:-}}"
export PHASE12_TOP_N="${PHASE12_TOP_N:-${ORCHESTRATOR_TOP_N:-}}"
export PHASE12_CHUNK_TRIALS="${PHASE12_CHUNK_TRIALS:-${ORCHESTRATOR_CHUNK_TRIALS:-}}"
export PHASE13_CAMPAIGN_DIR="${PHASE13_CAMPAIGN_DIR:-${ORCHESTRATOR_OUTPUT_ROOT:-}}"

export GIT_SHA="$(git -C "$_cgh_repo_root" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
if [[ -z "${IMAGE_TAG:-}" ]]; then
  export IMAGE_TAG="$GIT_SHA"
fi

if [[ -n "${REGION:-}" && -n "${GCP_PROJECT:-}" && -n "${AR_REPO:-}" && -n "${WORKER_IMAGE_NAME:-}" ]]; then
  export WORKER_IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${WORKER_IMAGE_NAME}:${IMAGE_TAG}"
fi
if [[ -n "${REGION:-}" && -n "${GCP_PROJECT:-}" && -n "${AR_REPO:-}" && -n "${ORCH_IMAGE_NAME:-}" ]]; then
  export ORCH_IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${ORCH_IMAGE_NAME}:${IMAGE_TAG}"
fi

unset _cgh_load_env_script
unset _cgh_repo_root
unset -f _cgh_source_if_exists
unset -f _cgh_trim_trailing_newlines
unset -f _cgh_read_secret_file
unset -f _cgh_abspath
unset -f _cgh_export_path_var_if_set
unset -f _cgh_load_secret_from_file_var
