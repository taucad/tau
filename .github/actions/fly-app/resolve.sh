#!/usr/bin/env bash
# Print the Fly deploy target of one API-family app as `key=value` lines.
#
# The API (`api`) and the three private apps (`mirror`, `maintenance`, `storage`) are
# targets of `apps/api/Dockerfile`. This is the one place that maps an app and an
# environment to its Fly app, config, image tag, Docker target and token secret, for
# `deploy.yml` (through `action.yml` here) and `fly-images.yml` alike.
#
# Usage: resolve.sh <api|mirror|maintenance|storage> <staging|production>
# Required env: GITHUB_SHA (the image tag).
# Output keys: fly_app, config_file, image, cache_ref, dockerfile, docker_target,
#   token_secret, token_hcp (empty for the API, whose token is always mapped),
#   api_app (storage only), api_url and ui_origin (api only).
# Names only: nothing here reads or prints a token.
# Exit codes: 0 resolved, 1 unknown app or environment, or storage outside staging.
set -euo pipefail

APP="${1:?app required}"
ENVIRONMENT="${2:?environment required}"
: "${GITHUB_SHA:?GITHUB_SHA required}"

case "$ENVIRONMENT" in
  staging | production) ;;
  *) echo "::error::Invalid environment: ${ENVIRONMENT}" >&2; exit 1 ;;
esac

suffix() { [ "$ENVIRONMENT" = staging ] && echo "-staging" || true; }
config() { [ "$ENVIRONMENT" = staging ] && echo "apps/$1/fly.staging.toml" || echo "apps/$1/fly.prod.toml"; }

api_url=''
ui_origin=''
api_app=''
token_hcp=''
case "$APP" in
  api)
    fly_app="tau-api$(suffix)"
    docker_target=runtime
    token_secret=FLY_API_TOKEN
    if [ "$ENVIRONMENT" = staging ]; then
      api_url=https://api.taucad.dev
      ui_origin=https://taucad.dev
    else
      api_url=https://api.tau.new
      ui_origin=https://tau.new
    fi
    ;;
  mirror | maintenance)
    fly_app="tau-${APP}$(suffix)"
    docker_target="$APP"
    token_secret="FLY_${APP^^}_API_TOKEN"
    token_hcp="fly_${APP}_deploy_token"
    ;;
  storage)
    if [ "$ENVIRONMENT" != staging ]; then
      echo "::error::Only staging deploys tau-storage so far." >&2
      exit 1
    fi
    fly_app=tau-storage-staging
    docker_target=storage
    token_secret=FLY_STORAGE_API_TOKEN
    token_hcp=fly_storage_deploy_token
    api_app=tau-api-staging
    ;;
  *) echo "::error::Unknown Fly app: ${APP}" >&2; exit 1 ;;
esac

cat <<OUT
fly_app=${fly_app}
config_file=$(config "$APP")
image=registry.fly.io/${fly_app}:${GITHUB_SHA}
cache_ref=registry.fly.io/${fly_app}:buildcache
dockerfile=apps/api/Dockerfile
docker_target=${docker_target}
token_secret=${token_secret}
token_hcp=${token_hcp}
api_app=${api_app}
api_url=${api_url}
ui_origin=${ui_origin}
OUT
