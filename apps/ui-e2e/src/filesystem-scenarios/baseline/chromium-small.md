# Filesystem scenarios at 21f0a09ef6f5 (small profile)

Recorded 2026-11-05T02:29:19.067Z; 3 run(s) per scenario, p75. Count gates marked "red (known)" are listed in known-red.json.

Fixture: small (seed 25, scale 0.05, 100 files, 25 MiB, 200 revisions)
Browser: chromium 153.0.0.0
Server: none: local OPFS only (server-backed rows are pending)
Network: none: no request leaves the page (unthrottled)
Storage: OPFS in a persistent (disk-backed) browser profile

| ID  | Scenario                            | Status   | Time (p75)                               | Target                                        | Count gates (value / limit)                                                                                              | Samples |
| --- | ----------------------------------- | -------- | ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| S1  | Cold open: tree visible             | pending  | —                                        | duration ≤ 3000 ms                            | declared S1.blob-reads — / 0; declared S1.whole-packs — / 0; declared S1.upload-pack — / 0                               | 0       |
| S2  | Cold open: entry model rendered     | pending  | —                                        | duration ≤ 5000 ms                            | declared S2.objects — / 0; declared S2.lfs-batches — / 0                                                                 | 0       |
| S3  | Cold open: all text materialised    | measured | duration 1876 ms                         | duration ≤ 15000 ms                           | red (known) S3.lock-sets 2 / 1; red (known) S3.events 200 / 1; green S3.writes 100 / 100; red (known) S3.renames 100 / 0 | 3       |
| S4  | Cold open: LFS fill                 | pending  | —                                        | duration ≤ ∞ ms                               | declared S4.downloads — / 1; declared S4.writes — / 1; declared S4.hashes — / 1; declared S4.read-back — / 1             | 0       |
| S5  | Warm open to render                 | measured | duration 547 ms                          | duration ≤ 2000 ms                            | green (vacuous) S5.network 0 / 0; red (known) S5.blob-reads 5326234 / 0; declared (model-bound) S5.compares 101 / 1      | 3       |
| S6  | Import 500 MB                       | measured | duration 633 ms                          | duration ≤ 20000 ms                           | green S6.durable-writes 1.00 / 1.01; red (known) S6.hash-passes 0 / 1                                                    | 3       |
| S7  | Save one 1 MB text file             | measured | duration 11 ms                           | duration ≤ 100 ms                             | green S7.changesets 1 / 1; green S7.events 1 / 1; green S7.copies 0 / 0                                                  | 3       |
| S8  | Agent turn writing 50 files         | measured | duration 272 ms                          | duration ≤ 500 ms                             | red (known) S8.changesets 50 / 1; red (known) S8.watch 50 / 1                                                            | 3       |
| S9  | Push after one edit                 | pending  | —                                        | duration ≤ 3000 ms                            | declared S9.unchanged-blobs — / 0; declared S9.lfs-batch — / 0; declared S9.info-refs — / 1                              | 0       |
| S10 | Pull a one-file remote change       | pending  | —                                        | duration ≤ 2000 ms                            | declared S10.files — / 1; declared S10.captures — / 0                                                                    | 0       |
| S11 | Revision compare / switch           | pending  | —                                        | duration ≤ 1000 ms                            | declared S11.objects — / 0                                                                                               | 0       |
| S12 | Agent grep / glob over the project  | measured | grepDuration 540 ms; globDuration 410 ms | grepDuration ≤ 2000 ms; globDuration ≤ 200 ms | red (known) S12.binary-bytes 23592960 / 0; red (known) S12.walks 320 / 0                                                 | 3       |
| S13 | LSP module resolution, 3,000 probes | measured | duration 2427 ms                         | duration ≤ 300 ms                             | red (known) S13.metadata-bytes 10096967 / 0                                                                              | 3       |
| S14 | Export 500 MB project zip           | pending  | —                                        | duration ≤ ∞ ms                               | —                                                                                                                        | 0       |
| S15 | Desktop cold open / save            | pending  | —                                        | duration ≤ 30000 ms                           | —                                                                                                                        | 0       |
| S16 | Second tab during S3                | measured | readP95 13 ms                            | readP95 ≤ 200 ms                              | red (known) S16.invalidations 200 / 1                                                                                    | 3       |
| S17 | Save during S3                      | measured | saveLatency 492 ms                       | saveLatency ≤ 250 ms                          | red (known) S17.lock-wait 99 / 8                                                                                         | 3       |
| S18 | Agent turn during S4                | pending  | —                                        | duration ≤ 600 ms                             | declared S18.fill-waits — / 0                                                                                            | 0       |
| S19 | Grep while saving and reading       | measured | saveLatency 34 ms; readP95 27 ms         | saveLatency ≤ 100 ms; readP95 ≤ 200 ms        | declared (model-bound) S19.compute-worker 102 / 0                                                                        | 3       |
| S20 | Two tabs cold-open one project      | pending  | —                                        | duration ≤ 3000 ms                            | declared S20.downloads — / 1                                                                                             | 0       |

## I1 writer probe

| Engine   | Writer         | Killed at | Result  | Residue |
| -------- | -------------- | --------- | ------- | ------- |
| chromium | writable       | mid-write | old     | —       |
| chromium | writable-close | closing   | new     | —       |
| chromium | sync-handle    | mid-write | partial | —       |
