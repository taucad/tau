# @taucad/formal

Pinned TLA+, Apalache and Lean toolchains, the formal runner and conformance library. Private; the
rules live in the [formal verification policy](../../docs/policy/formal-verification-policy.md).

## Commands

Run from the workspace root, usually through an owner's Nx target:

| Command                                                  | Nx target              | What it does                                                                                                      |
| -------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `formal setup --tools tlc,lean,apalache [--from <dir>]`  | `formal:setup`         | Provisions each tool into `node_modules/.cache/formal`, refusing bytes whose sha256 differs from `toolchain.lock` |
| `formal check --tier pr <projectRoot>`                   | `formal:tla`           | SANY, every pull-request config and log case against `expected.json`, graph and suite staleness                   |
| `formal check --tier pr --family <family> <projectRoot>` | `formal:tla:<family>`  | The same for one family, the spec directory `specs/<family>/`; its summary goes under `pr/<family>/`              |
| `formal check --tier lean <projectRoot>`                 | `formal:lean`          | Lean build, `sorry` and axiom audit, goldens current                                                              |
| `formal nightly [--without-check] <projectRoot>`         | `formal:nightly`       | Nightly configs and Apalache (not with `--without-check`), fresh-seed Lean differential and simulation, mutants   |
| `formal check --tier nightly <projectRoot>`              | `formal:nightly:check` | The nightly configs and Apalache alone, for an owner that runs them in a job apart from `formal:nightly`          |
| `formal logs <project>`                                  | `formal:logs`          | Validates captured `events.jsonl` logs against `ChatLog.tla`                                                      |
| `formal update <projectRoot>`                            |                        | Regenerates graphs, suites, drift manifests, corpus traces and Lean goldens                                       |
| `formal mutants <projectRoot>`                           |                        | Every `mutants.json` entry must be caught; a stale one fails                                                      |
| `formal known [<projectRoot>…]`                          |                        | Lists every expected non-pass verdict                                                                             |

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

## Library

Owner tests import `@taucad/formal/graph` (spec graphs, covering suites, the backward walk),
`@taucad/formal/replay` (forward replay and replay equality), `@taucad/formal/drift` (drift
manifests and the timer inventory) and `@taucad/formal/capture` (chat-log capture at teardown).
