---
mcp: minor
host: minor
agent-plugin: minor
---

The viewer page's Share pane offers the direct link alone; "Open in Tau" is gone.

- **`@taucad/agent-plugin`**: the Share pane has one method, the direct link, and draws no method picker.
- **`@taucad/mcp`**: `app_share_link` takes `{ modelId }` and answers the packed project only; its `kind` argument, `TauViewerShareKind` and `TauViewerShareLink` are removed from `@taucad/mcp/viewer-protocol`.
- **`@taucad/host`**: the GitHub import link (`createOpenInTauLink`) is removed.
