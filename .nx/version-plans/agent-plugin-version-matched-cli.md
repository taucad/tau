---
agent-plugin: minor
---

The launcher runs an installed `tau` only when `tau --version` prints the plugin's own version, since the plugin and the CLI are released together. It searches `PATH`, then `/opt/homebrew/bin` and `/usr/local/bin`, and takes the first `tau` that matches; a `tau` of another version, or one that fails or does not answer within 2 seconds, is passed over, and the launcher fetches the plugin's version with `npx` instead. `TAU_CLI` and a workspace build's `.dev/cli.json` still run whatever their version.

Before `npx`, the launcher checks Node.js, npm and npm's cache, where a host used to wait for `npx` to fail or time out. A failed check starts nothing: the launcher writes one `tau:` line naming the fix to stderr and exits 2 for Node.js older than 24, 3 for an npm cache it cannot write to (with npm's `sudo chown -R` line; the check is skipped when npm will not name its cache, as for a path holding a UUID), or 4 for an npm that does not run or is older than 11. It no longer warns about an older Node.js before starting another source. The CLI it starts gets `TAU_LAUNCH`, a JSON object naming the source (`explicit`, `workspace`, `installed` or `npx`), the `path` and version (`cli`) of the CLI it ran, the plugin's version (`plugin`), the Node.js version (`node`) and each installed `tau` passed over (`skipped`).

**Breaking**: `resolveTauCli` takes `versionOf`, which returns what `<path> --version` prints, or `undefined` when it fails. Its result adds `source`, `path`, `cliVersion`, `pluginVersion` and `skipped`, and it reads the plugin's `package.json` version for every source, so it throws when that version is missing even with `TAU_CLI` set.
