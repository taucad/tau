---
viewer: minor
---

Keyboard navigation for the viewer (WCAG 2.5.7). `useViewerShortcuts` takes an optional third argument, `{ navigation: true }`, which turns on the navigation keys in a focused viewer under every mouse preset: the arrow keys orbit the camera 15° about its target, Shift with an arrow key pans a tenth of the visible height, and plus (`+` or `=`) and minus zoom. A held key repeats. The keys do nothing in a text field, in a control with arrow keys of its own (a slider, a radio or tab row, a toolbar), while focus is elsewhere on the page, or before the canvas has its controls. `ViewerShortcutKeys.navigation` gives each step's formatted key for tooltips.

Each key is the graphics event `navigateCamera` with a step from `@taucad/viewer/graphics/three/controls/camera-navigation` (`CameraNavigationStep`, `cameraNavigationSteps`, `applyCameraNavigationStep`). Graphics hands it to the canvas's controls adapter, which moves `camera-controls` at once, so the pose reaches the camera as the person's input, as a drag's does. Graphics leaves the event unhandled while no canvas has its controls.
