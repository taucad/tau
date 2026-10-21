# @taucad/project-core

[![npm](https://img.shields.io/npm/v/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![license](https://img.shields.io/npm/l/@taucad/project-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Tau project manifest schema and parsing

## Why this package?

- One schema and parser authority for Tau v1 `tau.json` manifests.
- Strict authored declarations without identity; shared injected XState identity lifecycle.
- Browser-safe ESM exports using Zod, `TextEncoder`, and `TextDecoder`.

## Install

```bash
npm install @taucad/project-core zod
```

Alternatively, use `pnpm add @taucad/project-core zod` or `yarn add @taucad/project-core zod`.
Zod is the shared schema peer; use Zod 4. The schema/parser API does not require a Tau runtime instance.

## Quick start

```typescript
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/project-core';

const manifest = projectToManifest({
  name: 'Bracket',
  description: 'A mounting bracket',
  tags: ['bracket'],
  assets: { main: { entryPath: 'main.ts' } },
});

const bytes = serializeProjectManifest(manifest);
const result = parseProjectManifestBytes(bytes);

if (!result.success) {
  throw new Error(result.issue.code);
}

console.log(result.data.assets.main.entryPath); // main.ts
```

## API

Manifest exports are available from `@taucad/project-core`. Identity lifecycle APIs are available from `@taucad/project-core/identity`; importing only the manifest entry does not load XState.

| Exports                                                                 | Purpose                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `projectManifestSchema`, `projectIdSchema`, `projectRelativePathSchema` | Validate manifest fields with Zod.                                                  |
| `projectManifestSchemaUrl`, `projectManifestMaxBytes`                   | Canonical v1 schema URL and encoded-byte limit.                                     |
| `parseProjectManifestBytes`                                             | Parse bytes into an authored manifest or a structured issue.                        |
| `convertLegacyProjectManifestBytes`                                     | Convert only the previous prerelease contract, retaining its project ID separately. |
| `projectToManifest`                                                     | Select durable manifest fields from a project view.                                 |
| `serializeProjectManifest`                                              | Validate and encode the manifest as formatted JSON bytes with a trailing newline.   |
| `ProjectManifest`                                                       | Validated manifest types.                                                           |
| `ProjectManifestParseIssue`, `ProjectManifestParseResult`               | Parser issue and result types.                                                      |

Private Tau consumers forward these exports to this authority rather than defining another schema.
Parsing validates the supplied manifest bytes. It does not obtain source files, establish export or
provider identity, generate IDs, or execute geometry.

## Generated identity

The authored manifest uses `https://tau.new/schemas/tau-v1.json` and rejects `id`.
Tau stores `{ "version": 1, "projectId": "proj_…" }` in generated `.tau/project.json`.
This record is excluded from authored snapshots and agent edits.

`createProjectIdentityActor` returns an unstarted one-shot actor. Supply typed
`readIdentity`, `mintIdentity`, and `initializeIdentity` actors. Initialization must
atomically create the absent record or return the winning existing record. A trusted
cloud or converted legacy ID is passed as `preferredProjectId`; disagreements return
`conflict`. Read-only lookup returns `missing` without generating an identity.

`createProjectIdentityResolver` returns `{ actor, resolve, invalidate }`. Start the
actor once per storage authority and stop it at teardown. It coalesces matching
requests and caches only successful durable identities (default 1024 entries, maximum
4096; at most 64 active resolution children). Hosts must invalidate on identity-file
changes, directory replacement, root revocation and reconnect. Send `clear` on the
actor to invalidate the whole authority. Ownership-sensitive operations use `fresh`.
Stopping or invalidating settles pending callers with a failure so they can retry.

`createProjectManifestConversionActor` orders `establishIdentity` before
`replaceManifest`. The host retains original and converted bytes in actor closures,
and its replacement actor must compare the original bytes under the storage authority.
An identity failure or mismatch never replaces the manifest. Historical Git objects
remain untouched; conversion writes only the current authored revision.

## Environment

| Entry    | Environment                                                                         |
| -------- | ----------------------------------------------------------------------------------- |
| ESM root | Browsers and browser workers with `TextEncoder`/`TextDecoder`; Node.js 24 or newer. |

## Versioning and stability

The package is pre-1.0; minor versions may introduce breaking changes. See the
[release policy](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md).

## Source and provenance

The implementation is extracted from Tau's existing project manifest schema and parser, preserving
its behavior and documentation. The [source repository](https://github.com/taucad/tau/tree/main/packages/core/project)
contains the package and its tests. For registry artifacts, `npm audit signatures` verifies available
registry signatures and provenance; source extraction alone does not establish a release qualification.

## License

Apache-2.0 — see [LICENSE](./LICENSE). Tau-authored source retains that license through this extraction.

## Links

- [Changelog](./CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
