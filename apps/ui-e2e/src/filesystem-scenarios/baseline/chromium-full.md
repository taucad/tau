# Filesystem scenarios at 4d8dced4294a (full profile)

Recorded 2026-11-05T11:06:24.211Z; 1 run(s) per scenario, p75. Count gates marked "red (known)" are listed in known-red.json.

Fixture: full (seed 25, scale 1, 2000 files, 500 MiB, 200 revisions)
Browser: chromium 153.0.0.0
Server: none: local OPFS only (server-backed rows are pending)
Network: none: no request leaves the page (unthrottled)
Storage: OPFS in a persistent (disk-backed) browser profile

| ID  | Scenario                            | Status   | Time (p75)                                 | Target                                        | Count gates (value / limit)                                                                                                     | Samples |
| --- | ----------------------------------- | -------- | ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1  | Cold open: tree visible             | pending  | —                                          | duration ≤ 3000 ms                            | declared S1.blob-reads — / 0; declared S1.whole-packs — / 0; declared S1.upload-pack — / 0                                      | 0       |
| S2  | Cold open: entry model rendered     | pending  | —                                          | duration ≤ 5000 ms                            | declared S2.objects — / 0; declared S2.lfs-batches — / 0                                                                        | 0       |
| S3  | Cold open: all text materialised    | measured | duration 11607 ms                          | duration ≤ 15000 ms                           | green S3.changesets 8 / 8; green S3.lock-sets 8 / 8; green S3.events 8 / 8; green S3.writes 2000 / 2000; green S3.renames 0 / 0 | 1       |
| S4  | Cold open: LFS fill                 | pending  | —                                          | duration ≤ ∞ ms                               | declared S4.downloads — / 1; declared S4.writes — / 1; declared S4.hashes — / 1; declared S4.read-back — / 1                    | 0       |
| S5  | Warm open to render                 | measured | duration 10236 ms                          | duration ≤ 2000 ms                            | green (vacuous) S5.network 0 / 0; red (known) S5.blob-reads 106522886 / 0; declared (model-bound) S5.compares 2001 / 1          | 1       |
| S6  | Import 500 MB                       | measured | duration 7285 ms                           | duration ≤ 20000 ms                           | green S6.durable-writes 1.00 / 1.01; red (known) S6.hash-passes 0 / 1                                                           | 1       |
| S7  | Save one 1 MB text file             | measured | duration 17 ms                             | duration ≤ 100 ms                             | green S7.changesets 1 / 1; green S7.events 1 / 1; green S7.copies 0 / 0                                                         | 1       |
| S8  | Agent turn writing 50 files         | measured | duration 102 ms                            | duration ≤ 500 ms                             | green S8.changesets 1 / 1; red (known) S8.watch 50 / 1                                                                          | 1       |
| S9  | Push after one edit                 | pending  | —                                          | duration ≤ 3000 ms                            | declared S9.unchanged-blobs — / 0; declared S9.lfs-batch — / 0; declared S9.info-refs — / 1                                     | 0       |
| S10 | Pull a one-file remote change       | pending  | —                                          | duration ≤ 2000 ms                            | declared S10.files — / 1; declared S10.captures — / 0                                                                           | 0       |
| S11 | Revision compare / switch           | pending  | —                                          | duration ≤ 1000 ms                            | declared S11.objects — / 0                                                                                                      | 0       |
| S12 | Agent grep / glob over the project  | measured | grepDuration 7991 ms; globDuration 5396 ms | grepDuration ≤ 2000 ms; globDuration ≤ 200 ms | red (known) S12.binary-bytes 471859200 / 0; red (known) S12.walks 2680 / 0                                                      | 1       |
| S13 | LSP module resolution, 3,000 probes | measured | duration 2675 ms                           | duration ≤ 300 ms                             | red (known) S13.metadata-bytes 18438032 / 0                                                                                     | 1       |
| S14 | Export 500 MB project zip           | pending  | —                                          | duration ≤ ∞ ms                               | —                                                                                                                               | 0       |
| S15 | Desktop cold open / save            | pending  | —                                          | duration ≤ 30000 ms                           | —                                                                                                                               | 0       |
| S16 | Second tab during S3                | measured | readP95 26 ms                              | readP95 ≤ 200 ms                              | green S16.invalidations 8 / 8                                                                                                   | 1       |
| S17 | Save during S3                      | measured | saveLatency 49 ms                          | saveLatency ≤ 250 ms                          | green S17.lock-wait 1 / 8                                                                                                       | 1       |
| S18 | Agent turn during S4                | pending  | —                                          | duration ≤ 600 ms                             | declared S18.fill-waits — / 0                                                                                                   | 0       |
| S19 | Grep while saving and reading       | measured | saveLatency 32 ms; readP95 24 ms           | saveLatency ≤ 100 ms; readP95 ≤ 200 ms        | declared (model-bound) S19.compute-worker 2002 / 0                                                                              | 1       |
| S20 | Two tabs cold-open one project      | pending  | —                                          | duration ≤ 3000 ms                            | declared S20.downloads — / 1                                                                                                    | 0       |

## I1 writer probe

| Engine   | Writer                                             | Killed at            | Result                               | Residue                         |
| -------- | -------------------------------------------------- | -------------------- | ------------------------------------ | ------------------------------- |
| chromium | writable                                           | mid-write            | old                                  | —                               |
| chromium | writable-close                                     | closing              | new                                  | —                               |
| chromium | sync-handle                                        | mid-write            | partial                              | —                               |
| chromium | applyTree replace (stage, move aside, publish)     | 9 of 192 mutations   | old 48, new 0, missing 0, partial 0  | 8 short creates removed on open |
| chromium | applyTree replace (stage, move aside, publish)     | 38 of 192 mutations  | old 48, new 0, missing 0, partial 0  | 8 short creates removed on open |
| chromium | applyTree replace (stage, move aside, publish)     | 67 of 192 mutations  | old 48, new 0, missing 0, partial 0  | —                               |
| chromium | applyTree replace (stage, move aside, publish)     | 96 of 192 mutations  | old 48, new 0, missing 0, partial 0  | —                               |
| chromium | applyTree replace (stage, move aside, publish)     | 124 of 192 mutations | old 16, new 32, missing 0, partial 0 | —                               |
| chromium | applyTree replace (stage, move aside, publish)     | 153 of 192 mutations | old 0, new 48, missing 0, partial 0  | —                               |
| chromium | applyTree replace (stage, move aside, publish)     | 182 of 192 mutations | old 0, new 48, missing 0, partial 0  | —                               |
| chromium | applyTree create (final-path write, recorded size) | 2 of 48 mutations    | old 0, new 3, missing 45, partial 0  | 7 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 9 of 48 mutations    | old 0, new 13, missing 35, partial 0 | 6 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 16 of 48 mutations   | old 0, new 22, missing 26, partial 0 | 2 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 24 of 48 mutations   | old 0, new 27, missing 21, partial 0 | 5 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 31 of 48 mutations   | old 0, new 33, missing 15, partial 0 | 6 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 38 of 48 mutations   | old 0, new 38, missing 10, partial 0 | 8 short creates removed on open |
| chromium | applyTree create (final-path write, recorded size) | 45 of 48 mutations   | old 0, new 47, missing 1, partial 0  | 1 short creates removed on open |
