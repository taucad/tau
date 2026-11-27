# @taucad/formal

Pinned TLA+, Apalache and Lean toolchains, the formal runner and conformance library. Private; the
rules live in the [formal verification policy](../../docs/policy/formal-verification-policy.md).

## Commands

Run from the workspace root, usually through an owner's Nx target:

| Command                                                                          | Nx target                | What it does                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formal setup --tools tlc,lean,apalache [--from <dir>]`                          | `formal:setup`           | Provisions each tool into `node_modules/.cache/formal`, refusing bytes whose sha256 differs from `toolchain.lock`                                                                              |
| `formal check --tier pr <projectRoot>`                                           | `formal:tla`             | SANY, every pull-request config and log case against `expected.json`, graph and suite staleness                                                                                                |
| `formal check --tier pr --family <family> <projectRoot>`                         | `formal:tla:<family>`    | The same for one family, the spec directory `specs/<family>/`; its summary goes under `pr/<family>/`                                                                                           |
| `formal check --tier lean <projectRoot>`                                         | `formal:lean`            | Lean build, `sorry` and axiom audit, goldens current                                                                                                                                           |
| `formal nightly [--without-check] [--without-mutants] <projectRoot>`             | `formal:nightly`         | Nightly configs and Apalache (not with `--without-check`), fresh-seed Lean differential and simulation, mutants (not with `--without-mutants`)                                                 |
| `formal nightly --mutants-only [--shard <k>/<n>] <projectRoot>`                  | `formal:nightly:mutants` | The same-seed simulation and the mutants alone; with `--shard`, one shard's mutants and their controls, dealt by `mutant-seconds.json`                                                         |
| `formal check --tier nightly <projectRoot>`                                      | `formal:nightly:check`   | The nightly configs and Apalache alone, for an owner that runs them in a job apart from `formal:nightly`                                                                                       |
| `formal check --tier nightly --shard <k>/<n> <projectRoot>`                      | `formal:nightly:check`   | Shard `k` of `n`: every run of the tier dealt by the measured seconds in `run-seconds.json`, longest first; together the shards run each run once                                              |
| `formal logs <project>`                                                          | `formal:logs`            | Validates captured `events.jsonl` logs against `ChatLog.tla`                                                                                                                                   |
| `formal update <projectRoot>`                                                    |                          | Regenerates graphs, suites, drift manifests, corpus traces and Lean goldens                                                                                                                    |
| `formal mutants [--shard <k>/<n>] <projectRoot>`                                 |                          | Every `mutants.json` entry must be caught; a stale one fails                                                                                                                                   |
| `formal known [<projectRoot>…]`                                                  |                          | Lists every expected non-pass verdict                                                                                                                                                          |
| `formal review-notes [--slug <slug>] [--date <yyyy-mm-dd>] <path/to/Module.tla>` |                          | Moves the notes above `EXTENDS` and the manifest's `sources` pins into a new `<Module>/reviews/<date>-<slug>.md`; skips notes a review holds, so it re-runs and converts a late old-format pin |

A tool that is absent prints `SKIPPED` and exits 0 locally and 1 under `CI`.

`tools/formal.plugin.ts` infers `formal:tla` for every project whose `specs/` holds a directory with a
`*.tla` file beside an `expected.json` without a `lean` section, and `formal:lean` for one with a
`lean-toolchain` file beside an `expected.json` with it. An `expected.json` without its marker, and
specs under a `fixtures` directory, are ignored. An owner adds `"formal:nightly": {}` or
`"formal:logs": {}` to its `project.json` to join those runs. Every tier's command, inputs, outputs
and cache setting live in `nx.json` `targetDefaults`, except the family targets'.

When every TLA+ directory of a project is a family below `specs/` (`apps/ui/specs/record-sync/`), the
plugin gives each family its own `formal:tla:<family>` target, with its command, inputs and outputs
narrowed to the family, and makes `formal:tla` an `nx:noop` that depends on every family. CI deals
the family targets to its parallel formal shards, so each family is held to the Java tier's 3 minutes
on its own (formal verification policy § 6). A project with a TLA+ spec at `specs/` itself keeps one
`formal:tla`.

`formal:nightly:check` is cached: its configs and Apalache commands read no seed, so its inputs (the
specs, the project's `src/**/*.json`, the runner, the lock, `run-seconds.json` and the toolchain id)
decide the verdict. `formal-nightly.yml` runs it as four `--shard` jobs, each with the runner's two
JVMs; `run-seconds.json` holds each run's measured seconds (agent-host's from CI job 134332529778,
api-billing's from CI job 140275188452, with `target-three-attempts` at its 900 s watchdog so it holds a shard alone),
and a run it does not list weighs its `defaultSeconds`. Re-measure it when a long config is added.

## Library

Owner tests import `@taucad/formal/graph` (spec graphs, covering suites, the backward walk),
`@taucad/formal/replay` (forward replay and replay equality), `@taucad/formal/drift` (drift
manifests, reviewed sources and the timer inventory) and `@taucad/formal/capture` (chat-log capture at teardown).

An owner test passes `reviewed: hashFiles(workspace, [...])` beside the manifest's parts. Those
sources are not written to `drift.json`: each passes while some
`<Module>/reviews/<yyyy-mm-dd>-<slug>.md` records its current hash in a `sha256` block
(`<sha256>  <path>` lines) beside a note, so each change adds its own file and two changes to
different sources merge without conflict. A failure prints the file to add and its block. Under
`FORMAL_UPDATE=1` the one review whose block is empty is filled with the unacknowledged hashes; no
review is written otherwise. A manifest that still pins `sources` keeps working until
`formal review-notes` moves them and its test passes `reviewed` instead.
