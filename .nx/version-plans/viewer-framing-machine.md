---
viewer: minor
---

Add the framing actor (`packages/viewer/src/machines/framing.machine.ts`), not yet wired: `framingMachine` (`awaitingGeometry → framed`), `createFramingActor`, its events `geometryBoundsMeasured`, `fitRequested` and `entryChanged`, `framingEventTypes`, `framingIgnoredEvents` and `framingRefitRatio`. It sends a camera it is given one `frameGeometry` per frame (`source: 'framing'` for the first frame and a refit after bounds change by more than 10 %, `source: 'fit'` for Fit view) and `adoptPersistedPose` for the entry's saved pose after its first frame. The wiring that replaces `useCameraFraming` follows separately; behaviour is unchanged.
