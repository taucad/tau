---
title: 'Public Surface Policy'
description: 'Freeze register and admission rules for published Tau package exports, subpaths, declarations, and unstable internal escape hatches.'
status: active
created: '2026-08-15'
updated: '2026-08-31'
related:
  - docs/policy/version-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/release-policy.md
  - docs/research/runtime-prepublish-gate-blueprint.md
  - docs/research/runtime-plugin-toolkit-charter.md
---

# Public Surface Policy

This policy governs what Tau treats as a published JavaScript and TypeScript surface, when that surface freezes, and which checks admit a new surface. Version bump rules remain in [Version Policy](version-policy.md); package construction and publication remain in [Release Policy](release-policy.md).

## Scope

A package's public surface includes:

- every key in its published `package.json#exports` map;
- every value and type reachable from those export keys in shipped declarations;
- exported runtime behavior, option defaults, errors, events, and wire-visible values;
- command names and flags exposed by a shipped `bin` entry;
- documented import paths that the package promises consumers may copy.

Source paths, unexported declarations, tests, and build-only files are not public merely because they exist in the repository. An `@internal` annotation does not remove a declaration from the public surface if a published export can reach it.

## Freeze Event

The freeze event is the first publication of a Tau package under the npm `latest` dist-tag. Before that event, alpha, beta, and release-candidate surfaces may be replaced atomically without a deprecation shim when all of the following are true:

1. the replacement is applied across the repository in one change;
2. the affected pre-release has not been promoted to `latest`;
3. the breaking change is named in its version plan and changelog;
4. its package, surface, tests, examples, and documentation move together.

After the freeze event, stable surfaces follow the full SemVer, deprecation, and migration rules in Version Policy. A later beta publication does not reopen the atomic-replacement license for a package that has already crossed the freeze event.

The freeze register records historical fact; adding an entry does not itself promote a beta surface to stable.

## Freeze Register

### `@taucad/runtime@0.1.0-beta.1`

This version was published under the `beta` tag and has not crossed the freeze event. Registry artifact integrity: `sha512-MN7tmjk05UlRvlfeXv4ln0NIps2rlpyMBI6IEZN07ldP3Q/ZcUnssVeIxIxeIMdHuHI7C/54TZNii6QFZ8fbmQ==`.

The published export keys were:

- `.`
- `./worker/web`
- `./worker/node`
- `./worker-internals`
- `./transport-internals`
- `./types`
- `./metadata`
- `./kernel`
- `./kernels`
- `./middleware`
- `./bundler`
- `./transcoder`
- `./transport`
- `./transport/in-process`
- `./transport/web`
- `./transport/node`
- `./host`
- `./middleware/runtime-middleware`
- `./kernels/replicad`
- `./kernels/jscad`
- `./kernels/manifold`
- `./kernels/opencascade`
- `./kernels/zoo`
- `./kernels/zoo/engine-connection`
- `./kernels/tau`
- `./bundler/esbuild`
- `./middleware/parameter-cache`
- `./middleware/geometry-cache`
- `./middleware/gltf-coordinate-transform`
- `./middleware/gltf-edge-detection`
- `./node`
- `./filesystem`
- `./filesystem/node`
- `./filesystem/browser`
- `./testing`
- `./cross-origin-isolation`
- `./cross-origin-isolation/express`
- `./react-router`
- `./vite`
- `./rolldown`

The npm tarball's declarations are the historical symbol-level record for each key. The working-tree export map and generated declarations must never be used to rewrite this historical entry.

Add a register section for every later published version that adds, removes, renames, or changes a surface. A version with no surface change may point to the preceding entry and list only its artifact integrity.

## Current Pre-Publish Topology

The next runtime prerelease is the framework owner only. It bundles exactly nine private workspace libraries: events, filesystem, fs-bridge, JSON Schema, memory, RPC, types, units, and utils. Each has `@taucad/runtime` as its only published bundle owner. Converter, glTF-extensions, and the private VM library were dissolved; the VM's sources now live inside `@taucad/esbuild`, which publishes them under its own `./vm` subpath. `@taucad/geometry-core` and `@taucad/occt-core` are independently published shared implementation packages.

The as-built runtime export map contains the root plus these public subpaths:

- framework and authoring: `./client`, `./worker`, `./plugin`, `./kernel`, `./middleware`, `./bundler`, `./transcoder`, `./types`, and `./metadata`;
- transports: `./transport`, `./transport/in-process`, `./transport/web`, `./transport/node`, `./transport/websocket`, and `./transport/websocket-host`;
- filesystems: `./filesystem`, `./filesystem/node`, and `./filesystem/browser`;
- framework adapters: `./worker/web`, `./electron/main`, `./electron/preload`, `./electron/renderer`, `./electron/utility`, `./electron/vite`, `./node`, `./cross-origin-isolation`, `./cross-origin-isolation/express`, `./react-router`, `./vite`, `./nextjs/config`, and `./nextjs/browser-node-builtins`;
- package metadata: `./package.json`.

The migration removes `./presets`, `./kernels`, every `./kernels/*` key, every concrete `./middleware/*` key, `./bundler/esbuild`, `./vm`, and `./worker/node`. It adds `./plugin`. The websocket subpaths remain the topology-specific remote transport surfaces.

Kernel, middleware, and transcoder phantom carriers use module-private `unique symbol` keys. The public guarantee is structural opacity: consumers can use the exported plugin types and preserve exact inference, but cannot name or forge a phantom property. The symbol declarations, their local identifiers, and their computed property names are implementation details and must not be added to the freeze register as public symbol names.

