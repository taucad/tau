---
workbench-panes: minor
mcp: minor
host: minor
agent-plugin: minor
cli: minor
---

`show_model` on a CAD source watches it. `tau mcp` opens one runtime document per shown source with `watch: true`, keyed by project folder, entry and parameters. It follows the default view with the CAD topology, as the Tau app does, and keeps each render in memory behind its model id. Showing a model no longer writes to `.tau/artifacts`, and a shown source's `model.path` is the source itself. Each edit to the file or its parameters renders again, whether it comes from the agent, an editor or the Parameters pane. Every page showing that source, a card included, and every page following it gets the newer model through `app_sync` with no further `show_model`. The page no longer calls `show_model` after a parameter write. `TauViewerSyncResult.status` maps each entry path to a `TauViewerEntryStatus` (`building`, `sourceRevision`, `issues` as `TauViewerIssue`). The page shows that status over the canvas and passes it to the Kinematics pane with the kernel's mechanism issue. `TauViewerModel` gains `sourceRevision` and `issues`. `TauViewerViewState.sourceRevision` is accepted through `app_sync`'s `accepts`, so `view_state` names what the page draws. A watched session ends with its project's runtime at the idle release of `tau mcp`, and each render counts as use. `@taucad/host` replaces `LocalMcpViewerOptions.renderGlb` with `liveRuntime`, and `LocalHostMcpOptions.runtimeClient` now also opens documents.

The Tau app and the agent plugin share the viewer's structured issues. `@taucad/workbench-panes/shell/viewer-issues` draws the issue segment and list: stack frames, file links, the host's fix action and a Prepare action for a kernel that is not prepared. The plugin page lists the shown source's issues in its viewer bar, with Add to chat, Codex file links and `prepare_kernel`.
