---
host: patch
---

The viewer page's own calls run in the project of the model it shows, not in the folder `tau mcp` started in.

- Codex names the thread's folder (`_meta["codex/sandbox-state-meta"]`) only on the agent's own calls. The calls the page makes through the host carry the conversation (`_meta.threadId`) alone, so `get_parameters`, `apply_parameter_operation`, `export_model`, a `show_model` re-render and the Export pane's tools ran in the plugin cache, and the Parameters pane failed with `ENOENT`.
- A call that names no folder now works in the project of the model its conversation showed last; the Export pane's tools work in the project of the model their `modelId` names. A call that names its folder, a `--project` pin and a host that names no conversation (Claude Code) behave as before.
