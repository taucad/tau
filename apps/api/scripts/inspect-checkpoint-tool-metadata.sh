#!/usr/bin/env bash
#
# Inspect LangGraph checkpoint tool-call metadata for one chat thread.
#
# Read-only diagnostic helper for docs/research/google-opaque-error-and-multimodal-followup.md.
# It reports canonical, invalid, and legacy additional_kwargs tool-call counts
# without printing prompt text or tool argument values.
#
# Required env vars:
#   DATABASE_URL  Postgres connection string.
#   CHAT_ID       LangGraph thread/chat id to inspect, e.g. chat_abc123.
#
# Usage:
#   DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/tau_dev \
#   CHAT_ID=chat_abc123 \
#   ./apps/api/scripts/inspect-checkpoint-tool-metadata.sh
#
# The script uses host `psql` when available. In the standard local Docker
# setup it falls back to `docker exec tau-postgres psql`.
#
# Exit codes:
#   0  Success
#   1  Validation failure
#   3  Missing dependency

set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${CHAT_ID:?set CHAT_ID}"

if command -v psql >/dev/null; then
  PSQL=(psql "${DATABASE_URL}")
elif command -v docker >/dev/null && docker ps --format '{{.Names}}' | grep -qx 'tau-postgres'; then
  PSQL=(docker exec -i tau-postgres psql "${DATABASE_URL}")
else
  printf '%s\n' "ERROR: psql CLI required, or start the local tau-postgres Docker container" >&2
  exit 3
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

"${PSQL[@]}" \
  --set=ON_ERROR_STOP=1 \
  --set=chat_id="${CHAT_ID}" <<'SQL'
with message_sources as (
  select
    'write'::text as source,
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    idx::text as source_ordinal,
    convert_from(blob, 'UTF8')::jsonb as messages
  from langgraph.checkpoint_writes
  where thread_id = :'chat_id'
    and channel = 'messages'
    and type = 'json'

  union all

  select
    'blob'::text as source,
    thread_id,
    checkpoint_ns,
    null::text as checkpoint_id,
    version as source_ordinal,
    convert_from(blob, 'UTF8')::jsonb as messages
  from langgraph.checkpoint_blobs
  where thread_id = :'chat_id'
    and channel = 'messages'
    and type = 'json'
),
message_rows as (
  select
    source,
    checkpoint_id,
    source_ordinal,
    ordinality - 1 as message_ordinal,
    message,
    message -> 'kwargs' as kwargs
  from message_sources,
    jsonb_array_elements(messages) with ordinality as expanded(message, ordinality)
),
summaries as (
  select
    source,
    checkpoint_id,
    source_ordinal,
    message_ordinal,
    coalesce(kwargs #>> '{id}', message #>> '{id,2}', message ->> 'type') as message_id,
    message #>> '{id,2}' as message_kind,
    case
      when jsonb_typeof(kwargs -> 'content') = 'string' then 'text:' || length(kwargs ->> 'content')::text
      when jsonb_typeof(kwargs -> 'content') = 'array' then 'parts:' || jsonb_array_length(kwargs -> 'content')::text
      when kwargs -> 'content' is null then 'missing'
      else jsonb_typeof(kwargs -> 'content')
    end as content_shape,
    jsonb_array_length(coalesce(kwargs -> 'tool_calls', '[]'::jsonb)) as canonical_tool_calls,
    jsonb_array_length(coalesce(kwargs -> 'invalid_tool_calls', '[]'::jsonb)) as invalid_tool_calls,
    jsonb_array_length(coalesce(kwargs #> '{additional_kwargs,tool_calls}', '[]'::jsonb)) as legacy_tool_calls,
    (
      select count(*)
      from jsonb_array_elements(coalesce(kwargs #> '{additional_kwargs,tool_calls}', '[]'::jsonb)) as legacy(call)
      where nullif(btrim(legacy.call #>> '{function,name}'), '') is null
    ) as legacy_empty_names,
    (
      select string_agg(coalesce(nullif(btrim(legacy.call #>> '{function,name}'), ''), '<empty>'), ', ' order by legacy.call #>> '{id}')
      from jsonb_array_elements(coalesce(kwargs #> '{additional_kwargs,tool_calls}', '[]'::jsonb)) as legacy(call)
    ) as legacy_names
  from message_rows
)
select
  source,
  checkpoint_id,
  source_ordinal,
  message_ordinal,
  message_kind,
  message_id,
  content_shape,
  canonical_tool_calls,
  invalid_tool_calls,
  legacy_tool_calls,
  legacy_empty_names,
  legacy_names
from summaries
where canonical_tool_calls > 0
   or invalid_tool_calls > 0
   or legacy_tool_calls > 0
order by checkpoint_id desc nulls last, source, source_ordinal desc, message_ordinal;
SQL
