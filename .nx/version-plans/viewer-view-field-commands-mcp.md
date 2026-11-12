---
mcp: minor
host: minor
agent-plugin: minor
---

Keep a viewer page's display, grid unit, field of view and up direction in the view record only when the person sets them.

- `@taucad/mcp`: `TauViewerViewState` gains `viewFields` (`TauViewerViewFields`), the inheritable leaves the person set or reset from the page's controls since the page seeded the view, keyed by leaf path. `app_sync` accepts it and lists it under `accepts`; `view_state` leaves it out. `settings` now needs only `section` and `measurements`.
- `@taucad/host`: the viewer workbench keeper writes an inheritable leaf only from `viewFields`, and takes only the section and pinned measurements from `settings`. A camera move or a section change no longer writes the display, grid unit, field of view or up direction the page shows, so a view that does not set them keeps following Tau's values.
- `@taucad/agent-plugin`: the viewer page renders a saved view through `resolveViewSettings`, and its bar's settings menu, G and P keys and grid unit report what the person set as `viewFields`.
