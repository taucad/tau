---
viewer: minor
---

The free orbit style is named `'free'`: `OrbitStyle` (`@taucad/viewer/graphics/three/controls/camera-wheel-router`) is `'turntable' | 'free'`, and `'tumble'` is gone. Breaking: an embedder that passes `cameraInput.orbitStyle: 'tumble'` or `viewportGizmoOptions({ orbitStyle: 'tumble' })` passes `'free'` instead; the behaviour is unchanged (each orbit drag turns through the poles and rolls, and the view cube rolls with `roll: 'free'`). Turntable stays the default.
