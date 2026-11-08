---
zoo: patch
---

The offline engine's topology queries free every libcascade wrapper they do not return. `faces`, `edges` and `vertices` freed none of the raw wrappers behind their typed results, and the opposite-edge, adjacent-edge and shared-vertex queries freed none of the edges and vertices they read, so a long offline session grew the libcascade heap. `closestEdge` also frees its probe and edge compound when a constructor throws.
