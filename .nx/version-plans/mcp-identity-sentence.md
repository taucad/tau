---
cli: minor
host: minor
mcp: minor
---

`tau mcp` says which CLI is serving in its `initialize` instructions, and declares Codex's capability to Codex only.

- The instructions end with one sentence naming the CLI version, how it was started, the plugin and Node.js versions and the `@taucad/mcp` version, for example `Tau CLI 0.1.0-beta.7 (npx; installed tau 0.1.0-beta.6 at /usr/local/bin/tau skipped) started by plugin 0.1.0-beta.7 on Node.js 24.20.0; server @taucad/mcp 0.1.0-beta.7.` The rung comes from the agent plugin's `TAU_LAUNCH` descriptor; without one, or with one that does not parse, the sentence reads `Tau CLI <version> started directly; server @taucad/mcp <version>.` An agent that sees the sentence has the Tau tools in that chat.
- `serveTauMcpStdio` declares the `codex/sandbox-state-meta` experimental capability only to a client whose `clientInfo.name` is `codex-mcp-client`; Claude Code and other clients no longer receive it.
- `@taucad/mcp` takes `runtime` (`{ version, launch? }`) in its server options and exports `parseTauMcpLaunch` and the `TauMcpRuntime` type; `@taucad/mcp/viewer-protocol` exports `codexClientName`. `@taucad/host`'s `serveLocalHostMcp` takes the same `runtime` and re-exports `parseTauMcpLaunch` and `TauMcpRuntime`.
- `serverInfo.version` and the sentence read `@taucad/mcp`'s installed manifest, so a preview build reports its preview version rather than the one inlined at build time.
