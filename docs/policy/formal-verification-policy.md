---
title: 'Formal Verification Policy'
description: 'Rules for TLA+ specs, Lean proofs and their TypeScript conformance: spec homes, expected verdicts, the formal runner, trace and log formats, differential tests, pinned toolchains and the drift gate.'
status: active
created: '2026-09-25'
updated: '2026-09-25'
related:
  - docs/research/agent-substrate-formal-methods-blueprint.md
  - docs/research/verified-agent-substrate-charter.md
  - docs/policy/testing-policy.md
  - docs/policy/xstate-policy.md
  - docs/policy/tool-output-location-policy.md
---

# Formal Verification Policy

Internal reference for TLA+ specs, Lean proofs, and the conformance checks that tie them to TypeScript. The tool is `@taucad/formal` in `tools/formal`.

## Rationale

A model is only evidence while it runs against the code it describes. These rules make verdicts data, keep every run bounded and reproducible, and fail a change when code and model move apart. TLA+ describes protocols, Lean core proves pure cores, and conformance tests link both to the machines and logs.

## Rules

### 1. Models Before Code

A change to a cross-process protocol or an owner machine's public alphabet lands in this order: the spec with today's counterexample recorded as a `defect`; the target spec passing; the conformance adapter; then the code.

**Why**: A counterexample found after the code ships is a bug report, not a design check.

### 2. Homes and Names

Specs live in the owner project's `specs/` directory. Modules that `EXTENDS` or `INSTANCE` each other share one directory; an owner with several protocol families uses one subdirectory per family (`specs/turn/`, `specs/checkout/`).

| File                                             | Meaning                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `<Module>.tla`                                   | Hand-written module, named after the protocol                              |
| `<Module>Today.tla`, or `today-*` configurations | The as-built model                                                         |
| `MC_<Module>.tla`                                | A checking instance                                                        |
| `<Module>.<scenario>.cfg`                        | One TLC configuration                                                      |
| `<Module>/`                                      | The model's data: fixtures, traces, generated files, mutants, `drift.json` |
| `expected.json`                                  | One per directory that holds modules                                       |
| `specs/lean/`                                    | Lean files, flat, with `lean-toolchain` and their own `expected.json`      |

Specs are excluded from the `production` input, so a spec edit never rebuilds a dependant.

### 3. Hand-Written Specs

Write specs from rulings and invariants. Extraction from a machine config is for bootstrap or migration evidence only.

**Why**: A spec generated from the code checks the code against itself.

### 4. Every Verdict Is Recorded

Every configuration, Apalache command and log case has an entry in `expected.json` with a tier and an expected verdict. A non-pass verdict names its `kind`:

| Kind      | Meaning                                 | Lifecycle                                             |
| --------- | --------------------------------------- | ----------------------------------------------------- |
| `defect`  | Today's counterexample; names `fixedBy` | Flips when fixed; the fixing change updates the entry |
| `witness` | A knob or seed that must keep failing   | Guards against vacuous properties                     |
| `limit`   | A ruled limit                           | Changes only with a new ruling                        |

A changed verdict fails the run until `expected.json` changes in the same change. A configuration file with no entry fails too.

A violating configuration holds exactly one expected-violated property, because TLC stops at the first violation and leaves the rest unchecked. A passing configuration may hold many.

CORRECT:

```json
{
  "AttachGeneration.reuse.cfg": {
    "tier": "pr",
    "expect": { "violated": "NoReuseOfClosingLauncher" },
    "kind": "witness",
    "ref": "L6 N2"
  },
  "AttachGeneration.fixed.cfg": { "tier": "pr", "expect": "pass" }
}
```

INCORRECT:

```text
\* one violating configuration checking two invariants: the second is never evaluated
INVARIANT NoStaleReleaseAcceptedAtStart NoStaleReleaseDeletesNewEpoch
```

### 5. Liveness Names Its Quiescence

Liveness configurations use no `SYMMETRY`, and fairness applies only to actions of live processes. Every liveness property names a quiescence predicate over its spec's variables. A simulator scenario's `done()` is the conjunction of the predicates of the properties it exercises, and a scenario that ends `no-progress` or `step-cap` with `done()` false fails. Trace templates check the predicate as a postcondition on traces the simulator marks complete.

**Why**: Without the predicate, a wait that no one ever answers looks like a finished run.

### 6. Run Through the Runner, Bounded

Run models only through `formal` Nx targets or `node tools/formal/src/cli.ts`. The runner gives each JVM a 1 GB heap, two workers and a watchdog (300 s in the pull-request tier, 900 s nightly), runs at most two JVMs at once, refuses to start below 3 GiB free disk, puts `-metadir` under `node_modules/.cache/formal/tlc/`, and passes `-noGenerateSpecTE`. Verdicts come from TLC's text, never from its exit code alone; unreadable output is an error, never a pass.

