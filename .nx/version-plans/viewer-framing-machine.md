---
viewer: minor
---

Add the framing actor (`packages/viewer/src/machines/framing.machine.ts`), not yet wired: `framingMachine` (`awaitingGeometry → framed`), `createFramingActor`, its events `geometryBoundsMeasured` and `fitRequested` (each with optional `viewport` and `stage`, the host's resolved orientation and fit margin) and `entryChanged`, `framingEventTypes`, `framingIgnoredEvents` and `framingRefitRatio`. It sends a camera it is given one `frameGeometry` per frame (`source: 'framing'` for the first frame and a refit after bounds change by more than 10 %, `source: 'fit'` for Fit view) and `adoptPersistedPose` for the entry's saved pose after its first frame. The wiring that replaces `useCameraFraming` follows separately; behaviour is unchanged until then. Once wired, one deliberate change: a remounted canvas whose first measurement is a new presentation that moved more than 10 % refits, where the hook only refreshed the bounds.
