---
viewer: patch
---

The view cube's top and bottom views reach the camera as the cube reported them: `readViewportGizmoPose` no longer tilts a view near the up axis a further 1e-3 rad off it, so the camera presents the cube's view and a cube drag toward a pole no longer jumps back off it.
