# @taucad/bundler-core

[![npm](https://img.shields.io/npm/v/@taucad/bundler-core)](https://www.npmjs.com/package/@taucad/bundler-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/bundler-core)](https://www.npmjs.com/package/@taucad/bundler-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/bundler-core)](https://www.npmjs.com/package/@taucad/bundler-core)
[![license](https://img.shields.io/npm/l/@taucad/bundler-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared source resolution and acquisition for Tau bundler plugins

## Why @taucad/bundler-core?

- **Shared implementation, one owner** — helpers several Tau plugin packages need, published once
  instead of copied.
- **Not a plugin** — it declares no capabilities and initializes no backend at module scope; plugin
  packages call it from their own `initialize()`.
- **Explicit named barrel** — every export is listed in `src/index.ts`, so the public surface is
  reviewable and tree-shakes.

## Install

```bash
npm i @taucad/bundler-core @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime.

## Quick start

```typescript
import { createBundlerSourceHost } from '@taucad/bundler-core';

const host = createBundlerSourceHost({ filesystem });
const session = host.beginSession({ mode: 'bundle', signal, entryPath: '/main.ts' });
const resolution = await session.resolve({ specifier: '/main.ts' });
const source = await session.load(resolution);
const observation = session.complete();
```

## API

| Export                           | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `createBundlerSourceHost`        | rooted project, built-in, URL, and package source sessions     |
| `PackageArtifactCache`           | exact, content-addressed self-contained package artifact cache |
| `normalizeAssetImportAttributes` | length-preserving normalization for supported asset imports    |
| `resolveAssetIntent`             | compiler-neutral query/attribute loader intent                 |

## Environment

| Host           | Supported | Notes                            |
| -------------- | --------- | -------------------------------- |
| Browser worker | Yes       | no Node built-ins in the payload |
| Node.js        | Yes       | `>=24`                           |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/core/bundler)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/bundler/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
