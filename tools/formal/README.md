# @taucad/formal

Pinned TLA+, Apalache and Lean toolchains, the formal runner and conformance library. Private; the
rules live in the [formal verification policy](../../docs/policy/formal-verification-policy.md).

## Commands

Run from the workspace root, usually through an owner's Nx target:

| Command                                                 | Nx target        | What it does                                                                                                      |
| ------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `formal setup --tools tlc,lean,apalache [--from <dir>]` | `formal:setup`   | Provisions each tool into `node_modules/.cache/formal`, refusing bytes whose sha256 differs from `toolchain.lock` |
| `formal check --tier pr <projectRoot>`                  | `formal`         | SANY, every pull-request config and log case against `expected.json`, graph and suite staleness                   |
| `formal check --tier lean <projectRoot>`                | `formal:lean`    | Lean build, `sorry` and axiom audit, goldens current                                                              |
| `formal nightly <projectRoot>`                          | `formal:nightly` | Nightly configs and Apalache, fresh-seed Lean differential and simulation, mutant matrices                        |
| `formal logs <project>`                                 | `formal:logs`    | Validates captured `events.jsonl` logs against `ChatLog.tla`                                                      |
| `formal update <projectRoot>`                           |                  | Regenerates graphs, suites, drift manifests, corpus traces and Lean goldens                                       |
| `formal mutants <projectRoot>`                          |                  | Every `mutants.json` entry must be caught; a stale one fails                                                      |
| `formal known [<projectRoot>…]`                         |                  | Lists every expected non-pass verdict                                                                             |

A tool that is absent prints `SKIPPED` and exits 0 locally and 1 under `CI`.

## Library

Owner tests import `@taucad/formal/graph` (spec graphs, covering suites, the backward walk),
`@taucad/formal/replay` (forward replay and replay equality), `@taucad/formal/drift` (drift
manifests and the timer inventory) and `@taucad/formal/capture` (chat-log capture at teardown).
