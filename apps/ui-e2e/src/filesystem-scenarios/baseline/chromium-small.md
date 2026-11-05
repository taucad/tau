# Filesystem scenarios at 714737f278fb (small profile)

Recorded 2026-11-05T03:58:19.461Z; 3 run(s) per scenario, p75. Count gates marked "red (known)" are listed in known-red.json.

Fixture: small (seed 25, scale 0.05, 100 files, 25 MiB, 200 revisions)
Browser: chromium 153.0.0.0
Server: none: local OPFS only (server-backed rows are pending)
Network: none: no request leaves the page (unthrottled)
Storage: OPFS in a persistent (disk-backed) browser profile

| ID  | Scenario                            | Status   | Time (p75)                               | Target                                        | Count gates (value / limit)                                                                                                   | Samples |
| --- | ----------------------------------- | -------- | ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1  | Cold open: tree visible             | pending  | —                                        | duration ≤ 3000 ms                            | declared S1.blob-reads — / 0; declared S1.whole-packs — / 0; declared S1.upload-pack — / 0                                    | 0       |
| S2  | Cold open: entry model rendered     | pending  | —                                        | duration ≤ 5000 ms                            | declared S2.objects — / 0; declared S2.lfs-batches — / 0                                                                      | 0       |
| S3  | Cold open: all text materialised    | measured | duration 661 ms                          | duration ≤ 15000 ms                           | green S3.changesets 1 / 1; green S3.lock-sets 1 / 1; green S3.events 1 / 1; green S3.writes 100 / 100; green S3.renames 0 / 0 | 3       |
| S4  | Cold open: LFS fill                 | pending  | —                                        | duration ≤ ∞ ms                               | declared S4.downloads — / 1; declared S4.writes — / 1; declared S4.hashes — / 1; declared S4.read-back — / 1                  | 0       |
| S5  | Warm open to render                 | measured | duration 490 ms                          | duration ≤ 2000 ms                            | green (vacuous) S5.network 0 / 0; red (known) S5.blob-reads 5326234 / 0; declared (model-bound) S5.compares 101 / 1           | 3       |
| S6  | Import 500 MB                       | measured | duration 246 ms                          | duration ≤ 20000 ms                           | green S6.durable-writes 1.00 / 1.01; red (known) S6.hash-passes 0 / 1                                                         | 3       |
| S7  | Save one 1 MB text file             | measured | duration 17 ms                           | duration ≤ 100 ms                             | green S7.changesets 1 / 1; green S7.events 1 / 1; green S7.copies 0 / 0                                                       | 3       |
| S8  | Agent turn writing 50 files         | measured | duration 90 ms                           | duration ≤ 500 ms                             | green S8.changesets 1 / 1; red (known) S8.watch 50 / 1                                                                        | 3       |
| S9  | Push after one edit                 | pending  | —                                        | duration ≤ 3000 ms                            | declared S9.unchanged-blobs — / 0; declared S9.lfs-batch — / 0; declared S9.info-refs — / 1                                   | 0       |
| S10 | Pull a one-file remote change       | pending  | —                                        | duration ≤ 2000 ms                            | declared S10.files — / 1; declared S10.captures — / 0                                                                         | 0       |
| S11 | Revision compare / switch           | pending  | —                                        | duration ≤ 1000 ms                            | declared S11.objects — / 0                                                                                                    | 0       |
| S12 | Agent grep / glob over the project  | measured | grepDuration 588 ms; globDuration 478 ms | grepDuration ≤ 2000 ms; globDuration ≤ 200 ms | red (known) S12.binary-bytes 23592960 / 0; red (known) S12.walks 320 / 0                                                      | 3       |
| S13 | LSP module resolution, 3,000 probes | measured | duration 2418 ms                         | duration ≤ 300 ms                             | red (known) S13.metadata-bytes 10096967 / 0                                                                                   | 3       |
| S14 | Export 500 MB project zip           | pending  | —                                        | duration ≤ ∞ ms                               | —                                                                                                                             | 0       |
| S15 | Desktop cold open / save            | pending  | —                                        | duration ≤ 30000 ms                           | —                                                                                                                             | 0       |
| S16 | Second tab during S3                | measured | readP95 31 ms                            | readP95 ≤ 200 ms                              | green S16.invalidations 1 / 1                                                                                                 | 3       |
| S17 | Save during S3                      | measured | saveLatency 47 ms                        | saveLatency ≤ 250 ms                          | green S17.lock-wait 5 / 8                                                                                                     | 3       |
| S18 | Agent turn during S4                | pending  | —                                        | duration ≤ 600 ms                             | declared S18.fill-waits — / 0                                                                                                 | 0       |
| S19 | Grep while saving and reading       | measured | saveLatency 22 ms; readP95 37 ms         | saveLatency ≤ 100 ms; readP95 ≤ 200 ms        | declared (model-bound) S19.compute-worker 102 / 0                                                                             | 3       |
| S20 | Two tabs cold-open one project      | pending  | —                                        | duration ≤ 3000 ms                            | declared S20.downloads — / 1                                                                                                  | 0       |

## I1 writer probe

| Engine   | Writer                                         | Killed at            | Result                               | Residue |
| -------- | ---------------------------------------------- | -------------------- | ------------------------------------ | ------- |
| chromium | writable                                       | mid-write            | old                                  | —       |
| chromium | writable-close                                 | closing              | new                                  | —       |
| chromium | sync-handle                                    | mid-write            | partial                              | —       |
| chromium | applyTree replace (stage, move aside, publish) | 9 of 192 mutations   | old 48, new 0, missing 0, partial 0  | —       |
| chromium | applyTree replace (stage, move aside, publish) | 38 of 192 mutations  | old 48, new 0, missing 0, partial 0  | —       |
| chromium | applyTree replace (stage, move aside, publish) | 67 of 192 mutations  | old 48, new 0, missing 0, partial 0  | —       |
| chromium | applyTree replace (stage, move aside, publish) | 96 of 192 mutations  | old 48, new 0, missing 0, partial 0  | —       |
| chromium | applyTree replace (stage, move aside, publish) | 124 of 192 mutations | old 18, new 30, missing 0, partial 0 | —       |
| chromium | applyTree replace (stage, move aside, publish) | 153 of 192 mutations | old 0, new 48, missing 0, partial 0  | —       |
| chromium | applyTree replace (stage, move aside, publish) | 182 of 192 mutations | old 0, new 48, missing 0, partial 0  | —       |
