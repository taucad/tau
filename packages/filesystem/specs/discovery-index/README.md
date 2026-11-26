# Discovery index: evidence, reads and the audit

`DiscoveryIndex.tla` models the protocol inside one step of `LibraryCatalog`: how evidence about one project directory reaches the filesystem authority's discovery index, and when a read of the directory may install what it read as clean. It is the spec for `packages/filesystem/src/project-directory-index.ts` (project-library fast-path blueprint FW2) and lands before it, under formal verification policy rule 1. The contract it checks is the one `project-library-index-contract-review.md` approved with amendments A2, A4 and A6.

## Parties and abstraction

| Party     | Model                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage   | `disk[d]`: what a read of directory `d`'s `tau.json` and `.tau/project.json` determines, from `Values`                                                                                                                                                                                                                                                                          |
| Others    | The environment. `Change(d)` changes a directory and, once the channels are armed, sends a fact; `ChangeLost(d)` sends none (a tab that died between its write and its notice, an observer that stopped), at most `MaxLost` times                                                                                                                                               |
| Transit   | Facts sent and not yet applied, a set: `Deliver(d)` applies them in any order, and up to `MaxRepeats` times leaves one to be applied again                                                                                                                                                                                                                                      |
| Authority | `Arm` puts the root's observer, the notice subscription and the poll baseline in place. `ReadStart(d)` reads a dirty directory (a pass, a probe, an operation's own check), `Audit(d)` a clean one that no evidence asked for, `ReadEnd(d)` installs. `WriteIssued`, `WriteLanded` and `WriteSettled` are the authority's own write through the provider the registry hands out |
| Index     | `idx[d]`, a value or unknown; `ver[d]`, the evidence counter; `dirty`. A ghost, `lost`, holds the directories whose last change sent no fact and that no read has repaired                                                                                                                                                                                                      |

A reader takes the counter when it starts and installs what it read as clean only if the counter has not moved and no write of its own is in flight on the directory. A read captures the disk's value when it starts; a change during the read moves the counter once its fact is applied, and is exempt from `CleanIsCurrent` while it is in transit. A read that fails with anything but not-found installs nothing, which is the same as a read whose counter moved, so it is not a separate action.

**Abstracted away.** Timestamps, the poll period, the freshness window and the audit interval: the model is untimed. The racy-timestamp guard is checked by the differential test's 2 s granularity fixture instead. The root's child names (`namesListed`) follow the same rule as a directory and are not modelled separately.

## Properties

| Property            | Kind      | Statement                                                                                                                                                                                                                   |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CleanIsCurrent`    | invariant | S12, first half. A directory that is not dirty, not being read, has no fact in transit and whose last change was not lost holds in the index what storage holds                                                             |
| `EventuallyCurrent` | liveness  | S12, second half. Under weak fairness of arming, delivery, the reads, the audit and an own write's completion, once the bounded environment is quiet the index holds storage, a lost fact included. Quiescence: `Quiescent` |

## Knobs and configurations

| Knob        | Target      | Witness value   | Rule it checks                                                                                |
| ----------- | ----------- | --------------- | --------------------------------------------------------------------------------------------- |
| `ClearRule` | `versioned` | `unconditional` | A2(f): a read never clears a fact that arrived while it ran (review F5)                       |
| `ArmOrder`  | `arm-first` | `read-first`    | A2(e), A3: the channels and the poll baseline are in place before the first read (F4)         |
| `TapOrder`  | `before`    | `after`         | A2(a): own writes are tapped at the provider before they are issued and when they settle (F2) |
| `AuditOn`   | `TRUE`      | `FALSE`         | A4: the audit repairs a lost fact (F3)                                                        |

| Configuration         | Tier | Verdict                       | Purpose                                                                                    |
| --------------------- | ---- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `target`              | pr   | pass                          | 2 directories, 2 changes, 1 own write, 1 repeated fact, no lost fact                       |
| `target-lost`         | pr   | pass                          | One lost fact with the audit on: `CleanIsCurrent` and `EventuallyCurrent` under `LiveSpec` |
| `clear-unconditional` | pr   | `CleanIsCurrent` (witness)    | A read that clears unconditionally loses the fact that arrived while it ran                |
| `read-before-arm`     | pr   | `CleanIsCurrent` (witness)    | A first read before arming misses a change made between them                               |
| `tap-after-write`     | pr   | `CleanIsCurrent` (witness)    | An own write heard only when it settles leaves its directory clean over changed bytes      |
| `no-audit`            | pr   | `EventuallyCurrent` (witness) | A lost fact with no audit is never repaired                                                |

Every configuration runs in this family's target, `filesystem:formal:tla:discovery-index`, in about 20 s.

## Conformance and drift

`project-directory-index.differential.test.ts` is the conformance adapter: it replays generated evidence schedules (facts dropped, delayed, reordered and repeated, own writes and reads interleaved, on a 2 s timestamp fixture) against `ProjectDirectoryIndex` and a real provider, and checks `CleanIsCurrent` after every step. `DiscoveryIndex/drift.json` hashes this module, its configurations, `expected.json` and `project-directory-index.ts`; `project-directory-index.drift.test.ts` fails when any of them moves without the manifest. Re-pin with `FORMAL_UPDATE=1 npx vitest run src/project-directory-index.drift.test.ts` from `packages/filesystem`, after a dated note below.

## Running

```bash
pnpm nx run filesystem:formal:tla:discovery-index
```

## Review log

- FW2 (2026-11-26): first version, with the target and the four witnesses the index-contract review names; checked locally with TLC (`tla2tools` 2026.10.02) before the code.
- FW2 acceptance tests (2026-11-26): `project-directory-index.ts` bounds `dirty` by the entries a root holds whether or not its names are listed (A5); the protocol and every verdict are unchanged. The differential test's schedules were lengthened after two mutants of the install rule (an unconditional install, an install while an own write is in flight) passed the shorter ones; both now fail it.
- D5 boundary (2026-11-26): the index keeps an opaque reading and looks only at its `kind`; the reading types and their manifest vocabulary move back to `project-directories.ts`, as the layer-1 import boundary requires. Types only: every action and verdict is unchanged.
