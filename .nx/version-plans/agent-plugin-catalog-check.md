---
agent-plugin: patch
---

The README's installation section gains a Check step: what `claude plugin list`, `claude mcp list` and `codex plugin list` show once the plugin is installed, and a link to the agent guide for troubleshooting and kernel choice. The Links section points at the plugin's docs page on `docs.tau.new`.

`taucad/marketplace` is now the only `taucad` catalog: the copies at the root of `taucad/tau` are gone, so adding the marketplace no longer meets a second catalog of the same name. Users who added the old one follow the "Moving from `taucad/tau`" steps in the marketplace README.

In a Tau checkout, `pnpm plugin:dev install` stops while a host has the published `tau@taucad` enabled (pass `--force` to install `tau@tau-dev` beside it), and `pnpm plugin:dev uninstall` also removes a project-scope `tau@tau-dev` and its `enabledPlugins` entry.
