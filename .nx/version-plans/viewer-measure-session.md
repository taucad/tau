---
viewer: minor
---

Give Measure a session actor. The measure input now emits its decision for each release (`accepted`, `cancelled`, `ignored` or `deferred`) instead of exposing a result slot, and a new `measureSession` machine owns the hover, the press generation a waiting click is checked against, and when a release commits. One pair of DOM adapters holds the pointer listeners, the waiting presses and what the session follows (the presented camera, a camera drag, the pose, the cuts and the model), so the measuring tool has no effect that sends, subscribes or times for its input.

Named behaviour changes: the listeners are bound once per activation and surface, so a camera drag or a re-render no longer rebinds them; a change of the presented model, its display, pickable meshes or the hover settings re-hovers a resting pointer on the next frame rather than in the React commit; and an unmount stops the session a microtask later, as every `useActorRef` actor stops.
