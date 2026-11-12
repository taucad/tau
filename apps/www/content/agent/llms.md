# Tau

> Tau is code-CAD: a parametric model is code (replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d, SMLibPy or PicoGK) and Tau evaluates it, checks its geometry with GeoSpec tests, renders screenshots and exports STEP, STL, 3MF or glTF. The Tau plugin gives Claude Code and Codex those tools and the kernel skills; the server runs on your computer, and the Tau app and Tau Desktop open the same project folder.

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

From the project folder, run the doctor in the installed plugin folder: `node ~/.claude/plugins/cache/taucad/tau/<version>/dist/doctor.mjs` (Claude Code) or `node ~/.codex/plugins/cache/taucad/tau/<version>/dist/doctor.mjs` (Codex). It prints `ok`, `warn` or `fail` for Node.js, npm and its cache, the CLI the launcher runs and its version, a live `initialize` and the skills, then `next` lines with fixes.

- Claude Code: `claude plugin list` prints `tau@taucad`, its version and `enabled`.
- Codex: `codex plugin list --marketplace taucad` prints `tau@taucad  installed, enabled  <version>`.
- `tau --version` must print the plugin's version; the two `beta` installs can differ. If they do: `npm install -g @taucad/cli@<plugin version>`.
- Tell the user: the plugin version, `tau --version`, `which tau`, the doctor's result, and that the tools appear in a new session or thread. The doctor or any shell handshake proves the launcher and CLI start, not that the host loads the tools: do not report "connected" from one. A handshake run outside the project folder reports that folder as the project.

## If it does not work

- `EACCES` or "root-owned files" from npm: for this install, a one-off cache that changes nothing of the user's: `npm install -g @taucad/cli@beta --cache "$(mktemp -d)"`. The lasting fix: `sudo chown -R $(id -u):$(id -g) ~/.npm`.
- `npm warn install-scripts` naming `@parcel/watcher`, `@google/genai`, `protobufjs` and `esbuild` during the CLI install: expected and harmless; the CLI works with those scripts skipped. Do not add `--allow-scripts`.
- `tau: command not found` after installing: open a new shell, or add `$(npm prefix -g)/bin` to PATH.
- No Tau tools in a new session, or `claude mcp list` says `connection timed out after 30000ms`: without a global CLI of the plugin's version the plugin fetches that version with npx, about 37 s on a cold cache, longer than Claude Code's 30 s start limit. Install the CLI (step one) and start again, or once: `MCP_TIMEOUT=600000 claude`. Codex waits up to 10 minutes. For the reason, run the doctor (Check), which prints what the host hides, or `claude --debug` and read `~/.claude/debug/<session-id>.txt`.
- `claude mcp list` says `CONNECTION_CLOSED`: the launcher exited, and the doctor's `server` line gives its `tau:` line with the fix. Check `node -v` (24 or later) and `npm -v` (11 or later); Node 22 ships npm 10. A root-owned npm cache shows this or the timeout above: the `EACCES` fix.
- `Could not resolve @taucad/agent-plugin@beta from the npm registry`: npm is missing, the registry is unreachable, or `.npmrc` points elsewhere.
- `marketplace add` says `taucad` already exists with another source: an older catalog pointed at `taucad/tau`. Claude Code: `claude plugin marketplace remove taucad` (if it says not found, delete `extraKnownMarketplaces.taucad` from `~/.claude/settings.json`), then add it again. Codex: `codex plugin marketplace remove taucad`, delete `[plugins."tau@taucad"]` from `~/.codex/config.toml` if it remains, then add it again.
- `claude plugin list` shows `tau@tau-dev`: a development catalog from a Tau checkout. `claude plugin uninstall tau@tau-dev`, then `claude plugin marketplace remove tau-dev`.
- A `.py` or `.cs` model answers `KERNEL_NOT_PREPARED`: call `prepare_kernel` with the named kernel once (build123d downloads 194 MB); ask the user first.

## Which kernel

<!-- generated:kernel-routing-digest:start (pnpm nx run chat:generate-kernel-routing) -->

