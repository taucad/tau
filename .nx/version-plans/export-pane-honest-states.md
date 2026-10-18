---
agent-plugin: minor
workbench-panes: minor
---

The agent plugin viewer's Export pane says why it lists no formats instead of reading "No geometry to export" for every failure. A `tau` older than the plugin, which has no export formats tool, reads "This Tau server has no export formats; plugin <version> needs the same version: npm install -g @taucad/cli@<version>, then restart the Tau server or your agent"; a server that cannot list the file's formats (`NO_KERNEL`, `FORMATS_UNAVAILABLE`) shows its reason with Retry. The page's tool calls now fail with the server's error code on both the MCP Apps and the loopback route, and an MCP Apps failure's message no longer starts with that code. `@taucad/workbench-panes`' `ExportEntryState` takes an optional `unavailable` (`ExportUnavailable`: `code`, `message` and `retry`, `undefined` when asking again cannot help), which the pane shows in place of the formats.
