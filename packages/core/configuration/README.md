# @taucad/configuration-core

[![npm](https://img.shields.io/npm/v/@taucad/configuration-core)](https://www.npmjs.com/package/@taucad/configuration-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/configuration-core)](https://www.npmjs.com/package/@taucad/configuration-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/configuration-core)](https://www.npmjs.com/package/@taucad/configuration-core)
[![license](https://img.shields.io/npm/l/@taucad/configuration-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Standard Schema configuration manifests and admission

## Why @taucad/configuration-core?

- **Shared implementation, one owner** — helpers several Tau plugin packages need, published once
  instead of copied.
- **Not a plugin** — it declares no capabilities and initializes no backend at module scope; plugin
  packages call it from their own `initialize()`.
- **Explicit named barrel** — every export is listed in `src/index.ts`, so the public surface is
  reviewable and tree-shakes.

## Install

```bash
npm i @taucad/configuration-core @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime.

## Quick start

```typescript
// Replace `helper` with the export you need; the root entry is an explicit named barrel.
import { helper } from '@taucad/configuration-core';
```

## API

| Entry                        | Purpose                              |
| ---------------------------- | ------------------------------------ |
| `@taucad/configuration-core` | the shared helpers, as named exports |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/core/configuration)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/configuration/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
