# @taucad/skills

[![npm version](https://img.shields.io/npm/v/@taucad/skills.svg)](https://www.npmjs.com/package/@taucad/skills)
[![npm downloads](https://img.shields.io/npm/dw/@taucad/skills.svg)](https://www.npmjs.com/package/@taucad/skills)
[![license](https://img.shields.io/npm/l/@taucad/skills.svg)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue.svg)](https://docs.npmjs.com/generating-provenance-statements)

Tau CAD agent skill bundles for replicad, JSCAD, Manifold, OpenCascade, build123d, PicoGK, OpenSCAD, KCL and GeoSpec.

## Why this package?

- **Point any agent host at Tau's CAD API knowledge.** One command copies nine skill bundles into `.agents/skills/` (or the `.claude/skills` alias). No Tau runtime, no Tau tool names, no Tau-specific host.
- **Generated from the real API, never hand-written.** Each bundle is extracted from its kernel's authoritative surface — TypeScript declarations, Python `inspect`, Roslyn, the OpenRSCAD builtins table, the KCL stdlib export.
- **Dependency-only, so nothing drifts.** This package carries no copy of any bundle. Every bundle is read out of the package that owns the API it documents, at that package's own version.
- **Progressive disclosure.** A bundle is a small `SKILL.md` an agent always sees, an `api-index.md` naming every symbol, and shards it reads only when it needs a signature.
- **Attribution included.** Upstream licences and notices ship as `NOTICE`.

## Installation

```bash
npm install --save-dev @taucad/skills
```

```bash
pnpm add -D @taucad/skills
yarn add -D @taucad/skills
```

Node >= 24. The nine owner packages are ordinary dependencies, so installing this package installs them; the bundles are read from there rather than copied here.

## Quick start

Install the bundles into your project's skills directory:

```bash
npx taucad-skills
# Installed 9 skill bundles into .agents/skills: cad-build123d, cad-jscad, …
```

Pass a directory to target a different host convention:

```bash
npx taucad-skills .claude/skills
```

Rerun after upgrading a dependency to refresh the bundles in place.

To drive it from code — for example from your own setup script:

```typescript
import { installSkills, resolveSkillBundles } from '@taucad/skills';

for (const bundle of await resolveSkillBundles()) {
  console.log(bundle.slug, bundle.files.length);
}

await installSkills('.agents/skills');
```

## Bundles

| Slug                | Owner package         | Language of the authoritative surface                    |
| ------------------- | --------------------- | -------------------------------------------------------- |
| `cad-replicad`      | `@taucad/replicad`    | TypeScript (`replicad`)                                  |
| `cad-jscad`         | `@taucad/jscad`       | TypeScript (`@jscad/modeling`)                           |
| `cad-manifold`      | `@taucad/manifold`    | TypeScript (`manifold-3d`)                               |
| `cad-opencascadejs` | `@taucad/opencascade` | TypeScript (`libcascade` / OpenCascade; signatures only) |
| `cad-build123d`     | `@taucad/build123d`   | Python                                                   |
| `cad-picogk`        | `@taucad/picogk`      | C#                                                       |
| `cad-openscad`      | `@taucad/openrscad`   | OpenRSCAD builtins table                                 |
| `cad-zoo`           | `@taucad/zoo`         | KCL stdlib export                                        |
| `geospec-authoring` | `geospec`             | TypeScript                                               |

The table is documentation; the installed set is whatever the owner packages
declare. `resolveSkillBundles()` returns the live answer.

## API

| Export                              | Purpose                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `skillOwners`                       | The packages that own a bundle. Every entry is a declared dependency of this package. |
| `resolveSkillBundles(owners?)`      | Every declared bundle, each file addressed by bare specifier and resolved URL.        |
| `installSkills(directory, owners?)` | Copy every resolved bundle to `<directory>/<slug>/`. Returns the slugs written.       |

## What a bundle assumes of a host

A bundle is plain files. It assumes only that the host can:

1. Read `SKILL.md` from a directory named after the skill, and use its front matter to decide when to activate it.
2. Open the sibling files that `SKILL.md`'s reference map names, by a path relative to the skill directory.
3. Read a byte range of a large file, or grep it. `cad-opencascadejs` covers thousands of symbols and is a grep-and-range-read target by construction, not a single read.

It assumes nothing else. No Tau runtime, no Tau tool names, no absolute paths, no network access.

## Environment matrix

| Entry point           | Node        | Browser                    |
| --------------------- | ----------- | -------------------------- |
| `@taucad/skills`      | Yes (>= 24) | No — reads files from disk |
| `taucad-skills` (bin) | Yes (>= 24) | No                         |

The bundles themselves are markdown and are environment-neutral; only the resolver and installer are Node-only.

## Versioning & stability

Pre-1.0. Minor version bumps may contain breaking changes. See
[`release-policy.md`](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md).

Each bundle is versioned with the package that owns the API it describes, so a
bundle can never describe a version its owner has moved past.

## Security & provenance

```bash
npm audit signatures
```

## License

Apache-2.0. See [`LICENSE`](./LICENSE).

The bundles are derived from upstream projects' declared API surfaces and carry
their attributions. See [`NOTICE`](./NOTICE) for the full list — replicad (MIT),
`@jscad/modeling` (MIT), `manifold-3d` (Apache-2.0), build123d (Apache-2.0),
PicoGK (Apache-2.0), OpenRSCAD (Apache-2.0 OR MIT), the Zoo KCL stdlib (MIT),
and Open CASCADE Technology (LGPL-2.1 with the Open CASCADE exception).
The OpenCascade corpus contains factual API names and signatures only; upstream
documentation prose is excluded.

## Links

- Documentation: <https://tau.new/docs>
- Source: <https://github.com/taucad/tau/tree/main/packages/skills>
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Issues: <https://github.com/taucad/tau/issues>