CORRECT:

```bash
pnpm nx run host:formal
```

INCORRECT:

```bash
java -cp tla2tools.jar tlc2.TLC -cleanup AttachGeneration.tla   # -cleanup deletes ./states wholesale
```

| Tier    | Target           | Budget                 | Contents                                                                                |
| ------- | ---------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Node    | `test`           | ≤ 15 s added per owner | Replay, walk, totality, drift, differential against goldens, committed simulator traces |
| Java    | `formal`         | ≤ 3 min per owner      | SANY, pull-request configurations, graph staleness, logs and committed traces           |
| Lean    | `formal:lean`    | ≤ 60 s                 | Build, no `sorry`, axiom allowlist, goldens current                                     |
| Field   | `formal:logs`    | ≤ 3 min                | Every captured `events.jsonl`                                                           |
| Nightly | `formal:nightly` | ≤ 45 min in total      | Liveness, wide scopes, Apalache, fresh seeds, mutant matrices                           |

### 7. Generated Files Are Committed and Checked

Suites, graphs, drift manifests, goldens and generated Lean are committed, canonically sorted and at most 1 MB each. The tier that can regenerate a file fails when the committed copy is stale. Regenerate with `formal update`.

### 8. Trace and Log Fields Are TLC-Readable

Fields a spec reads are strings, booleans or 32-bit integers. Validation reads a sanitized copy: `null` becomes `"null"`, and a number that is not a 32-bit integer becomes a string. Trace lines are flat NDJSON objects written at release points, one per step, carrying `t`, `kind`, the handling machine's `version` and the state the spec cannot infer. A machine step's `kind` is its microstep's `meta.tla`.

**Why**: TLC's JSON reader refuses `null`, reads `0.5` as `0` and wraps 64-bit integers; inspection order is not causal order.

### 9. Lean Uses the Core Only

Lean files import `Init` and `Std` only: no Mathlib, Lake, `sorry` or `native_decide`. Axioms stay within `propext`, `Quot.sound` and `Classical.choice`. A counterexample is a `decide` theorem.

### 10. Differential Tests Compare With Goldens

TypeScript is compared with committed Lean goldens in the Node tier; the Lean tier regenerates them. A known mismatch is `it.fails` naming its defect. Nightly seeds are fresh and printed for replay. Every mutant in `mutants.json` must be caught, and a mutant whose `find` no longer matches fails as stale.

### 11. Pinned Tools, Visible Skips

Every tool is pinned by URL and sha256 in `tools/formal/toolchain.lock`, and `formal setup` refuses other bytes. Tools live under `node_modules/.cache/formal/`, never in `pnpm install`. An absent tool prints `SKIPPED <target>: …; run pnpm nx run formal:setup` and exits 0 locally and 1 when `CI` is set.

### 12. The Drift Gate Forces a Spec Touch

A spec tied to a machine, a seam or a code path has `<Module>/drift.json`: the machine alphabet, each machine's `version`, table and source hashes, each transition's `meta.tla`, and the spec hashes. The owner's Node-tier test fails when the manifest is stale or when a transition names an action the spec does not define. `formal update` refuses to rewrite a manifest whose alphabet, tables, sources or actions moved while no spec file did, or whose alphabet moved while no machine's `version` did.

### 13. Outputs Stay Out of the Root

Scratch and toolchains go under `node_modules/.cache/formal/`, reports under `out/reports/formal/<projectRoot>/`, captured logs under `out/test-results/chat-logs/<project>/` and simulator traces under `out/test-results/seam-traces/<project>/`.

## Anti-Patterns

- A spec generated from a machine config.
- A property checked only in a configuration that violates another property.
- `native_decide`, `sorry`, or a Lean import beyond `Init` and `Std`.
- `getSimplePaths` on a dense region, `toDirectedGraph`, or random simulation as the source of implementation paths; use shortest paths.
- Trace order taken from inspection time rather than release points.
- A gate that parsed nothing and passed.

## Summary Checklist

- [ ] The spec landed before the code, with today's counterexample recorded
- [ ] Every configuration has an `expected.json` entry with a tier, and every non-pass entry a `kind`
- [ ] Each violating configuration checks exactly one property
- [ ] Liveness properties name their quiescence predicate
- [ ] Generated files are regenerated and committed
- [ ] `drift.json` is current and the spec was touched with the alphabet
- [ ] `pnpm nx run <project>:formal` passes locally or reports `SKIPPED`

## References

- Research: `docs/research/agent-substrate-formal-methods-blueprint.md`
- Related: `docs/policy/testing-policy.md`, `docs/policy/xstate-policy.md`, `docs/policy/tool-output-location-policy.md`
