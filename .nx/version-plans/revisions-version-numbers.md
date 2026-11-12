---
revisions: minor
---

Number named versions V1, V2, … once per project (blueprint B6). A version's annotated tag records its number in the `Tau-Tag` trailer (`number`); V1 is the Start entry, which has no tag. There is no counter: `RevisionPort.tag` gives a new name the highest known number plus one and keeps the number of a name it moves, unless the caller passes `number`. `listTags` sets `number` on every tag, numbering a tag that records none (written before numbers, or by another tool) at read, V2 onward in creation order around the recorded numbers (`numberVersions`). A `RevisionRow` gains `versions`, each named version with its number.

When Tau Cloud refuses a version tag because another version holds its number, the sync push gives this device's own versions that are not backed up the next free number, offers the history set once more, and reports them as `renumbered`; `sync.machine` (now version 8) emits `versionsRenumbered` once for them. A backed-up number never changes.

Breaking: `revisionTagMessage` requires `number`, and `parseRevisionTagMessage` returns it.
