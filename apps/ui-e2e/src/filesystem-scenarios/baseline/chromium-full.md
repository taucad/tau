# Filesystem scenarios at ffaf44beff71 (full profile)

Recorded 2026-11-05T01:57:40.312Z; 1 run(s) per scenario, p75. Count gates marked "red (known)" are listed in known-red.json.

Fixture: full (seed 25, scale 1, 2000 files, 500 MiB, 200 revisions)
Browser: chromium 153.0.0.0
Server: none: local OPFS only (server-backed rows are pending)
Network: none: no request leaves the page (unthrottled)
Storage: OPFS in a persistent (disk-backed) browser profile

| ID  | Scenario                            | Status   | Time (p75)                                  | Target                                        | Count gates (value / limit)                                                                                                  | Samples |
| --- | ----------------------------------- | -------- | ------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1  | Cold open: tree visible             | pending  | —                                           | duration ≤ 3000 ms                            | declared S1.blob-reads — / 0; declared S1.whole-packs — / 0; declared S1.upload-pack — / 0                                   | 0       |
| S2  | Cold open: entry model rendered     | pending  | —                                           | duration ≤ 5000 ms                            | declared S2.objects — / 0; declared S2.lfs-batches — / 0                                                                     | 0       |
| S3  | Cold open: all text materialised    | measured | duration 28799 ms                           | duration ≤ 15000 ms                           | red (known) S3.lock-sets 2 / 1; red (known) S3.events 4000 / 1; green S3.writes 2000 / 2000; red (known) S3.renames 2000 / 0 | 1       |
| S4  | Cold open: LFS fill                 | pending  | —                                           | duration ≤ ∞ ms                               | declared S4.downloads — / 1; declared S4.writes — / 1; declared S4.hashes — / 1; declared S4.read-back — / 1                 | 0       |
| S5  | Warm open to render                 | measured | duration 9202 ms                            | duration ≤ 2000 ms                            | green S5.network 0 / 0; red (known) S5.blob-reads 106522886 / 0; red (known) S5.compares 2001 / 1                            | 1       |
| S6  | Import 500 MB                       | measured | duration 14563 ms                           | duration ≤ 20000 ms                           | green S6.durable-writes 1.00 / 1.01; green S6.hash-passes 0 / 1                                                              | 1       |
| S7  | Save one 1 MB text file             | measured | duration 14 ms                              | duration ≤ 100 ms                             | green S7.changesets 1 / 1; green S7.events 1 / 1; green S7.copies 0 / 0                                                      | 1       |
| S8  | Agent turn writing 50 files         | measured | duration 253 ms                             | duration ≤ 500 ms                             | red (known) S8.changesets 50 / 1; red (known) S8.watch 50 / 1                                                                | 1       |
| S9  | Push after one edit                 | pending  | —                                           | duration ≤ 3000 ms                            | declared S9.unchanged-blobs — / 0; declared S9.lfs-batch — / 0; declared S9.info-refs — / 1                                  | 0       |
| S10 | Pull a one-file remote change       | pending  | —                                           | duration ≤ 2000 ms                            | declared S10.files — / 1; declared S10.captures — / 0                                                                        | 0       |
| S11 | Revision compare / switch           | pending  | —                                           | duration ≤ 1000 ms                            | declared S11.objects — / 0                                                                                                   | 0       |
| S12 | Agent grep / glob over the project  | measured | grepDuration 14407 ms; globDuration 5466 ms | grepDuration ≤ 2000 ms; globDuration ≤ 200 ms | red (known) S12.binary-bytes 471859200 / 0; red (known) S12.walks 2680 / 0                                                   | 1       |
| S13 | LSP module resolution, 3,000 probes | measured | duration 2642 ms                            | duration ≤ 300 ms                             | red (known) S13.metadata-bytes 18438032 / 0                                                                                  | 1       |
| S14 | Export 500 MB project zip           | pending  | —                                           | duration ≤ ∞ ms                               | —                                                                                                                            | 0       |
| S15 | Desktop cold open / save            | pending  | —                                           | duration ≤ 30000 ms                           | —                                                                                                                            | 0       |
| S16 | Second tab during S3                | measured | readP95 7.60 ms                             | readP95 ≤ 200 ms                              | red (known) S16.invalidations 4000 / 1                                                                                       | 1       |
| S17 | Save during S3                      | measured | saveLatency 8562 ms                         | saveLatency ≤ 250 ms                          | red (known) S17.lock-wait 8550 / 50                                                                                          | 1       |
| S18 | Agent turn during S4                | pending  | —                                           | duration ≤ 600 ms                             | declared S18.fill-waits — / 0                                                                                                | 0       |
| S19 | Grep while saving and reading       | measured | saveLatency 25 ms; readP95 17 ms            | saveLatency ≤ 100 ms; readP95 ≤ 200 ms        | red (known) S19.compute-worker 2002 / 0                                                                                      | 1       |
| S20 | Two tabs cold-open one project      | pending  | —                                           | duration ≤ 3000 ms                            | declared S20.downloads — / 1                                                                                                 | 0       |

## I1 writer probe

| Engine   | Writer         | Killed at | Result  | Residue |
| -------- | -------------- | --------- | ------- | ------- |
| chromium | writable       | mid-write | old     | —       |
| chromium | writable-close | closing   | new     | —       |
| chromium | sync-handle    | mid-write | partial | —       |
