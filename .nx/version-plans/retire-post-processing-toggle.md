---
viewer: minor
workbench: minor
workbench-panes: minor
mcp: minor
agent-plugin: minor
---

Post-processing is always on, so its toggle is gone. `ModelViewer` no longer takes `graphicsOptions.enablePostProcessing`, the graphics machine no longer accepts `setPostProcessingVisibility`, and a view record no longer holds `display.postProcessing`, which leaves nine inheritable view leaves. A view or named layout file an earlier Tau wrote with `display.postProcessing` still reads: the key is dropped on read. The MCP viewer and agent-plugin display inputs no longer list `postProcessing`.
