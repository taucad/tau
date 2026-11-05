---
viewer: minor
host: minor
---

Characteristic edges are black in both colour schemes. The viewer render profile's dark scheme drew them neutral grey (`#868686`), and every capture that renders with the dark scheme copied that grey. Now the dark scheme also uses black (`0x000000`), so the dark-mode viewer and every capture draw the same black edges as the light-mode viewer.

- **`@taucad/viewer`**: `gltfEdgeColorDarkMode` is `0x000000`.
- **`@taucad/host`**: the MCP viewer's part thumbnails (`app_part_thumbnails`) draw black edges.
