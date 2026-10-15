# @taucad/agent-plugin

[![npm version](https://img.shields.io/npm/v/@taucad/agent-plugin.svg)](https://www.npmjs.com/package/@taucad/agent-plugin)
[![npm downloads](https://img.shields.io/npm/dw/@taucad/agent-plugin.svg)](https://www.npmjs.com/package/@taucad/agent-plugin)
[![license](https://img.shields.io/npm/l/@taucad/agent-plugin.svg)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue.svg)](https://docs.npmjs.com/generating-provenance-statements)

Tau CAD plugin for Codex and Claude Code: skills and the tau mcp launcher

## Why this package?

- **One plugin for both hosts.** This package's folder is a Codex plugin and a Claude Code plugin; each host reads its own manifest and MCP server config.
- **The agent sees the part it builds.** Five Tau tools evaluate a model, run its GeoSpec tests, return screenshots as images, export STEP, STL, 3MF or glTF, and arrange the Tau workbench.
- **You see it too.** `show_model` opens the Tau viewer: inside Codex desktop and Claude Desktop as an MCP App, and as a local browser link in the CLIs.
- **Kernel knowledge when a task needs it.** An onboarding skill, `tau`, plus API skills for replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, tscircuit, GeoSpec and the workbench.
- **Nothing to install inside the plugin.** It has no dependencies: a small launcher finds your Tau CLI, or fetches the matching release with `npx`.
- **Your project stays clean.** Screenshots and large test reports live in a per-session temporary folder; only exports and workbench records land under the project's `.tau/`.

## Installation

The plugin needs Node.js 24 or later and the Tau CLI. Tau's pre-1.0 releases are published under the `beta` tag:

```bash
npm install -g @taucad/cli@beta
```

Without a `tau` on `PATH`, the plugin runs `npx --yes --package=@taucad/cli@<this plugin's version> tau mcp`, which downloads the CLI and its kernels on first use and can take several minutes. Codex waits up to 10 minutes for that first start. Claude Code waits `MCP_TIMEOUT` milliseconds, which a plugin cannot set: install the CLI first, or start Claude with `MCP_TIMEOUT=600000 claude` the first time. To run a particular CLI, set `TAU_CLI` to its `tau` executable.

### Claude Code

```bash
claude plugin marketplace add taucad/tau
claude plugin install tau@taucad
```

Claude Code 2.1.275 or later does both in one step: `claude plugin install tau --marketplace taucad/tau`, or `/plugin install tau --marketplace taucad/tau` inside a session. Add `--scope project` to record the plugin in the current project's settings rather than yours. The install is a copy under `~/.claude/plugins/cache/taucad/tau/<version>/`; `claude plugin update tau@taucad` refreshes it, and the next session runs it.

### Codex

```bash
codex plugin marketplace add taucad/tau
codex plugin add tau@taucad
```

Start a new thread after installing. Codex offers the `tau` skill as the plugin's onboarding skill.

### npm

Both catalogs install this npm package from its `beta` tag; neither host runs its install scripts, and it has none. To use the folder without a catalog:

```bash
npm install @taucad/agent-plugin@beta
pnpm add @taucad/agent-plugin@beta
yarn add @taucad/agent-plugin@beta

claude --plugin-dir node_modules/@taucad/agent-plugin
```

There are no peer dependencies.

## Quick start

```bash
npm install -g @taucad/cli@beta
claude plugin install tau --marketplace taucad/tau
mkdir bracket && cd bracket
claude "Model a 40 mm wall bracket with two M4 screw holes in replicad. Write GeoSpec tests for its size and holes, make them pass, and show me a screenshot."
```

The same prompt works in `codex` after the Codex install. The agent writes `main.ts` and `main.geospec.ts` with its own file tools, then calls `evaluate_model`, `test_model` and `screenshot` until the model builds and its tests pass. Ask for a STEP file and it calls `export_model`.

## Tools

| Tool                        | What it does                                                                                  | Writes                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `evaluate_model`            | Builds one model file; returns its status, kernel issues, views and exports                   | Nothing                                      |
| `test_model`                | Runs the project's GeoSpec tests (`*.geospec.ts`), one file or one test                       | A report over 128 KiB, in the session folder |
| `screenshot`                | Renders views of a model and returns the images in the result                                 | The images, in the session folder            |
| `export_model`              | Exports STEP, STL, 3MF, glTF or another format the model offers                               | `.tau/artifacts/` in the project             |
| `arrange_workbench`         | Opens views and panes for a person who has the project open in the Tau app                    | `.tau/workbench/` in the project             |
| `get_parameters`            | Reads a model's parameters: their schema, defaults and the values in effect                   | Nothing                                      |
| `apply_parameter_operation` | Edits a model's parameters through a checked write; Tau shows the same values                 | `.tau/parameters/` in the project            |
| `show_model`                | Shows a model in the Tau viewer; a CAD source or STEP/STL/3MF/OBJ becomes GLB first           | The GLB, under `.tau/artifacts/`             |
| `view_state`                | Reports what the viewer shows: model, selection, visibility, camera; with `capture`, an image | Nothing                                      |

The tools load with the session in both hosts rather than waiting behind tool search.

### Printing

With `TAU_HOST_MACHINES=true` in the server's environment (the Codex manifest passes it through), `tau mcp` also offers the print tools (`get_print_profiles`, `request_print`, `get_print_request`, `list_print_requests`, `cancel_print`) over the printers you bound in the Tau app. `request_print` slices the model in the folder the agent is working in, which must be a Tau project (it holds `tau.json`), and asks you to approve the print in the agent app's own form; the print starts only if you tick Approve and accept. An agent app that cannot show a form gets the request back waiting, and you approve it in Tau's Print pane. Printers are shared by every Tau app on the computer and only one can use them at a time, so while the Tau desktop app has them the server offers no print tools, and while the server has them the desktop app waits. That is why printing is off unless you turn it on, and why a server whose one folder is not a Tau project (Claude Code's project folder, or `--project`) leaves the printers alone and says so on stderr. Codex names the folder with each call, so its server prints from whichever project the thread works in. Hosts that draw MCP Apps also get the tools the viewer page calls; see [Viewer](#viewer).

## Viewer

`show_model` puts the model in front of you. How depends on what the host declares when it connects:

| Host                   | What you get                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex desktop          | A Tau tab in the thread, Tau in the sidebar (`browse_models`) and Open with Tau for `.glb`, `.svg`, `.step`, `.stl`, `.3mf` and `.obj` files (`open_model_file`) |
| Claude Desktop         | An inline card in the conversation, with Add to chat and Open full view                                                                                          |
| Claude Code, Codex CLI | A `http://127.0.0.1` link to the same page, served by `tau mcp` for its session; screenshots still come back inline                                              |

The card shows the canvas and two actions. The tab, fullscreen and the browser page add the control bar: grid, section, measure and fit. Add to chat hands the model, or the part you right-clicked, to the host as context: the part's name and its `@cad[<file>#<component>]` token as text, and the same structured reference Tau's own chat chip carries as `structuredContent`. A host that takes only messages gets Send to chat, with the text; where a host takes neither (the browser page) it becomes Copy prompt. Colours and font follow the host.

The page stays live with the agent. It long-polls `app_sync`, a tool only the page can call, to report its view and to hear of the next model: a tab, fullscreen or browser page switches to each model `show_model` shows, while an inline card keeps its own. `show_model` with `select` selects components by id once the model is drawn. `view_state` reads the page the person used last; with `capture: true` that page draws its canvas into a PNG of at most 1280 px wide and returns it through `app_capture_reply`. Without a page open, `view_state` answers `NO_VIEWER` and `screenshot` still renders.

The tab and fullscreen page have a side panel (Panels in the bottom bar): the component tree, where a click selects a component and the eye hides or shows it; the model's parameters, where an edit is written to the project and the page shows the model rendered with it; the selected part's properties; and switches for the grid, axes, edges and surfaces. When you move the camera or hide a part, `tau mcp` saves that view in the project's `.tau/workbench` records, so Tau opens the project with the same camera and hidden parts.

The page is one HTML file, `dist-app/app.html`, that `tau mcp` serves as the resource `ui://tau/<hash>/app.html`. It makes no network request: model bytes reach it through `app_read`, a tool only the page can call, in ranges of at most 4 MiB. The server reads only the range asked for, gzips a range that shrinks by a tenth or more, and refuses a range once the file has changed, so the page shows the new file instead of a mix of two. A 50 MB GLB streams in thirteen calls. The browser link carries a per-session token and answers only on `127.0.0.1`.

The launcher hands the page to the CLI in `TAU_VIEWER_PAGE`. To run the viewer from Claude Desktop, add the launcher to `claude_desktop_config.json` (Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "tau": {
      "command": "node",
      "args": ["/path/to/node_modules/@taucad/agent-plugin/dist/launch.mjs", "--project", "/path/to/your/project"]
    }
  }
}
```

Running `tau mcp` without the plugin serves no viewer unless you pass `--viewer-page <app.html>`.

## Skills

| Skill               | Covers                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `tau`               | Project layout, `tau.json`, which kernel a file uses, the evaluate → test → screenshot → export loop |
| `cad-replicad`      | replicad: BRep solids, the default for parts                                                         |
| `cad-openscad`      | OpenSCAD (`.scad`)                                                                                   |
| `cad-jscad`         | JSCAD (`@jscad/modeling`)                                                                            |
| `cad-manifold`      | Manifold mesh booleans (`manifold-3d`)                                                               |
| `cad-picovoxel`     | PicoVoxel voxels, signed distance fields and lattices                                                |
| `cad-tscircuit`     | tscircuit circuit boards                                                                             |
| `geospec-authoring` | Writing `*.geospec.ts` geometry tests                                                                |
| `workbench`         | The Tau app's workbench views and panes                                                              |

The kernel skills are copied at build time from the packages that own each API. `cad-opencascadejs` (16 MB) is left out: `cad-replicad` covers BRep authoring on the same kernel.

## How it works

### Project folder

Each call works in the first of: the `--project` folder, when you run `tau mcp` yourself; the folder Codex sends with every call (the thread's working folder); `CLAUDE_PROJECT_DIR`, which Claude Code sets for the servers it starts; the server's working directory. Tool paths are relative to that folder.

### Where files go

- Exports: `.tau/artifacts/` in the project; each result lists the project-relative paths. Leave the folder out of commits unless you want exports versioned.
- Screenshots and GeoSpec reports over 128 KiB: a `tau-mcp-*` folder in the system temporary folder, one per server session, removed when the server stops. Screenshots also come back inline as images.
- `arrange_workbench` records: `.tau/workbench/` in the project.

### Which Tau CLI runs

Both hosts start `node dist/launch.mjs`. The launcher starts `<tau> mcp` on its own stdio, forwards `SIGINT` and `SIGTERM`, and exits with the CLI's exit code. It runs the first of:

1. `TAU_CLI`, a path to a `tau` executable.
2. `.dev/cli.json`, the workspace checkout's CLI (see [Development](#development)).
3. `tau` on `PATH`, then `/opt/homebrew/bin/tau` and `/usr/local/bin/tau`, for desktop apps started with a minimal `PATH`.
4. `npx --yes --package=@taucad/cli@<version> tau mcp`, where `<version>` is this package's version.

`resolveTauCli`, the package's one export, is that resolution as a pure function.

### Versions

This package is released with `@taucad/cli` in one fixed version group, so `@taucad/agent-plugin@<version>` pairs with `@taucad/cli@<version>`, which the `npx` fallback pins. Both plugin manifests carry the same version: the release writes all three files. A `tau` on `PATH` runs whatever its version; keep it on the plugin's release, since older CLIs have no `tau mcp`.

## Development

In the Tau workspace, build the plugin folder first:

```bash
pnpm nx build agent-plugin
```

The build copies the kernel skills into `skills/` and writes `.dev/cli.json`, a pointer at this checkout's `tsx` and `packages/cli/src/bin.ts`; neither is committed or published. The launcher runs the pointer with the Node.js that started it, so a plugin loaded from the checkout, or copied out of it by either host, runs your working-tree CLI with nothing on `PATH`. CLI changes apply the next time the host starts the server, in a new session or thread. The launcher skips a pointer into a deleted worktree; set `TAU_CLI` to try another CLI.

`pnpm plugin:dev` installs that folder into each host from the repository root:

```bash
pnpm plugin:dev install                       # Claude Code and Codex: adds the tau-dev catalog and installs tau@tau-dev
pnpm plugin:dev install --host codex          # one host only
pnpm plugin:dev desktop --project ~/my-model  # Claude Desktop: a tau-dev server in claude_desktop_config.json, with a backup
pnpm plugin:dev doctor --smoke                # starts the launcher as a host would and builds, tests and screenshots a block
pnpm plugin:dev uninstall                     # and `desktop --remove`
```

`doctor --smoke` calls `test_model`, which needs the GeoSpec engine that `pnpm install` takes from npm as `geospec-engine` (its prebuilt native binding covers only the platforms it publishes), and `screenshot`, which needs a graphics adapter.

Claude Code reads a catalog added from a local folder in place, so a rebuild reaches it at the next session. Codex copies the folder into `~/.codex/plugins/cache/tau-dev/tau/<version>/`. By hand, the same steps are:

```bash
claude --plugin-dir packages/agent-plugin            # in place, this session only
claude plugin marketplace add ./packages/agent-plugin # the folder's own catalog, tau-dev
claude plugin install tau@tau-dev                     # add --scope project for one project
codex plugin marketplace add ./packages/agent-plugin
codex plugin add tau@tau-dev
```

After changing a skill, a manifest or the launcher, rebuild, run `codex plugin add tau@tau-dev` again (or `pnpm plugin:dev install --host codex`) and start a new session or thread. CLI changes need no refresh: each copy's `.dev/cli.json` still points at this checkout.

`pnpm plugin:dev preview --sha <commit>` installs a [pkg.pr.new](https://pkg.pr.new) build of a `main` commit instead, published by the `Preview packages` workflow: the plugin from a scratch catalog in `~/.cache/tau-plugin-preview` and the CLI with `npm install --global`, so nothing reads the checkout.

```bash
pnpm nx run-many -t lint test typecheck build -p agent-plugin
pnpm nx run agent-plugin:pkgcheck
claude plugin validate --strict packages/agent-plugin
```

## Environment matrix

| Component    | Support                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Node.js      | 24 or later; on an older Node the launcher says so and starts the CLI anyway                                    |
| Claude Code  | Verified with 2.1.295                                                                                           |
| Codex CLI    | Verified with 0.157.1                                                                                           |
| Viewer       | MCP Apps hosts per the ext-apps specification 2026-01-26; covered by an ext-apps basic-host harness in Chromium |
| macOS, Linux | Supported; verified on macOS                                                                                    |
| Windows      | The launcher runs `tau.cmd` and `npx.cmd`; not yet verified in a host                                           |

## Versioning & stability

Pre-1.0. Minor version bumps may contain breaking changes. See
[`release-policy.md`](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md).

## Security & provenance

```bash
npm audit signatures
```

Evaluating a model runs the project's model code on your machine with your permissions: use the plugin in projects you trust.

In Codex the plugin sets `default_tools_approval_mode = "approve"`, so its tools run without asking. `evaluate_model`, `test_model` and `screenshot` are read-only; `export_model` and `arrange_workbench` write only under the project's `.tau/`. To be asked before each call, add this to `~/.codex/config.toml`:

```toml
[plugins."tau@taucad".mcp_servers.tau]
default_tools_approval_mode = "prompt"
```

## License

Apache-2.0. See [`LICENSE`](./LICENSE).

The kernel skills are derived from upstream projects' declared APIs and carry their attributions in
[`NOTICE`](./NOTICE): replicad (MIT), `@jscad/modeling` (MIT), `manifold-3d` (Apache-2.0) and
OpenRSCAD (Apache-2.0 OR MIT), among others.

## Links

- Documentation: <https://tau.new/docs>
- Source: <https://github.com/taucad/tau/tree/main/packages/agent-plugin>
- Tau CLI and `tau mcp`: [`@taucad/cli`](https://www.npmjs.com/package/@taucad/cli)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Issues: <https://github.com/taucad/tau/issues>
