---
mcp: minor
host: minor
cli: minor
agent-plugin: minor
---

`show_model` opens the Tau viewer from `tau mcp`, as an MCP App where the host draws one and as a local browser page where it does not.

- **`@taucad/mcp`**: `registerTauMcpViewer` serves the page as the resource `ui://tau/<hash>/app.html` (`text/html;profile=mcp-app`, CSP `data:`/`blob:` only) and registers `show_model`, `open_model_file`, `browse_models` and the app-only `app_read`. Each session's presentation follows the client's `initialize` (`resolveTauViewerPresentation`, in the new `./viewer-protocol` subpath): an MCP Apps host gets `_meta.ui.resourceUri`, Codex desktop also gets the thread, sidebar and file entrypoints, and any other client gets a link.
- **`@taucad/host`**: `serveLocalHostMcp` takes `viewerPage`. A CAD source is rendered to GLB through `export_model`; `app_read` returns at most 4 MiB per call and refuses a file that changed. Text hosts get a loopback page on `127.0.0.1` behind a per-session token.
- **`@taucad/cli`**: `tau mcp --viewer-page <app.html>`, or `TAU_VIEWER_PAGE`.
- **`@taucad/agent-plugin`**: ships the single-file viewer page (`dist-app/app.html`) and hands it to the CLI. The launcher passes its own arguments on to `tau mcp`, so a Claude Desktop config can name `--project`.
