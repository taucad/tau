---
host: minor
cli: minor
---

`@taucad/cli` no longer installs the `claude` and `codex` binaries its ACP adapters would bundle (about 640 MB). Its build stages the pinned adapters in `dist-acp`, as the desktop app stages them, and `tau serve` resolves them there; the adapters move to devDependencies. Each adapter now runs the `claude` or `codex` the host found on `PATH`: `AcpAgentProfile` gains `executableEnv` (`CLAUDE_CODE_EXECUTABLE`, `CODEX_PATH`), and a resolved `AcpAdapter` carries its `executablePath`, which the version probe and the adapter both use. Claude Code needs 2.1.232 or newer and offers `claude auth login` when it is logged out; Codex offers `codex login`. Tau MCP tool calls from Claude Code are now recorded as Tau's own tools, with their structured results.
