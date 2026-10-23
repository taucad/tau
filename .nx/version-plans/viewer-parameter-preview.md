---
mcp: minor
host: minor
agent-plugin: minor
workbench-panes: minor
---

Dragging a parameter in the viewer page's Parameters pane previews the model live. The page sends the dragged values at most every 200 ms through `app_preview_parameters` (`TauViewerPreviewParametersInput { modelId, parameters? }`, answering `TauViewerPreviewResult { accepted }`), a tool only the page can call. `tau mcp` renders them on the shown source's watched document as a transient update, so `.tau/parameters` is written only on release, and `building` stays false during a preview. A cancelled or refused drag restores the committed render. `app_preview_parameters` answers `UNKNOWN_MODEL` for a model the server did not show and `NOT_LIVE` for a drawn file. A watched session is now keyed by project folder and entry, so a parameter write renders on the same document instead of opening another one. `@taucad/workbench-panes/parameters/parameter-controller` exports `createParameterController`, with `ParameterTransport`, `ParameterControllerOptions` and `ParameterController`. The controller is the Parameters source over a read, propose and preview transport: it pins each write to the read revision, runs one entry's writes in order, throttles previews, and keeps a refused value in its row with the server's message. The page's Parameters source is this controller.
