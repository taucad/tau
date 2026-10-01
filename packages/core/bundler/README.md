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
const session = host.beginSession({ mode: 'bundle', signal, entryPath: 'main.ts' });
const resolution = await session.resolve({ specifier: 'main.ts' });
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

## Deterministic project packages

`updatePackageManifest` resolves public npm requests and writes exact versions into a project
`package.json`. It retains each original range or dist-tag in `taucadPackageLock`, alongside the
registry version, tarball URL/SHA-512 integrity, compatibility requirements, and the SHA-256 identity
of the CDN code actually consumed. `tau.json` and repository dependencies remain separate.

```typescript
import { updatePackageManifest } from '@taucad/bundler-core';

const lock = await updatePackageManifest({
  filesystem,
  requests: { 'is-number': '^7.0.0' },
  mode: 'install',
  nodeVersion: '24.0.0',
  signal,
  commit,
});
```

The host supplies `filesystem` from its existing rooted filesystem authority and
`commit({ expected, content })` as an **atomic compare-and-swap of `package.json`**. Compare the
complete prior text (or absence), then publish the complete replacement in the same host-owned
transaction/lock. Return `false` on a concurrent edit; throw on a failed write without replacing the
previous file. Equal content can be a no-op inside that transaction. A separate `readFile` followed
by `writeFile` is **not** a correct cross-worker commit adapter. Reuse the host's workspace store;
this package does not create a second store, lock service, or filesystem authority.

`requests` is the complete desired root dependency set. Use the retained `requested` values when
reinstalling or upgrading; do not substitute the generated exact `dependencies` as upgrade ranges.
`mode: 'install'` reuses existing selections and requires an explicit upgrade when a request changes.
`mode: 'upgrade'` fetches fresh registry metadata and selects the highest allowed stable version (or
the explicitly requested prerelease/tag). A moving tag changes only during an explicit upgrade.
Ordinary bundling never upgrades the manifest. The source host reads one manifest snapshot per
session and reports both `package.json` and the locked artifact paths as dependencies.

Warm reinstall works offline and checks cached bytes against their locked SHA-256. A missing artifact
can be restored from its locked URL only if the original digest matches. Changed bytes, an unavailable
URL, or an offline cold cache fail without advancing the lock. Registry retries are bounded and
cancelable; upgrades never silently fall back to stale registry metadata. Acquisition may leave
unreferenced cache files after failure, but only the atomic manifest commit activates a selection.

### Admission and limits

- This slice supports scoped/unscoped **root** public npm packages, npm semver ranges, explicit
  prereleases and dist-tags. npm aliases, private registries, package subpaths, and authenticated
  registry requests are not admitted.
- Node engine and selected root peer ranges must match. Missing optional peers are permitted;
  incompatible selected optional peers fail. A peer's presence does not admit external imports.
- Only self-contained ESM bundles are admitted. Static or dynamic imports remaining after CDN
  bundling fail with a transitive-lock diagnostic. Inlined transitive code is frozen by the bundle
  hash; this is **not** an npm dependency-tree lock or a substitute for `pnpm-lock.yaml` when
  installing the generated manifest with pnpm. Unbundled trees and cross-package peer identity
  still need a broader closure contract.
- npm's tarball integrity identifies the registry tarball; it does **not** authenticate CDN output.
  The CDN output digest records acquired bytes and detects subsequent changes. This is not publisher
  attestation or a sandbox. No package lifecycle hooks or downloaded code are executed by resolution.
- A registry package without SHA-512 integrity is rejected. Compatibility for native ABI, OS/CPU,
  and browser APIs requires host-specific admission beyond this slice.

The npm metadata contract is documented in the
[npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md), and version selection
uses the existing workspace catalog's [node-semver](https://github.com/npm/node-semver).

### Reproduce

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm nx test bundler-core --watch=false
pnpm nx lint bundler-core
pnpm nx typecheck bundler-core
pnpm nx build bundler-core
```

The manifest tests cover scoped packages, exact/range/tag/prerelease selection, offline reinstall,
explicit upgrade, unavailable versions, malformed registry responses, transient retries, peers and
engines, concurrent commits, cancellation, atomic-write failure, cold restoration and digest failure,
and refusal to claim a lock for remaining transitive imports. A live anonymous registry/CDN probe
on 2026-10-01 resolved `is-number@^7.0.0` to `7.0.0`: 222 ms cold and 0.39 ms warm in one Node 24
sample. These are illustrative measurements, not a performance guarantee.

Production integration must supply and test the real host atomic commit adapter, browser-worker
network/CORS behavior, cache eviction/restoration, cancellation during actual provider writes, and
representative UI/runtime packages. The library slice does not wire a Generate UI or TSRX action.

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