This section records the admitted candidate topology, not a publication event. After the candidate is published, add its version and registry integrity to the Freeze Register without replacing the historical `0.1.0-beta.1` entry.

Concrete capabilities are owned by the publishable packages under `packages/plugins/*`; shared public implementation code is owned by `packages/core/*`. Every toolkit root exports the named callable factory `plugin` and no default export. `@taucad/runtime` has never been published under `latest`, so this is a pre-freeze atomic replacement, not a deprecation event. Leave the historical `0.1.0-beta.1` entry untouched.

## Pending Surface Register

The sections below register working-tree candidates for the next release train. They are not publication records, have no registry integrity yet, and do not alter the immutable `@taucad/runtime@0.1.0-beta.1` history above. The `nanoraster@0.5.0` registry cutover and W4 production-browser verification remain pending; append separate published-version sections with registry integrity only after those gates pass.

### Candidate: `@taucad/spatial@0.0.1`

The initial package publishes `.` and `./package.json`. Its root owns renderer-neutral coordinate conventions, `RenderFrame`, physical/render point, plane, and bounds mappings, unit-scale resolution, coordinate transforms, and render-frame rebase/rescale predicates. It has no renderer dependency.

### Candidate: `@taucad/camera@0.0.1`

The initial package publishes `.`, `./machine`, and `./package.json`. The root owns serializable camera state and views, projection math, bounds framing, and pixel-delta comparison. `./machine` owns the optional XState camera authority, its input/snapshot types, and projection/driver selectors.

### Candidate: `@taucad/three@0.0.1`

The initial package publishes `.`, `./camera`, `./spatial`, and `./package.json`. The root and `./camera` adapt renderer-neutral camera state to persistent Three.js camera rigs and copy native cameras back to serializable state. `./spatial` maps physical points, bounds, planes, and render frames to and from Three.js values.

### Candidate: `@taucad/image` camera surface

The next major candidate adds `./camera`, exporting `toNanorasterCamera` and `NanorasterCameraOptions`; the root also re-exports the adapter. The adapter lowers a complete renderer-neutral `CameraState` to nanoraster's fixed-camera contract without reintroducing renderer authority. This release also adopts nanoraster's breaking v10 caller-world option schema.

### Candidate: `@taucad/runtime` transcode surface

The next major candidate adds direct caller-owned artifact transcoding through `RuntimeClient.transcode()`, typed transcoder edges and options, a configurable transcode timeout, and `TranscodeTimeoutError` on the `./client` surface. The existing `./transcoder` authoring subpath remains the home of `defineTranscoder` and its supporting contracts.

The same candidate advances the transport wire to `protocolVersion === 2`; version-1 peers must fail at handshake rather than at the first transcode call. It also replaces the legacy independent plugin-bag client generics with `RuntimeClient<Runtime, Transport>`. Both changes are intentionally breaking and are named in the major version plan.

## Admitting a New Subpath

Every new public subpath must include all five items in the same change:

1. a named consumer audience and use case;
2. a consumer-facing documentation entry using the subpath;
3. a surface test pinning the development and publish export maps;
4. a size-limit entry measuring the subpath's shipped JavaScript;
5. a version plan naming the addition.

Do not add a convenience barrel when a concrete capability subpath already serves the audience. Adding a subpath is SemVer-additive, but it is still a permanent maintenance commitment and must pass this admission gate.

## Changing or Removing a Surface

Before the freeze event, use an atomic replacement with a version-plan and changelog note; do not add a compatibility alias for a contract that has not stabilized. After the freeze event, follow Version Policy's breaking-change and deprecation protocol.

Never remove a subpath merely by deleting its source entry. Update the development map, publish map, build entry, size limit, public-surface audit, documentation, and freeze register together.

## Internal Escape Hatches

The canonical unstable subpath suffix is `-internals`, as in `./worker-internals`. A `-internals` subpath carries no SemVer compatibility promise and may change in any release. Its documentation must state its narrow framework audience and instability.

Do not create a competing `/internal` spelling. Do not use `@internal` JSDoc as the sole boundary: keep internal declarations unreachable from stable export keys or place the deliberate escape hatch behind a named `-internals` subpath.

## Public JSDoc Gate

`tau-lint/require-public-export-jsdoc` must be error-level for `packages/**` before the first 1.0 release. Every declaration reachable from a public package entry must carry `@public`; use `@internal` only for declarations that are not reachable from a stable export.

Do not suppress the rule to land a new surface. Either document the declaration as public or remove it from the export graph.

## Grandfathered Plural Subpaths

The `./types` segment is grandfathered and may remain.

New subpath segments follow Library API Policy's singular-noun rule. Grandfathering does not authorize a second broad barrel or a plural alias for a new singular subpath.

## Required Gates

Before versioning a publishable surface, run:

- its export-map coverage test;
- its public-surface audit;
- its package build and pkgcheck target;
- its size-limit target;
- a pack-and-install smoke in an empty consumer;
- `pnpm docs:validate`.

For `@taucad/runtime`, `packages/runtime/scripts/audit-public-surface.mts`, `packages/runtime/src/exports-coverage.test.ts`, and `.size-limit.json` are the canonical surface gates.

## Review Checklist

Reviewers must confirm:

1. every new subpath has all five admission artifacts;
2. development and publish export maps have identical keys;
3. public declarations carry `@public` and internal declarations are structurally unreachable;
4. plural names are either grandfathered here or rejected;
5. `-internals` is used only for a documented unstable escape hatch;
6. the version plan and freeze register reflect the published change;
7. no beta-only atomic replacement crosses a package's freeze event.
