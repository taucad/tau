#!/bin/sh
# Launcher 3's entrypoint: turn the provisioner's environment into the one file
# `tau serve` reads, then become the daemon.
#
# A cloud host is a paired device that never ran the user-code dance: the API
# minted its `agent_device` row and credential and handed both to this container,
# so the only thing missing is the file pairing would have written. Everything
# downstream — the relay control connection, the offer, the agent channel, the
# files-first log under $TAU_HOST_WORKSPACE/.tau — is the same code a laptop
# daemon runs.
set -eu

: "${TAU_HOST_DEVICE_ID:?TAU_HOST_DEVICE_ID is required (the agent_device row this container is)}"
: "${TAU_HOST_CREDENTIAL:?TAU_HOST_CREDENTIAL is required (minted once by the API, never re-readable)}"
: "${TAU_API_URL:?TAU_API_URL is required (relay and model gateway origin)}"

config_dir="${TAU_CONFIG_DIR:-/config}"
workspace="${TAU_HOST_WORKSPACE:-/workspace}"

umask 077
mkdir -p "$config_dir" "$workspace"

# Written through a temp file and renamed, like `writeHostCredential` does, so a
# restart never observes a half-written credential. `printf` with `%s` keeps the
# values out of the format string.
credential_file="$config_dir/host.json"
printf '{\n  "v": 1,\n  "deviceId": "%s",\n  "credential": "%s"\n}\n' \
  "$TAU_HOST_DEVICE_ID" "$TAU_HOST_CREDENTIAL" > "$credential_file.tmp"
chmod 600 "$credential_file.tmp"
mv "$credential_file.tmp" "$credential_file"

# `pnpm deploy` materialises @taucad/cli itself at /app, so its bin is /app/dist.
exec node /app/dist/bin/tau.mjs serve \
  --trust-projects \
  --workspace="$workspace" \
  --relay="$TAU_API_URL" \
  --gateway="$TAU_API_URL" \
  --no-external-agents \
  "$@"
