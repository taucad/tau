---
filesystem: minor
workbench-panes: minor
mcp: minor
host: minor
agent-plugin: minor
---

The viewer tab has a Files pane, the Tau app's own file browser: breadcrumbs, a search, folders first, the shown file marked, and a file the viewer cannot show listed but disabled. A click shows that file in this page alone; the model `show_model` showed last and every other page keep theirs. A file the agent, an editor or a script writes appears without a reload.

- **`@taucad/workbench-panes`**: a `files` pane in the registry (Files, project group) and `files?: FilesSource` on `WorkbenchPanesHost`. `./files/files-source` exports `FilesSource` and `FilesEntry`, `./files/files-pane` exports `FilesPane`, and `./files/file-selector` exports the browser the Tau app's file picker draws (`FileBrowser`, `useFileBrowser`, `createStaticDataSource`, `compareFileEntries`, and `FileSelectorDataSource`, the first two members of a `FilesSource`).
- **`@taucad/mcp`**: two app-only tools for every presentation with a page. `app_list_files` lists one folder (`path`) or a search (`query`) of the shown model's project, at most 500 entries, each with `renderable`, and the project's `filesVersion`; `.tau` and dependency folders are never listed and `exports/` is. `app_open_file` shows a file to the calling page (`pageId`) without moving the model shown last. `app_sync` answers carry `filesVersion` once a page listed its project. A `TauMcpViewer` without `listFiles` or `openFile` leaves the tool out. `browse_models` is removed: Codex's sidebar entrypoint is now `show_model` without a target, which opens the model shown last or the project's main file.
- **`@taucad/host`**: the listing is a `TreeIndex` per project kept current from the folder's watch, so a change answers the page's held `app_sync` with the new `filesVersion`.
- **`@taucad/filesystem`**: `TreeIndex` and its `TreeNode`, `TreeIndexAdmits` and `TreeSearchOptions` types are exported from the package root.
