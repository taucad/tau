# @taucad/geospec-engine

The `geospec` CLI and the Node worker pool for the [`geospec`](../geospec) matcher API.

`geospec` owns canonical authoring, selectors, diagnostics and host integration.
Geometry runs in the shared [compiled engine](../geospec-engine-native/README.md);
this package spawns it, one engine per pool worker, and reports the run.

Authored `*.geospec.ts` files never import this package. A spec depends on the Apache-2.0 substrate only.

## Install

```bash
npm install --save-dev geospec @taucad/geospec-engine
```

Tests import `loadModel` from `geospec/model` and `expectGeo` from `geospec`;
they do not register or choose an engine.

## The `geospec` CLI

```bash
geospec run .
geospec run . --include "parts/**/*.geospec.ts"
geospec run . --exclude "**/*.slow.geospec.ts"
geospec run . --file main.geospec.ts --test-name-pattern volume
geospec run . -t "intended envelope"
geospec run . --file lib
geospec run . --workers            # worker pool, auto-sized
geospec run . --workers 4 --shard-timeout 600000
geospec run . --forensic --matcher-wall-backstop 600000
geospec run . --bail
geospec run . --json
```

| Flag                                    | Meaning                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--file <path>`                         | GeoSpec file or directory root; repeatable. Empty input discovers from the project root.                  |
| `--include <glob>` / `--exclude <glob>` | Vitest-style file globs; repeatable. Include defaults to `**/*.geospec.{ts,js}`.                          |
| `-t`, `--test-name-pattern <re>`        | JavaScript regular expression matched against the full `suite > test` name.                               |
| `--test-timeout <ms>`                   | Timeout for each async test callback.                                                                     |
| `--workers [n]`                         | Run in a worker pool. Default is one; omit the count after the flag to request available CPU parallelism. |
| `--shard-timeout <ms>`                  | Per-shard **non-verdict** watchdog. Off by default.                                                       |
| `--matcher-wall-backstop <ms>`          | Per-matcher **non-verdict** watchdog. Off by default.                                                     |
| `--forensic`                            | Include structured timing measurements in the run output.                                                 |
| `--bail`                                | Stop after the first red file. Interactive use only — a reward run wants the complete red set.            |
| `--json`                                | Print exactly one JSON result document on stdout and nothing else.                                        |

**The exit code is the verdict.** `0` only when the run succeeded; any failure, any run-level issue, and an empty
selection are all `1`. Check complete accounting and source identity as well.
Filters prove only the selected scope; excluded, unsupported, inconclusive and
not-run requirements are not passes.

## Embedded runners

The CLI runs on the Node pool below. Each worker owns one compiled engine; live
subjects never cross worker boundaries, while source-bound results and complete
accounting do.

```ts
import { createGeoSpecNativeNodePoolRunner } from '@taucad/geospec-engine/native-pool/node';
import process from 'node:process';

const runner = createGeoSpecNativeNodePoolRunner({
  projectPath: process.cwd(),
  workers: 1,
});

try {
  const result = await runner.run({ files: ['specs/bracket.geospec.ts'] });
  console.log(result);
} finally {
  await runner.close();
}
```

To run serially in this process instead, use `createNativeGeoSpecRunner` from `geospec/runner/native` with a compiled
engine and a project filesystem from `createNodeVmFileSystem` (`@taucad/geospec-engine/node-filesystem`).

Other embeddings must qualify their binding, input representation and supported
domain; a shared authoring API does not establish cross-host verdict equivalence.

## Configuration

The separate [configuration API](../geospec/src/config/README.md) loads explicit
project configuration for embedding consumers; it does not automatically wire
those values into this CLI. Proof and representation
limits remain engine-owned. Runner event subscriptions use `on(event, handler)`;
call `close()` even when a run fails. A watchdog interruption is not a geometric
verdict. Platform support is limited to actually qualified compiled artifacts.

## License

**[Apache-2.0](./LICENSE)**. The engine may be used, modified, embedded, hosted, and redistributed, including in
commercial and competing products, subject to the Apache licence and notice requirements.

Running this engine puts no license obligation on your specs, your models, or your verdicts. See
[LICENSING.md](../../LICENSING.md) at the repository root for the repository-wide licensing policy.
