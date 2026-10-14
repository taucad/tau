---
mcp: minor
host: minor
agent-plugin: minor
---

The viewer page stays live with the agent. A page polls `app_sync`, an app-only tool, to report what it shows and to hear of the next model. `view_state` (new, for every host) answers with the model, the selected, hidden and isolated components, the camera, and whether a section or measurements are on, from the page the person used last. With `capture: true` it also returns an image of that page's canvas as drawn; the page sends it back through `app_capture_reply`. `show_model` takes `select`, component ids the page selects once the model is drawn, and a tab or fullscreen page switches to each model `show_model` shows; an inline card keeps its own. STEP, STL, 3MF and OBJ files are converted to GLB on the server, so `show_model`, `browse_models` and Open with Tau take them.
