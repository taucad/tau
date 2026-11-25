---
viewer: minor
---

Keyboard orbit steps follow the orbit style: in Free orbit an arrow-key step turns about the screen's axes and goes on through the poles, as a Free orbit drag does; Turntable steps still stop at a pole. `applyCameraNavigationStep` takes an `orbitStyle` (default Turntable), and `CameraNavigationControls` now also requires `update` and `applyCameraUp`.
