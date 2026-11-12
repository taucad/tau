---
viewer: minor
---

The viewer's presentation seams move out of React (G11b). The stage's `geometryBoundsMeasured` now sets the scene's bounding sphere and emits `geometryRadiusCalculated` when it changes, so the stage no longer sends `sceneRadiusUpdated` (the event stays for hosts with no stage). Graphics folds the kinematics revision from a subscription, so a completed measurement no longer reads the kinematics snapshot. Graphics emits `presentedUnitChanged` with the unit it presents and its artifact's media type, for a host that shares one model interaction across views. The GLB commit is sent once React has attached the scene to its parent, and graphics ignores a repeated commit of the presentation it already shows. `createPresentationAttach` is exported from `gltf-mesh` as that ref callback. `GraphicsContext` gains `poseRevision`, folded by the internal `poseRevisionObserved` event.

Two deliberate changes: the same geometry measured again after `clearArtifact` sets the sphere again (it stayed 0), and a remounted stage whose sphere is unchanged no longer emits `geometryRadiusCalculated`.
