---
title: 'Project types cleanup follow-up'
description: 'Deferred cleanup of `Project` schema fields (`deletedAt`, multi-discipline `assets`) after Sharing MVP mechanical-only publications.'
status: draft
created: '2026-05-05'
updated: '2026-05-05'
category: architecture
---

# Project types cleanup follow-up

Sharing MVP publishes and forks **mechanical** geometry units only (`assets.mechanical.main` + parameters). The canonical `Project` type in `libs/types/src/types/project.types.ts` still carries broader IndexedDB-era fields that are not exercised end-to-end by publications yet.

## Executive Summary

Keep `Project` rich enough for local IndexedDB projects while publications remain mechanical-scoped. Before expanding snapshots to multiple engineering disciplines or cloud-backed project rows, reconcile optional `deletedAt`, `forkedFrom`, and `assets` typing with how tombstones and manifests evolve.

## Problem Statement

- `deletedAt?: number` implies soft-delete semantics that may duplicate filesystem/project-manager tombstone flows.
- `assets: Partial<Record<EngineeringDiscipline, Asset>>` models future multi-discipline editors, but publication manifests and fork payloads currently serialize only mechanical paths.

## Recommendations

1. When electrical / other disciplines participate in publish/fork, extend manifest schema + UI validation instead of silently dropping keys.
2. Document whether `deletedAt` remains client-only (IndexedDB garbage collection) or becomes server-authoritative before adding Postgres project tables.
3. Avoid breaking fork/import adapters: `ForkAction` already writes `assets.mechanical`; broad refactors should migrate existing IndexedDB documents with a version bump in the persistence layer (not ad hoc casts in routes).

## Related code

- `libs/types/src/types/project.types.ts` — `Project`, `Asset`
- `apps/ui/app/routes/v.$id/fork-action.tsx` — fork writes mechanical assets only
- `apps/ui/app/utils/publish.utils.ts` — publication path filters aligned with API caps
