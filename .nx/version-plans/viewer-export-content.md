---
mcp: minor
host: minor
agent-plugin: minor
workbench-panes: minor
---

The agent plugin viewer shares its export and share logic with the Tau app and the runtime instead of keeping copies.

- `@taucad/mcp/viewer-read` is a new page-side subpath. It uses Web APIs only, with no SDK, zod or Node. It exports `readTauViewerBytes`, which reads a file the server holds one `app_read`-sized range at a time and checks offsets, sizes and the digest, and `decodeTauViewerSlice`. It also exports the types `TauViewerRangeRead` and `ReadTauViewerBytesInput`. The viewer page reads shown models and export downloads through it.
- `app_export_formats` lists each format on the route `RuntimeClient.bestRouteFor` takes, and now includes the route's `content` form. The host's `ViewerExportRuntime` adds `bestRouteFor`. `app_read_artifact` takes `encodings`, as `app_read` does.
- The direct share link always packs the runtime's source closure of the entry, through the `snapshotSource` that `tau mcp` wires in. The `git ls-files` project-files fallback is gone, and `TauViewerDirectShare.closure` narrows to `'runtime'`. A host without `snapshotSource` leaves `app_share_link` out.

The agent plugin's Export pane offers what the Tau app's does:

- It passes each route's framework content (`export_model` `content`).
- It keeps the format picked and each format's options and content across reloads. They live in the frame's `localStorage` under the app's keys `export/<format>/options` and `export/<format>/content`, and fall back to memory when the host refuses storage.
- It reports outcomes in toasts.

`@taucad/workbench-panes` adds `components/format-badge`, which exports `FormatBadge` and `FormatFileIcon`: the Tau app's model-format badge, now shared. The Export pane draws these badges when its host passes no `FileIcon`.
