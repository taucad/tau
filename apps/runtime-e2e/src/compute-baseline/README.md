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

## Qualification matrix (audit R5)

The qualification harness measures every Replicad reuse change against reuse off, through the public runtime
client only: no source patching, so kernel or runtime changes cannot silently break it. Program invariant I1
(byte parity with reuse off, whatever the cache history) is its main gate.

| Path                                                        | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness/qualify-corpus.mts`                                | The seven-model matrix (gridfinity-box, stress-test, spur-gearbox, turbofan, bench-vise, six-axis-arm, planetary-gear-system): parameter sets `A`/`B` (pose edits on six-axis-arm and planetary-gear-system), a scrub ladder, a comment-only edit and a one-literal source edit per model; plus the `retained-operand` fixture (booleans on operands the model keeps using, a module-scope shape reused across rebuilds)                                                                                |
| `harness/qualify-arm.mts`                                   | One process = one arm (`off`, `memory`, `durable`) of one scenario: `matrix` (base,A,base,B,base,comment,literal,original on a live document), `scrub` (back-to-back transient frames, the last committed, a revisit, one rested transient frame), `agent` (nine open/act/close calls on one unchanged build), `history` (ten randomized cache histories, each a new client; durable histories share one store), `abort` (an edit supersedes a running build on a worker thread; stop latency recorded) |
| `harness/qualify-runtime.mts`, `harness/qualify-worker.mts` | The runtime definition every arm uses, and its worker-thread entry                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `harness/qualify-driver.mts`                                | Fresh child per model, scenario, arm and pair; arms alternate order per pair; writes raw JSON plus `index.json`                                                                                                                                                                                                                                                                                                                                                                                         |
| `harness/qualify-summarize.mts`                             | Byte parity against off, the history gate, counts, stop latency and timings as median [min–max] (n); `--pins` reports drift, `--writePins` writes a pins file                                                                                                                                                                                                                                                                                                                                           |
| `qualification-baselines.json`                              | Pinned reuse-off GLB hashes per model and step (the I1 reference) and per-arm counts                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `compute-qualification.test.ts`                             | The CI subset: gridfinity-box, six-axis-arm and retained-operand in full, and spur-gearbox's matrix parity as a declared expected failure (the operation adapter breaks I1 on `main`, audit F12) that turns into an ordinary test once the adapter is off                                                                                                                                                                                                                                               |

**What is asserted and what is data.** Counts are deterministic and asserted: `modelRuns` (`replicad.run-main`
spans), `tessellations` (`replicad.render-output` spans) and `storeWrites` (compute publications that settled
`stored`). GLB hashes are asserted. Wall times are recorded as data only, never as CI thresholds. A pinned hash
or count moves only in the change that explains it; it is never regenerated to turn the suite green.

**Arms.** `off` is compute `off` with the Replicad adapter off, the byte-parity reference. `memory` is the library
default. `durable` is a node:sqlite store. `--wasm multi` runs the multi-thread WASM build (Node loads it); its
parity leg compares it with the single-thread pins.

**Plugging in an arm** (fork seam, live tier, mesh memo): add an `--arm` value in `qualify-arm.mts` (and in
`qualify-runtime.mts` when it changes the kernel options), then run the driver with `--arms off,<arm>`. The
summarizer compares every arm with `off` for bytes and reports its counts and timings beside the others. To run
against a local build of the Replicad fork, point the workspace's `replicad` dependency at it before running.

**Identity tracer.** `harness/identity-tracer.mts` advances a receiver's identity on a builder that returns its
receiver and on a mutator that returns nothing (audit F7, `identity-tracer.test.ts`). Nothing in the
qualification matrix uses it; its ceilings remain an analysis aid, not a gate.

```sh
# CI subset (cheap; asserts hashes and counts):
pnpm nx compute-qualify-ci runtime-e2e

# Full program campaign: seven models, every scenario, arms off and memory (history also durable), two pairs:
pnpm nx compute-qualify runtime-e2e
pnpm nx compute-qualify-summarize runtime-e2e -- out/reports/compute-qualify/<stamp>

# One model or scenario, a new arm, or the multi-thread parity leg:
node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-driver.mts \
  --models turbofan --arms off,memory --scenarios matrix,history --pairs 3
node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-driver.mts \
  --arms off --scenarios matrix --wasm multi --out out/reports/compute-qualify/multi
node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-summarize.mts \
  out/reports/compute-qualify/multi --pins apps/runtime-e2e/src/compute-baseline/qualification-baselines.json
```

Measure timings in alternating pairs on a machine whose load you record (the summary prints it); compare arms of
one campaign, never numbers from different windows.

## Lane-B arms (adapter era)

The commands below drive the original W0 harness. Its `bypass`, `memory`, `durable` and `poison` arms patch
`replicad-compute-reuse.ts` and `replicad.kernel.ts` by exact source match through `hook-impl.mjs`; the adapter
has since changed, so `compute-baseline-arms`, `-parity` and `-oracle` fail at load on current `main`. They
qualify the adapter that R2 and R30 switch off and delete; the qualification matrix above replaces them.

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
