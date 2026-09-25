#!/bin/sh
# Launcher 3's entrypoint: turn the provisioner's environment into the one file
# `tau serve` reads, clone the project this host is bound to, then become the
# daemon.
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
: "${TAU_HOST_PROJECT_ID:?TAU_HOST_PROJECT_ID is required (the project this host clones and serves)}"
: "${TAU_HOST_GIT_CREDENTIAL:?TAU_HOST_GIT_CREDENTIAL is required (the push credential for that project, D21)}"

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

# The host is a device of the owner (D21): it clones the project the way any
# device does, from the Hosted Remote under the reserved `tau` remote name, so
# the daemon's revision tree adopts the clone and syncs it. The directory is
# named after the project because that is the daemon's project identity. Once
# per container: a restart finds the clone and keeps whatever it holds.
#
# The push credential rides git's environment config, never argv (`ps`) and
# never `.git/config` (P40). The clone lands under a staging name and is
# renamed, so a restart never adopts half a clone.
project_root="$workspace/$TAU_HOST_PROJECT_ID"
remote_url="${TAU_API_URL%/}/v1/git/$TAU_HOST_PROJECT_ID.git"
if [ ! -d "$project_root/.git" ]; then
  if [ -e "$project_root" ]; then
    echo "tau-host-entrypoint: $project_root exists but is not a clone; refusing to overwrite it" >&2
    exit 1
  fi
  staging="$workspace/.clone-$TAU_HOST_PROJECT_ID"
  rm -rf "$staging"
  # `init.defaultBranch`: the Hosted Remote speaks protocol v0, whose
  # advertisement of a registered-but-empty project names no HEAD, so without
  # it the clone's first line would be git's default rather than `main` (EQ6).
  GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_COUNT=3 \
    GIT_CONFIG_KEY_0="http.$remote_url.extraHeader" \
    GIT_CONFIG_VALUE_0="Authorization: Bearer $TAU_HOST_GIT_CREDENTIAL" \
    GIT_CONFIG_KEY_1=credential.helper \
    GIT_CONFIG_VALUE_1='' \
    GIT_CONFIG_KEY_2=init.defaultBranch \
    GIT_CONFIG_VALUE_2=main \
    git clone --quiet --origin tau -- "$remote_url" "$staging"
  mv "$staging" "$project_root"
fi

# `tau serve` backs its project up with `TAU_API_TOKEN` (C67). Here that is the
# push credential, which the API accepts on this project's git routes and
# refuses everywhere else (I10); the device credential stays the relay's.
export TAU_API_TOKEN="$TAU_HOST_GIT_CREDENTIAL"

# `pnpm deploy` materialises @taucad/cli itself at /app, so its bin is /app/dist.
exec node /app/dist/bin/tau.mjs serve \
  --trust-projects \
  --workspace="$project_root" \
  --relay="$TAU_API_URL" \
  --gateway="$TAU_API_URL" \
  --no-external-agents \
  "$@"
