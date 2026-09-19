# Compute-reuse baseline harness

W0 of the [compute reuse substrate charter](../../../../docs/research/compute-reuse-substrate-charter.md), owned by the
[qualification blueprint](../../../../docs/research/compute-reuse-qualification-blueprint.md). Promoted here from the
lane-B spike so the arms, corpus, oracle and thresholds run through ordinary Nx targets instead of private absolute
paths.

| Path               | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualification.ts` | Pinned data only: the arms, the measured intervals, the corpus with its rights, the threshold table with each row's pinned/provisional status.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `oracle.ts`        | Cache-independent geometry oracle over the rendered GLB (occurrence labels, world placement, world bounds, divergence-theorem volume) plus the translate/mirror/swap attacks that must fail it.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `runner.ts`        | Spawns one arm per process behind the harness loader hook; refuses a partial or non-zero run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `harness/`         | The measurement harness: `run-arm.mts` (one process = one arm), `driver.mts` (paired interleaved campaign), `models.mts` (corpus), `probe.mts` (counters, stub session, fault-injection seam), `hook-impl.mjs` (benchmark-only source substitution, never touches production files on disk), `summarize.mts`, `ceilings.mts`, `glb-determinism.mts`, `overhead-floor.mts`, `identity-tracer.mts`. The headless-Chromium confirming leg was NOT promoted: it carries five pre-existing type errors and belongs to W9's host matrix (G-B11); it remains at `spikes/compute-reuse/lane-b/browser`. |

## Commands

```sh
# Correctness, oracle and fault injection (not load-gated):
pnpm nx test runtime-e2e --watch=false

# The full pinning campaign -- ONE command, run it on a quiet host
# (1-minute load average below 3) and record the load beside the result:
pnpm nx compute-baseline runtime-e2e
pnpm nx compute-baseline-summarize runtime-e2e

# Seeded fan-out at 4/8/16 workers as well as 2 (a timing campaign):
TAU_COMPUTE_BASELINE_FANOUT=full pnpm nx test runtime-e2e --watch=false
```

## Arms

`bypass` is the corrected **off** baseline: the loader hook stubs the compute session, because the shipped kernel has no
supported switch (`packages/plugins/replicad/src/replicad.kernel.ts:486` derives `enabled` from asset resolution).
`memory` is the resident tier over `fromMemoryFs`, `durable` the full adapter over a node-filesystem store, and
`poison` answers every lookup with a deliberately wrong BRep so the parity oracle and the work counters can be shown to
fail on a wrong cache.

## Environment

- `TAU_COMPUTE_BASELINE_LOAD_LOG` (**required** by `run-arm.mts`): file the loader hook appends executed-source hashes
  to. A run without it fails rather than producing an unattributable sample (Q5).
- `TAU_COMPUTE_BASELINE_WORKSPACE` (optional): the operator's private model workspace. The `drone` and `quadcopter`
  models live there, carry no licence, and are a host-local leg only -- they are never distributed as fixtures.
- `TAU_COMPUTE_BASELINE_FANOUT=full`: run the seeded fan-out at 2/4/8/16 instead of 2.

## Three traps that silently invalidate results

1. **`--watch off` must re-wrap the handle symbol, not the object.** The opaque `RuntimeFileSystem` returned by
   `fromNodeFs`/`fromMemoryFs` carries one module-private `Symbol`; filtering it by string keys yields `{}` and
   `inProcessTransport` rejects it. Watch is off by default because `fromMemoryFs` has no `watch` at all, so leaving it
   on makes the memory arm take a structurally different freshness path -- and because the `unrelated` source rewrite
   otherwise lands as a watcher event that supersedes the render being timed.
2. **The `unrelated` edit must be written through the filesystem the transport actually bound.** `handle.create()`
   mints a fresh base per client materialisation, so writing to the value returned by `fromMemoryFs(...)` is a silent
   no-op and the step degrades into a second `warm` measurement. `run-arm.mts` captures the created base and asserts
   the edit reads back through it.
3. **The identity tracer must not proxy a Promise.** `await proxy` invokes `then` with the Proxy as receiver and V8
   throws; `identity-tracer.mts` binds `then`/`catch`/`finally` to the target.

Always check `runs[].ok` in the driver's raw JSON before summarising: a broken arm produces a well-formed file with zero
usable children. Compare ratios within a pair, never absolute numbers across runs taken under different load.
