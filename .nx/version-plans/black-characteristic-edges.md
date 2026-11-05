---
host: minor
---

Captures render with the light scheme's look, so their characteristic edges are black. They used the dark scheme's look and drew its neutral grey (`#868686`) edges. The light scheme also has no dark-mode ambient boost (ambient 0.1 instead of 0.115, before nanoraster's division by π). The capture backgrounds and the dark-mode viewer are unchanged.

- **`@taucad/host`**: the MCP viewer's part thumbnails (`app_part_thumbnails`) and agent screenshots render with the light scheme's look and draw black edges.
