# @taucad/mcp

Read-only Model Context Protocol tools for Tau CAD. The package maps
`get_kernel_result`, `test_model`, `screenshot`, and `export_geometry` onto the
canonical `@taucad/chat` RPC dispatcher used by Tau's browser and headless
runtimes.

Filesystem mutation tools are intentionally absent. External agents receive a
run-scoped dispatcher from the host application; this package owns neither
authentication nor project selection. `createTauMcpHttpHandler()` exposes the
tools over the official SDK's Streamable HTTP transport after the host has
authenticated and bound every request. Session ids are additionally fenced by
a non-secret authority key supplied by that host.
