---
replicad: patch
---

Remove the `tessellationLadder` kernel option. It snapped a preset's display tolerance to a quantized ladder so a pose drag kept unchanged parts' meshes, but it was off by default, changed the delivered mesh when on, and saved little. Presets always mesh at their exact tolerance, as they did with the option off; a `tessellationLadder` key passed in kernel options is now ignored.
