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

| Export                           | Purpose                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| `createBundlerSourceHost`        | rooted project, built-in, URL, and package source sessions               |
| `PackageArtifactCache`           | CDN artifact cache for projects without a `package-lock.json`            |
| `installPackages`                | Install/Upgrade: edit `dependencies`, resolve, write `package-lock.json` |
| `materializePackages`            | fetch, verify and unpack every locked tarball into `node_modules/`       |
| `resolveDependencyTree`          | deterministic npm-compatible tree from package.json ranges               |
| `parsePackageLock`               | read a lockfileVersion 3 lock, including one npm wrote                   |
| `serializePackageLock`           | write a lock byte-for-byte as npm does                                   |
| `readPackageLock`                | read the project lock or report `lock-invalid`                           |
| `lockMatchesManifest`            | report `lock-stale` when package.json and the lock disagree              |
| `createPackageManifestCommit`    | publish through the existing filesystem checked-write authority          |
| `normalizeAssetImportAttributes` | length-preserving normalization for supported asset imports              |
| `resolveAssetIntent`             | compiler-neutral query/attribute loader intent                           |

## Project packages

A Tau project is an ordinary npm package. Two files describe its packages, and both are the files npm
itself reads:

- `package.json` is the author's. `dependencies` holds ranges (`"d3-shape": "^3"`), npm aliases
  (`"replicad": "npm:@taulabs/replicad@1.1.0-taulabs.0"`) or dist-tags. Tau changes it only when you
  Install or remove a package, and then only the `dependencies` map; every other key, the key order and
  the indentation are kept.
- `package-lock.json` (lockfileVersion 3) records every package in the tree, transitive ones included,
  at its `node_modules/<path>` with the exact version, the registry tarball URL and its SHA-512
  `integrity`. Tau writes it in npm's layout and key order, so `npm ci` accepts it unmodified and the tree
  matches the one npm resolves.

### Install

```typescript
import { createPackageManifestCommit, installPackages } from '@taucad/bundler-core';

const commit = createPackageManifestCommit({ authority: rootedFilesystem, signal });

const { lock, issues } = await installPackages({
  filesystem,
  commit,
  mode: 'install',
  add: { 'd3-shape': '^3' },
  signal,
});
```

- `mode: 'install'` behaves like `npm install`: versions already in the lock are kept while they
  satisfy package.json, so a repeated Install with nothing changed fetches nothing and writes nothing.
  Packages named in `add` are resolved afresh, like `npm install name@range`.
- `mode: 'upgrade'` resolves the names in `upgrade` afresh, or every package when `upgrade` is omitted.
- Resolution follows npm 7+: the highest version satisfying each range (the `latest` tag first when it
  satisfies), each package placed at the shallowest `node_modules` level without a conflicting
  version, nested under its dependent otherwise. A missing peer is installed beside its dependent;
  optional peers are not installed. Optional dependencies are recorded with their `os`/`cpu`
  constraints; `devDependencies` are recorded with `dev: true`.
- Writes are two checked writes through the filesystem authority: package.json against the bytes read
  (only when `add`/`remove` changed it), then package-lock.json against its own previous bytes and the
  package.json just written. A concurrent edit produces a `manifest-conflict` issue. If the second write
  loses, package.json is ahead of the lock, which is npm's own recoverable state: `npm ci` refuses,
  Tau reports `lock-stale`, and running Install again repairs it.
- `createPackageManifestCommit` maps each write to `writeFileChecked` on the existing rooted
  authority and preserves `known-not-applied` versus `potentially-applied` failures; after an uncertain
  failure, reread both files before retrying. A `readFile` followed by `writeFile` is not a correct
  commit adapter.

Every refusal is an issue with a stable `code` and a message naming the fix, and no file is written:
`registry-unavailable`, `no-matching-version`, `peer-conflict`, `unsupported-dependency-protocol`
(git, file, link, workspace and URL specifiers) and `manifest-conflict`. `install-script-skipped` is a
warning: the package is locked, but its install script is never run.

### Materialise

`materializePackages({ filesystem, lock, signal })` installs the lock into `node_modules/<path>/`. Each
tarball is fetched from its `resolved` URL, checked against `integrity` and unpacked in memory before a
byte is written; a tar entry that escapes the package directory is refused, and links and devices are skipped.
`node_modules/.tau-install-state.json` records the integrity installed at each path, so a warm run
fetches nothing, and paths no longer in the lock are removed. Native (`os`/`cpu`) and failed optional
packages are skipped with `package-unavailable-in-host`; any other failure is an issue for that package
only.

### How bundling resolves packages

Built-in kernel modules (`replicad`, `manifold-3d`, …) always win. For any other bare import:

- **With `package-lock.json`**, the import resolves Node-style over the installed `node_modules/` tree
  (`exports` with the `browser`, `import`, `module` and `default` conditions, `imports`, `module`/`main`,
  nested copies first). A package that is not installed fails that import with `package-not-installed`;
  a lock that no longer matches package.json fails every bare import with `lock-stale`. Project-relative
  imports still build. When the lock names a different version of a built-in's package than Tau runs,
  the build warns `package-version-mismatch`.
- **Without a lock**, the import is loaded as a CDN bundle, as before, and the build warns
  `package-not-locked` once per package so the author can run Install.

Package issues reach `BundleResult` as `BUNDLER_FAILED` warnings or errors whose `details` is the `PackageIssue`.

### What Tau never does

- Run package lifecycle scripts or any project script, or spawn npm or another package manager.
- Write a Tau-specific key into package.json or package-lock.json, or keep a second lock.
- Treat CDN output as package identity. Identity is the registry tarball named by `resolved` and
  verified against `integrity`.
- Install from git, file, link, workspace or URL specifiers, or from private or authenticated
  registries.

Packuments are read in npm's abbreviated form (`application/vnd.npm.install-v1+json`), which carries no
`license`; Tau's lock therefore omits the `license` lines npm adds from full metadata. `npm ci` does not
read them.

### Reproduce

```bash
pnpm nx test bundler-core --watch=false
pnpm nx test-browser bundler-core
TAU_NPM_LIVE_TESTS=true pnpm nx test bundler-core --watch=false
pnpm nx lint bundler-core
pnpm nx typecheck bundler-core
pnpm nx build bundler-core
```

The resolver tests reproduce `npm install --package-lock-only` (npm 11.6.1) output for a plain,
transitive, nested-version, peer and npm-alias project from recorded registry packuments. The live
test (opt in with `TAU_NPM_LIVE_TESTS=true`) installs against the public registry, compares the tree
with npm's own resolution and runs `npm ci --ignore-scripts` on the written lock.

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
