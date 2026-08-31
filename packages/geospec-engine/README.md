# @taucad/geospec-engine

The GeoSpec **engine** — the executor behind the [`geospec`](../geospec) matcher API.

`geospec` owns the spec surface: the DSL, the selector language, the diagnostics schema, the 23-matcher registry and the
executor seam. It executes no geometry. This package supplies the bodies — matcher implementations, geometry proofs,
mesh oracles, the lazy BRep evidence ledger and its authenticated cache, the OpenCascade and Manifold kernel adapters,
the worker pool, and the `geospec` CLI.

Authored `*.geospec.ts` files never import engine code. That is the point of the split: a spec depends on the
Apache-2.0 substrate, and the Apache-2.0 engine is an implementation the host installs.

## Install and register

```bash
npm install --save-dev geospec @taucad/geospec-engine
```

```ts
import '@taucad/geospec-engine/register';
```

One side-effect import, once at startup. Registration is idempotent. Until it happens, every engine-backed entry point
answers with a `GEOSPEC_ENGINE_UNAVAILABLE` diagnostic instead of crashing, and
`describeGeoSpecEngine()` (from `geospec/engine`) reports exactly what the installed build can execute — an incomplete
engine is a supported state, not a broken one.

## The `geospec` CLI

```bash
geospec run .
geospec run . --include "parts/**/*.geospec.ts"
geospec run . --exclude "**/*.slow.geospec.ts"
geospec run . --file main.geospec.ts --test-name-pattern volume
geospec run . -t "^(?!.*no meshing interference).*"
geospec run . --file lib
geospec run . --workers            # worker pool, auto-sized
geospec run . --workers 4 --shard-timeout 600000
geospec run . --cache-directory /var/cache/geospec
geospec run . --no-cache --forensic --matcher-wall-backstop 600000
geospec run . --bail
geospec run . --json
```

| Flag                                    | Meaning                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--file <path>`                         | GeoSpec file or directory root; repeatable. Empty input discovers from the project root.       |
| `--include <glob>` / `--exclude <glob>` | Vitest-style file globs; repeatable. Include defaults to `**/*.geospec.{ts,js}`.               |
| `-t`, `--test-name-pattern <re>`        | JavaScript regular expression matched against the full `suite > test` name.                    |
| `--test-timeout <ms>`                   | Timeout for each async test callback.                                                          |
| `--workers [n]`                         | Run in a worker pool. Omit `n` to auto-size to `min(shards, cpus − 2, memory / 3.5 GiB)`.      |
| `--shard-timeout <ms>`                  | Per-shard **non-verdict** watchdog. Off by default.                                            |
| `--matcher-wall-backstop <ms>`          | Per-matcher **non-verdict** watchdog. Off by default.                                          |
| `--cache-directory <path>`              | Authenticated evidence-cache directory outside the project.                                    |
| `--no-cache`                            | Disable persistent evidence caching. Cannot be combined with `--cache-directory`.              |
| `--forensic`                            | Include structured timing measurements in the run output.                                      |
| `--bail`                                | Stop after the first red file. Interactive use only — a reward run wants the complete red set. |
| `--json`                                | Print exactly one JSON result document on stdout and nothing else.                             |

**The exit code is the verdict.** `0` only when the run succeeded; any failure, any run-level issue, and an empty
selection are all `1`. An empty selection failing is deliberate: a filter typo that silently "passes" is the easiest
way to make a suite look green.

## Embedded runners

The CLI is a thin shell over the same runners an application can embed. A CLI run and an embedded run take the same
path, so a verdict never depends on how the spec was invoked.

```ts
import '@taucad/geospec-engine/register';
import { createGeoSpecNodeRunner, createNodeVmFileSystem } from 'geospec/runner/node';
import { createModelLoader } from 'geospec/model';

const runner = createGeoSpecNodeRunner({
  // The VM world is rooted at `/` over a filesystem confined to the project.
  filesystem: createNodeVmFileSystem(projectPath),
  projectPath: '/',
  modelLoader: createModelLoader({ projectPath }),
  cacheDirectory: '/var/cache/geospec',
});

const result = await runner.run({
  files: ['specs/bracket.geospec.ts'],
  forensic: true,
  matcherWallBackstop: 600_000,
});
await runner.close();
```

`geospec/runner/node` also exposes `createGeoSpecNodePoolRunner`; `geospec/runner/web` exposes
`createGeoSpecWebRunner` and `createGeoSpecWebPoolRunner`, which hide `Worker` and `MessagePort` behind a worker
factory. A browser pool worker calls `startGeoSpecPoolWorkerHost` (`geospec/runner/worker`) with the application's own
filesystem and loaders.

Three properties the pool holds, and the reasons they are properties rather than intentions:

- **A pooled run equals a serial run outside durations.** Results are reported in declared file order, and a split file's
  per-test shards are folded back into one file result.
- **A failed shard is never retried.** Retrying is how a reward function learns to hide nondeterminism.
- **Live subjects never cross a worker boundary.** The content-addressed evidence cache is the channel between workers;
  the wire carries a subject's content hash, and compiled module code is elided.

## Configuration

GeoSpec reads no environment variables and has no repository configuration file. Proof algorithms, work-unit budgets,
and the process-local OCCT lifecycle are versioned engine behavior rather than caller-selectable settings. Operational
controls are explicit: `cache` and `cacheDirectory` belong to Node runner construction, while `forensic` and
`matcherWallBackstop` belong to one `run()` call. Runner and protocol events are subscribed through their required
`on(event, handler)` methods.

## License

**[Apache-2.0](./LICENSE)**. The engine may be used, modified, embedded, hosted, and redistributed, including in
commercial and competing products, subject to the Apache licence and notice requirements.

Running this engine puts no license obligation on your specs, your models, or your verdicts. See
[LICENSING.md](../../LICENSING.md) at the repository root for the repository-wide licensing policy.
