---
viewer: patch
---

A trackpad pinch now moves the camera the way the mouse wheel does. In perspective a pinch (a `ctrlKey` wheel in Chromium and Firefox, a `gesturestart`/`gesturechange` pinch in Safari) dollies the camera closer or further and leaves its zoom at 1, where it used to change the zoom; in orthographic it zooms, as before. A pinch inside the viewer never zooms the page, and drag bindings are unchanged. The router sits beside the controls' own listeners in the controls adapter and in `TauCameraControls`.
