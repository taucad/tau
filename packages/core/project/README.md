# @taucad/project-core

[![npm](https://img.shields.io/npm/v/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/project-core)](https://www.npmjs.com/package/@taucad/project-core)
[![license](https://img.shields.io/npm/l/@taucad/project-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Tau project manifest schema and parsing

## Why this package?

- One schema and parser authority for Tau v1 `tau.json` manifests.
- Explicit parsing for identified projects and adoption before assigning an ID.
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
  id: 'proj_0123456789ABCDEFGHIJK',
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

All exports are available from `@taucad/project-core`.

| Exports                                                                                          | Purpose                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `projectManifestSchema`, `projectIdSchema`, `projectRelativePathSchema`                          | Validate manifest fields with Zod.                                                |
| `projectManifestSchemaUrl`, `projectManifestMaxBytes`                                            | Canonical v1 schema URL and encoded-byte limit.                                   |
| `parseProjectManifestBytes`                                                                      | Parse bytes into an identified manifest or a structured issue.                    |
| `parseAdoptableProjectManifestBytes`                                                             | Parse the manifest while relaxing only its ID for explicit adoption.              |
| `projectToManifest`                                                                              | Select durable manifest fields from a project view.                               |
| `serializeProjectManifest`                                                                       | Validate and encode the manifest as formatted JSON bytes with a trailing newline. |
| `ProjectManifest`, `AdoptableProjectManifest`                                                    | Validated manifest types.                                                         |
| `ProjectManifestParseIssue`, `ProjectManifestParseResult`, `AdoptableProjectManifestParseResult` | Parser issue and result types.                                                    |

Private Tau consumers forward these exports to this authority rather than defining another schema.
Parsing validates the supplied manifest bytes. It does not obtain source files, establish export or
provider identity, generate IDs, or execute geometry.

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
