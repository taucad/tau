# @taucad/geospec-engine

The GeoSpec **engine** — the executor behind the [`geospec`](../geospec) matcher API.

`geospec` owns canonical authoring, selectors, diagnostics and host integration.
This package supplies the CLI and runner composition. Qualified product hosts
execute geometry through the shared [compiled engine](../geospec-engine-native/README.md).
Reference-engine code and low-level host exports are not an authored-test dialect
or a fallback when compiled evidence is unavailable.

Authored `*.geospec.ts` files never import engine code. That is the point of the split: a spec depends on the
Apache-2.0 substrate, and the Apache-2.0 engine is an implementation the host installs.

## Install and register

```bash
npm install --save-dev geospec @taucad/geospec-engine
```

The CLI installs its Node host. Tests import `loadModel` from `geospec/model`
and `expectGeo` from `geospec`; they do not register or choose an engine.
An embedding host must supply its runner's loader/binding and lifetime.
`register/node` installs Node runner factories; the host-neutral `register`
entry does not install Node factories or a complete canonical model loader.
Missing bindings produce structured errors, not a switch to weaker evidence.

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
geospec run . --no-cache --forensic --matcher-wall-backstop 600000
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
| `--cache-directory <path>`              | Parsed but rejected by the current compiled CLI host; not a supported persistence option.                 |
| `--no-cache`                            | Explicitly request no persistent evidence cache. Cannot be combined with `--cache-directory`.             |
| `--forensic`                            | Include structured timing measurements in the run output.                                                 |
| `--bail`                                | Stop after the first red file. Interactive use only — a reward run wants the complete red set.            |
| `--json`                                | Print exactly one JSON result document on stdout and nothing else.                                        |

**The exit code is the verdict.** `0` only when the run succeeded; any failure, any run-level issue, and an empty
selection are all `1`. Check complete accounting and source identity as well.
Filters prove only the selected scope; excluded, unsupported, inconclusive and
not-run requirements are not passes.

## Embedded runners

The CLI and the Node pool below use the same compiled Node composition.
Other embeddings must qualify their binding, input representation and supported
domain; a shared authoring API does not establish cross-host verdict equivalence.

```ts
import '@taucad/geospec-engine/register/node';
import { createGeoSpecNodePoolRunner } from 'geospec/runner/node';
import process from 'node:process';

const runner = createGeoSpecNodePoolRunner({
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

`geospec/runner/node` also exposes `createGeoSpecNodePoolRunner`; `geospec/runner/web` exposes
`createGeoSpecWebRunner` and `createGeoSpecWebPoolRunner`, which hide `Worker` and `MessagePort` behind a worker
factory. A browser pool worker calls `startGeoSpecPoolWorkerHost` (`geospec/runner/worker`) with the application's own
filesystem and loaders.

The compiled Node pool creates an engine in each worker. Live subjects do not
cross worker boundaries; source-bound results and complete accounting do.
Persistent reference-engine cache options and custom reference runtime factories
are rejected by this pool. Optional native caches in other host compositions do
not imply those CLI options are implemented.

## Configuration

The separate [configuration API](../geospec/src/config/README.md) loads explicit
project configuration for embedding consumers; it does not automatically wire
those values into this CLI or grant cache authority. Proof and representation
limits remain engine-owned. Runner event subscriptions use `on(event, handler)`;
call `close()` even when a run fails. A watchdog interruption is not a geometric
verdict. Platform support is limited to actually qualified compiled artifacts.

## License

**[Apache-2.0](./LICENSE)**. The engine may be used, modified, embedded, hosted, and redistributed, including in
commercial and competing products, subject to the Apache licence and notice requirements.

Running this engine puts no license obligation on your specs, your models, or your verdicts. See
[LICENSING.md](../../LICENSING.md) at the repository root for the repository-wide licensing policy.
