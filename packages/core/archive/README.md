# @taucad/archive-core

[![npm](https://img.shields.io/npm/v/@taucad/archive-core)](https://www.npmjs.com/package/@taucad/archive-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/archive-core)](https://www.npmjs.com/package/@taucad/archive-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/archive-core)](https://www.npmjs.com/package/@taucad/archive-core)
[![license](https://img.shields.io/npm/l/@taucad/archive-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Verified archive acquisition and tar, zip and wheel readers for Tau payloads

## Why @taucad/archive-core?

- **Verify before trusting** — `fetchVerified` checks every download against an SRI pin before any
  byte reaches a reader, with bounded retries, an optional redirect allow-list and no credentials.
- **Refuse rather than repair** — escaping paths, links that leave the extraction root, device and
  hardlink entries, duplicate members and RECORD disagreements are typed `ArchiveError` refusals, not
  warnings.
- **Caps are inputs** — every reader takes `maximumUnpackedBytes` and `maximumEntries` from its
  caller, so each payload kind chooses its own limits.
- **No runtime dependency** — the readers run in a browser worker or Node.js; only `./node` touches
  the filesystem.

## Install

```bash
npm i @taucad/archive-core
```

## Quick start

```typescript
import { fetchVerified, gunzip, readTarEntries } from '@taucad/archive-core';
import { writeArchiveEntries } from '@taucad/archive-core/node';

const limits = { maximumUnpackedBytes: 512 * 1024 * 1024, maximumEntries: 50_000 };
const bytes = await fetchVerified({ url, integrity: 'sha256-…', byteLength, signal });
const { entries } = readTarEntries(await gunzip(bytes, limits), { ...limits, stripComponents: 1 });
const files = await writeArchiveEntries({ root, destination: 'python', entries, signal });
```

`files` lists each written path with its byte length, its sha256 (computed from the bytes written)
and its mode, which is the input to a closure receipt.

## API

| Export                          | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `fetchVerified`                 | download with retries and an SRI check; `fetch` is injectable             |
| `integrityMatches`              | compare bytes with an npm-style SRI string (strongest algorithm decides)  |
| `integrityFromHex`              | turn a published hex digest into a canonical SRI string                   |
| `integrityToHex`                | turn a canonical SRI string back into its algorithm and lowercase hex     |
| `gunzip`                        | bounded gzip decompression                                                |
| `readTarEntries`                | ustar, pax and GNU long names; `stripComponents`; contained symlinks      |
| `readZipEntries`                | stored and deflated members, ZIP64, CRC-32 checked                        |
| `readWheel`                     | a wheel checked against its RECORD, with the `data` scheme returned apart |
| `findCaseCollisions`            | paths that one case-insensitive filesystem would merge                    |
| `ArchiveError`                  | typed refusal with `code`, `reason` and `path`                            |
| `writeArchiveEntries` (`/node`) | exclusive-create writes that hash while writing; links kept or copied     |

## Environment

| Host           | Supported | Notes                                                             |
| -------------- | --------- | ----------------------------------------------------------------- |
| Browser worker | Yes       | the root entry uses `fetch`, Web Crypto and `DecompressionStream` |
| Node.js        | Yes       | `>=24`; `@taucad/archive-core/node` writes to disk                |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with the other `@taucad` packages.
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
- [Source](https://github.com/taucad/tau/tree/main/packages/core/archive)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/archive/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
