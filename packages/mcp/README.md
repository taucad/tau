# @taucad/mcp

Model Context Protocol tools for Tau CAD. The package maps
`evaluate_model`, `test_model`, `screenshot`, and `export_model` onto the
canonical `@taucad/chat` RPC dispatcher used by Tau's browser and headless
runtimes.

General filesystem mutation tools are absent; `export_model` persists its own
artifact set under `.tau/artifacts/`. External agents receive a
run-scoped dispatcher from the host application; this package owns neither
authentication nor project selection. `createTauMcpHttpHandler()` exposes the
tools over the official SDK's Streamable HTTP transport after the host has
authenticated and bound every request. Session ids are additionally fenced by
a non-secret authority key supplied by that host.

`serveTauMcpStdio()` serves the same tools to a local agent that launched the
process (a Codex or Claude Code plugin). With `screenshotImages: 'inline'`,
`screenshot` returns MCP image blocks the client shows its model, with the
saved file paths in text.
