---
mcp: minor
host: minor
cli: minor
skills: minor
agent-plugin: minor
---

Serve Tau to Codex and Claude Code as an MCP plugin.

- **`@taucad/agent-plugin`** is new: one package that is a plugin root for both Codex and Claude Code, with the kernel skill bundles, an onboarding skill, per-host MCP config and a launcher that runs the workspace CLI, `tau` on `PATH`, or `npx @taucad/cli`.
- **`tau mcp`** serves Tau's CAD tools (evaluate, test, screenshot, export) over stdio MCP. It answers `initialize` before the runtime loads, keeps protocol stdout free of logs, writes evidence to a per-session temporary directory instead of the project, and shuts down every client on exit.
- **`@taucad/mcp`**: tool failures carry no `structuredContent`, so SDK clients that validate output schemas deliver the diagnostic to the model; screenshots return inline image blocks.
- **`taucad-skills [directory] [owner...]`** installs only the named owners' bundles.
