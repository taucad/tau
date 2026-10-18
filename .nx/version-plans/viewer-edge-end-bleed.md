---
viewer: patch
---

Hidden model edges that end on a face's boundary no longer show through that face as short ticks past its outline, such as the far-side flank edges of gear teeth. On WebGL the surface's depth margin now matches half the drawn edge stroke at the display's pixel ratio, instead of a fixed margin that orthographic views also applied twice. Visible edges keep their width and continuity.
