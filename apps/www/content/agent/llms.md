# Tau

> Tau is code-CAD: a parametric model is code (replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d or PicoGK) and Tau evaluates it, checks its geometry with GeoSpec tests, renders screenshots and exports STEP, STL, 3MF or glTF. The Tau plugin gives Claude Code and Codex those tools and the kernel skills; the server runs on your computer, and the Tau app and Tau Desktop open the same project folder.

{release}

## Install

Needs Node.js 24 or later with its npm 11 (`node -v`, `npm -v`; npm 10 cannot resolve the CLI). Step one on every host is the Tau CLI, because the plugin starts it:

    npm install -g @taucad/cli@beta
    tau --version

Claude Code 2.1.292 or later, one step:

    claude plugin install tau --marketplace taucad/marketplace

Older Claude Code, two steps:

    claude plugin marketplace add taucad/marketplace
    claude plugin install tau@taucad

Codex:

    codex plugin marketplace add taucad/marketplace
    codex plugin add tau@taucad

Claude Desktop: `npm install -g @taucad/agent-plugin@beta`, then add `node <global node_modules>/@taucad/agent-plugin/dist/launch.mjs --project <folder>` to `claude_desktop_config.json` (https://docs.tau.new/editor/agent-plugin).

Start a new session (Claude Code) or thread (Codex) after installing: the tools appear there, not in the current one. The plugin is not in the Anthropic or OpenAI plugin directories; install it from this page.

## Check

- Claude Code: `claude plugin list` prints `tau@taucad`, its version and `enabled`; `claude mcp list` prints `plugin:tau:tau: node …/dist/launch.mjs - ✔ Connected`.
- Codex: `codex plugin list` prints `tau@taucad  installed, enabled  <version>`.
- `tau --version` must print the same version as the plugin.
- Tell the user: the plugin version, `tau --version` and `which tau`, whether the server connected, and that a new session or thread is needed.

## If it does not work

- `EACCES` or "root-owned files" from npm: `sudo chown -R $(id -u):$(id -g) ~/.npm`, then retry.
- `npm warn install-scripts` naming `@parcel/watcher`, `@google/genai`, `protobufjs` and `esbuild` during the CLI install: expected and harmless; the CLI works with those scripts skipped. Do not add `--allow-scripts`.
- `tau: command not found` after installing: open a new shell, or add `$(npm prefix -g)/bin` to PATH.
- No Tau tools in a new session, or `claude mcp list` says `connection timed out after 30000ms`: without a global CLI of the plugin's version the plugin fetches that version with npx, about 37 s on a cold cache, longer than Claude Code's 30 s start limit. Install the CLI (step one) and start again, or once: `MCP_TIMEOUT=600000 claude`. Codex waits up to 10 minutes. For the reason, run `node ~/.claude/plugins/cache/taucad/tau/<version>/dist/launch.mjs </dev/null`, which prints what the host hides, or `claude --debug` and read `~/.claude/debug/<session-id>.txt`.
- `claude mcp list` says `CONNECTION_CLOSED`: the launcher exited, and running it by hand (above) prints a `tau:` line with the fix. Check `node -v` (24 or later) and `npm -v` (11 or later); Node 22 ships npm 10. A root-owned npm cache shows this or the timeout above: the `EACCES` fix.
- `tau --version` is older than the plugin: `npm install -g @taucad/cli@beta` again; the plugin needs its own version.
- `Could not resolve @taucad/agent-plugin@beta from the npm registry`: npm is missing, the registry is unreachable, or `.npmrc` points elsewhere.
- `marketplace add` says `taucad` already exists with another source: an older catalog pointed at `taucad/tau`. Claude Code: `claude plugin marketplace remove taucad` (if it says not found, delete `extraKnownMarketplaces.taucad` from `~/.claude/settings.json`), then add it again. Codex: `codex plugin marketplace remove taucad`, delete `[plugins."tau@taucad"]` from `~/.codex/config.toml` if it remains, then add it again.
- `claude plugin list` shows `tau@tau-dev`: a development catalog from a Tau checkout. `claude plugin uninstall tau@tau-dev`, then `claude plugin marketplace remove tau-dev`.
- A `.py` or `.cs` model answers `KERNEL_NOT_PREPARED`: call `prepare_kernel` with the named kernel once (build123d downloads 194 MB); ask the user first.

## Which kernel

The entry file's extension picks the kernel; where the plugin ships a skill for the kernel (`cad-replicad`, `cad-openscad`, `cad-jscad`, `cad-manifold`, `cad-picovoxel`, `cad-smlib`, `cad-tscircuit`, `cad-build123d`, `cad-picogk`), load it before writing code. Default: replicad (`main.ts`) for parts and assemblies that need exact BRep and STEP. OpenSCAD (`main.scad`) when the user writes or has OpenSCAD. Manifold (`main.ts`, `manifold-3d`) for mesh booleans and mesh input; JSCAD (`@jscad/modeling`) for 2D-profile CSG. PicoVoxel (`picovoxel`) for lattices, SDFs and porous forms. SMLib (`@classcad/smlibwasm`) for NURBS BRep solids. tscircuit (`main.tsx`) for circuit boards. build123d (`main.py`) when the user wants Python; PicoGK (`main.cs`) for C# voxel engineering; both download a native runtime once with `prepare_kernel`. KCL (`main.kcl`) runs on Zoo's cloud engine and is not available from the plugin.

## Next

Say it is installed and offer: "Model a parametric wall bracket in replicad and show me a screenshot." · "Run the GeoSpec tests for this Tau project and fix what fails." · "Export main.ts as STEP and tell me where the file is."

## Links

- [Plugin README](https://github.com/taucad/tau/tree/main/packages/agent-plugin#readme): install, hosts and troubleshooting in full
- [Agent plugin docs](https://docs.tau.new/editor/agent-plugin): the docs page; [docs index](https://docs.tau.new/llms.txt) and [full text](https://docs.tau.new/llms-full.txt)
- [Marketplace catalog](https://github.com/taucad/marketplace) and [npm package](https://www.npmjs.com/package/@taucad/agent-plugin)
- [Tau app]({origin}) and [Tau Desktop]({origin}/download/)
- Update: `claude plugin update tau@taucad` · `codex plugin marketplace upgrade taucad && codex plugin add tau@taucad` · `npm install -g @taucad/cli@beta`
- Remove: `claude plugin uninstall tau@taucad && claude plugin marketplace remove taucad` · `codex plugin remove tau@taucad && codex plugin marketplace remove taucad` · `npm uninstall -g @taucad/cli`
