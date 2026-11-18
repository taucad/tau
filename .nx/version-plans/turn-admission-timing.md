---
revisions: minor
host: minor
---

A turn admission reports its timing once the placement answers it. `createTurnPlacementPort` takes `admissionTiming`: one report per answered admission, holding ids and milliseconds only. The report gives each phase (lease check, recorded checkout, placeIntent, settle, the root's placed or refused answer, grant), the count, total and longest of the Git processes or bridge calls that finished while the admission ran, and how it was answered. `gitCommandActivity` (`@taucad/revisions/node`) times every Git process that `runGitCommand` runs. In `@taucad/host`, `createProjectRevisions` and `createProjectHost` take `admissionTimed` and count Git.
