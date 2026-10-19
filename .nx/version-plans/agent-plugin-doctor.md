---
agent-plugin: minor
---

The plugin ships a doctor: `node <plugin folder>/dist/doctor.mjs` answers why a host has no Tau tools, with no checkout and no dependencies. It checks Node.js, npm and its cache with the launcher's own preflight, Claude Code and Codex and whether Tau is installed and enabled in each, which Tau CLI the launcher would run (naming an installed `tau` it passes over for its version), the npm registry with npm's own error text, a live `initialize`, `tools/list` and `resources/list` through the launcher, and the skills. Each check prints one `ok`, `warn` or `fail` line, followed by `next` lines with the commands to run and the instructions sentence that shows a chat has the Tau tools; `--json` prints the same as one object. The exit code is the first failure's: 2 Node.js, 3 npm's cache, 4 npm, 5 the server, 6 the plugin is disabled in a host. `pnpm plugin:dev doctor` in a checkout now runs the built doctor, then the `--smoke` tool calls.
