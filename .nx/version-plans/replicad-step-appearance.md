---
replicad: patch
---

Write STEP appearance as the glTF export renders it. A shape without an authored colour no longer exports red; its STEP surface colour is left for the reader to choose. Surface colours are no longer sRGB-encoded twice, so they match the authored colour. Omitted factors of an authored glTF material keep the glTF defaults (white, metallic 1, roughness 1), and legacy colour fields keep the CAD defaults the glTF export applies. The kernel version moves to 1.1.1 so cached STEP exports regenerate.