If the project has no model file, choose a kernel before writing one. Once an entry file exists, its kernel is the project's: keep it. The entry file binds the kernel: its extension, and for `.ts`, `.js` and `.py` the library the entry imports.
Rules, in order: (1) Ownership: when the project has an entry file, keep its kernel. A project never migrates. (2) Entitlement: choose only from the kernels available here. (3) Explicit request: A kernel named in the request: that kernel. Python: Build123d, SMLibPy. C#: PicoGK. KCL: none available here. A `.scad` file: OpenSCAD. Say it is not available here and offer the nearest available kernel. (4) Required output: STEP or an exact B-rep hand-off; standards-based or toleranced mating geometry (a thread, a gear, an H7 bore): Build123d, SMLibPy, Replicad, OpenCascade, SMLib. A board, schematic, netlist, BOM or fabrication files: tscircuit. A `.scad` file, or a MakerWorld or Thingiverse customiser: OpenSCAD. (5) Required input: An existing mesh to repair, combine or remix: OpenSCAD, Manifold. An existing mesh to offset, hollow or lattice: PicoGK, PicoVoxel. (6) Process: Machining, sheet metal or casting (moulding counts as casting) named in the request: Build123d, SMLibPy, Replicad, OpenCascade, SMLib. (7) Representation: Computational engineering: lattices and graded infill, TPMS and gyroid cores, heat exchangers and cold plates, conformal and regenerative cooling channels, porous implants, topology-optimised and lightweighted structures, additive manifolds with blended internal passages: PicoGK, PicoVoxel. Does not fire on "Lightweight" or "organic" alone, a plate of plain holes, a honeycomb drawn as a pattern.
Ask one question only when two rules conflict or the best fit is not available here; otherwise choose, and say which kernel and why in one sentence before modelling.
Kernels: PicoGK (`main.cs`, skill `cad-picogk`): Computational engineering in C#: reusing PicoGK or LEAP 71 code, or a voxel model the browser runs out of memory on. PicoVoxel (`main.ts` importing `picovoxel`, skill `cad-picovoxel`): Computational engineering (lattices and graded infill, TPMS and gyroid cores, heat exchangers, conformal cooling channels, porous implants) and blended, branching or stylised organic forms. Build123d (`main.py` importing `build123d`, skill `cad-build123d`): Python is asked for or Python code is reused; exact B-rep parts and assemblies with labelled topology and STEP. SMLibPy (`main.py` importing `smlibpy`, skill `cad-smlibpy`): NURBS B-rep in Python, physical materials, textures and mechanisms, or a project that already imports smlibpy. OpenSCAD (`main.scad`, skill `cad-openscad`): Boxes, cylinders and holes; a script others will adjust; a `.scad` file or a MakerWorld or Thingiverse customiser; a script around an imported mesh. Replicad (`main.ts` importing `replicad`, skill `cad-replicad`): Exact B-rep parts and assemblies: edge fillets and chamfers, shells, lofts, sweeps and revolves, standard or toleranced features, fits to bought parts, STEP. Manifold (`main.ts` importing `manifold-3d/manifoldCAD`, skill `cad-manifold`): Repairing, combining or remixing an existing mesh (STL, OBJ, 3MF); fast, robust mesh booleans. JSCAD (`main.ts` importing `@jscad/modeling`, skill `cad-jscad`): JSCAD is asked for, or existing JSCAD code is reused. OpenCascade (`main.ts` importing `libcascade`): An OpenCascade operation replicad lacks, or the direct OCCT API is asked for. SMLib (`main.ts` importing `@classcad/smlibwasm`, skill `cad-smlib`): Freeform NURBS surfaces in TypeScript, or SMLib is asked for. tscircuit (`main.tsx`, skill `cad-tscircuit`): Circuit boards: schematics, PCB layouts, netlists, BOM and fabrication files.

<!-- generated:kernel-routing-digest:end -->

A `.py` or `.cs` model downloads a native runtime once with `prepare_kernel`; ask the user first. KCL (`main.kcl`) runs on Zoo's cloud engine and is not available from the plugin.

## Next

Say it is installed and offer: "Model a parametric wall bracket in replicad and show me a screenshot." · "Run the GeoSpec tests for this Tau project and fix what fails." · "Export main.ts as STEP and tell me where the file is."

## Links

- [Plugin README](https://github.com/taucad/tau/tree/main/packages/agent-plugin#readme): install, hosts and troubleshooting in full
- [Agent plugin docs](https://docs.tau.new/editor/agent-plugin): the docs page; [docs index](https://docs.tau.new/llms.txt) and [full text](https://docs.tau.new/llms-full.txt)
- [Marketplace catalog](https://github.com/taucad/marketplace) and [npm package](https://www.npmjs.com/package/@taucad/agent-plugin)
- [Tau app]({origin}) and [Tau Desktop]({origin}/download/)
- Update: `claude plugin update tau@taucad` · `codex plugin marketplace upgrade taucad && codex plugin add tau@taucad` · `npm install -g @taucad/cli@beta`
- Remove: `claude plugin uninstall tau@taucad && claude plugin marketplace remove taucad` · `codex plugin remove tau@taucad && codex plugin marketplace remove taucad` · `npm uninstall -g @taucad/cli`
