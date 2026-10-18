# @taucad/cli

CLI for Tau: check, test, export and serve CAD projects from the terminal, with the same runtime the Tau UI uses.

```bash
tau check main.ts                 # does the model evaluate? exit 0 ok, 1 error, 3 refused
tau test                          # run the project's GeoSpec suites
tau export main.ts --ext=glb      # write the geometry
tau open .                        # serve this folder and open it in the browser
```

Every command writes result data only to stdout and diagnostics to stderr; `--json` prints one versioned `{"v":1,…}` record. Exit codes are `0` ok, `1` failed, `2` usage, `3` refused (the request was well formed but cannot run here: a kernel not prepared, an unsupported host, a missing input), `130`/`143` interrupted.

## Export

Export a CAD source file to a target format:

```bash
tau export model.ts --ext=glb
tau export model.ts --ext=stl --export-options='{"binary":true}'
tau export model.ts --ext=webp --export-options='{"width":1024,"height":576}'
tau export model.ts --ext=webp --export-options='{"width":1024,"height":576,"quality":0.9}'
tau export model.ts --ext=glb --content='{"includeEdges":true}'
```

WebP export is lossless when `quality` is omitted or set to `1`; values below `1` request lossy output.

## Check and test

`tau check <file>` evaluates a model once and reports its issues and parameters without writing geometry. Exit `0` means it evaluated cleanly, `1` that the model failed (a syntax error, a thrown error, an error diagnostic), `3` that the runtime declined it (`KERNEL_NOT_PREPARED`, `KERNEL_CAPABILITY_MISSING`, no kernel for the file). The project is the nearest folder holding `tau.json`, else the file's own folder.

```bash
tau check main.ts
tau check main.py --json          # {"v":1,"kind":"evaluation","status":"refused",…} naming `tau prepare build123d`
tau check main.ts --params='{"width":20}'
```

`tau test [project]` runs the project's GeoSpec suites (`*.geospec.ts`) headlessly with the same runner `tau mcp`'s `test_model` uses. Exit `0` means every selected test passed, `1` that a test failed, `3` that nothing could run (no suite, no GeoSpec engine, a kernel not prepared).

```bash
tau test
tau test ./bracket --file=bracket.geospec.ts --testNamePattern='holes' --json
```

Neither command downloads anything: native kernels come from the payload store that `tau prepare` fills.

## Plugins

The CLI ships every first-party plugin. Zoo (KCL) computes geometry through Tau's Zoo proxy, so it
needs a Tau session: set `TAU_API_TOKEN` (and `TAU_API_URL` or `TAU_WEBSOCKET_URL` for another Tau
API; the default is `https://api.tau.new`). Without it a KCL export fails with a sign-in diagnostic.

```bash
TAU_API_TOKEN=<session token> tau export bracket.kcl --ext=glb
```

Add any third-party plugin with repeatable `--plugin`, resolved from the invoking project:

```bash
pnpm add @example/tau-plugin
tau export model.custom --ext=glb --plugin @example/tau-plugin
```

`--plugin` invokes the package's named `plugin` export with no options. A package that duplicates
a built-in is rejected; novel plugins are appended after the built-ins.

Use `--config` when a plugin needs options or must replace a built-in. The module exports already
invoked plugin instances:

```javascript
// tau.config.mjs
import { replicad } from '@taucad/replicad';

/** @type {import('@taucad/cli').CliConfig['plugins']} */
export const plugins = [replicad({ kernels: { default: { ocTracing: 'off' } } })];
```

```bash
tau export model.ts --ext=glb --config ./tau.config.mjs
```

Configured plugins replace matching built-ins in place and append otherwise, preserving kernel
precedence. For installed packages, the CLI warns when `peerDependencies['@taucad/runtime']`
excludes its bundled runtime; path-loaded plugins without a resolvable manifest skip that check.
Which extensions and export routes exist remains owned by the plugin packages.

`--params`, `--export-options`, and `--content` accept JSON objects. Export-option and content keys depend on the route selected for the input source and target extension; unsupported keys and values are reported by the runtime.

## PicoGK

Prepare the PicoGK kernel once, then export C# entry points natively. `tau prepare picogk` downloads Microsoft's .NET runtime archive and the Tau PicoGK layer that `@taucad/picogk`'s `tau-plugin.json` pins, verifies both and seals them as one closure in the payload store; `tau export` then launches the worker from that closure with no environment variable. The worker runs inside the operating-system sandbox described by `@taucad/native-process-core`; the export fails with a native-runtime-unavailable error when that sandbox cannot start.

```bash
tau prepare picogk
tau export model.cs --ext=3mf
tau export model.cs --ext=usdz
```

An export of a `.cs` file before `tau prepare picogk` exits 3 with `KERNEL_NOT_PREPARED`, and on a host no closure supports (PicoGK runs on macOS 14 or later on Apple silicon) with `UNSUPPORTED_TARGET`.

## Machines without network access

`tau prepare --bundle <dir>` prepares a kernel (every kernel this host runs when none is named) and exports its closure as a seed directory: the payload archives under `blobs/sha256/<hex>`, the plugin's `tau-plugin.json`, an audit unit per closure under `notices/<hex>/` (its receipt, its CycloneDX SBOM and its licence notices) and the `tau-seed.json` index. Copy the directory to a machine with no network, check it, prepare from it and audit the result there:

```bash
tau prepare build123d --bundle ./tau-seed            # online
tau prepare --verify-seed ./tau-seed                 # offline: every blob, pin and audit unit
TAU_ACQUISITION=locked tau prepare --seed ./tau-seed # offline: prepares every kernel the seed indexes
tau prepare --audit                                  # offline: files, SBOM and notices of every closure
```

A seed file is used only when it hashes to its name, so a bundle from an untrusted party can at worst be refused. `--verify-seed`, `--seed` and `--audit` exit 3 when anything is missing or differs. The same directory served over HTTP is a `TAU_PAYLOAD_MIRROR`.

`tau ui verify <dir>` re-hashes a deployed copy of the Tau UI build against the `tau-asset-receipt.json` the build writes at its client root, and exits 3 naming every file that is missing or altered. `tau serve --ui` hands the served page the daemon's `TAU_ACQUISITION`, so a locked daemon's UI acquires no types from a CDN.

## Serve and open

`tau serve [dir]` serves a project folder on this machine. Without `--relay` it is local-first: it binds loopback only, pairs with no server and needs no account. It also serves the Tau UI: by default the digest-pinned UI layer, downloaded into the payload store once and verified against the pin the CLI ships, or with `--ui=<dir>` a prebuilt Tau UI build. `--no-ui` serves agents only; when the layer cannot be prepared (offline, unsupported platform, not yet published) the daemon serves agents only and says why.

```bash
tau serve . --ui=./tau-ui                 # http://127.0.0.1:7180, opened in the browser
tau serve . --ui=./tau-ui --print         # print the URL on stdout, open nothing
tau serve . --ui=./tau-ui --json          # one {"kind":"serve","url":…} record on stdout
tau serve . --port=7300 --strict-port     # exit 3 (PORT_IN_USE) instead of trying the next port
tau serve . --smoke-test --port=0         # start, check /.well-known/tau-host, stop
```

The default port is `7180`; a busy port moves to the next free one unless `--strict-port` is given. The browser opens only on an interactive terminal outside CI, and never with `--print`, `--json` or `--no-open`. Reports go to stderr, so `--print` and `--json` leave exactly the URL or the record on stdout.

`--allowed-origins=<origin,…>` (or `TAU_HOST_ALLOWED_ORIGINS`) lets a page on another origin, such as `https://tau.new` or a local web build at `http://localhost:3000`, read `/.well-known/tau-host` and open the `/agent` socket. Origins are exact (no path, trailing slash or wildcard), and the agent token is still required.

`tau open [path|url]` is the one-step launcher: a folder or file is served as above (the store's UI layer, or the build `--ui` or `TAU_HOST_UI_DIR` names) and opened in the browser, and a URL is opened as it is. `--print` and `--json` print instead of opening. `--desktop` hands a served folder to Tau Desktop: the daemon serves agents only, admits `app://tau`, and opens `tau://host/<loopback origin>?code=<one-time code>`, which the desktop redeems once (within a minute) to list the daemon under Runs on. `--ui-origin=<origin>` does the same for the Tau UI on a website such as `https://tau.new`, with the code in the link's fragment; `tau serve --hand-off=desktop|<origin>` is the same hand-off without the launcher. A `tau://` link goes to Tau Desktop as it is.

### Relay

`--relay <url>` (or `TAU_HOST_RELAY_URL`) instead connects outbound to a Tau server so its browser sessions can run projects on this machine, with the same built-in/configured plugin composition used by `export`:

```bash
tau serve --relay=https://api.tau.new --trust-projects
tau serve --relay=https://api.tau.new --trust-projects --config ./tau.config.mjs
tau serve --relay=https://api.tau.new --trust-projects --plugin @example/tau-plugin
```

The first launch prints a pairing URL and code. `--max-sessions` defaults to `1`.

With `TAU_API_TOKEN` set, the daemon trades it for a short-lived Zoo-scoped token and sends only that to its runtime child, so project code never sees the session.

For local Tau development, keep a hot-reloading Host attached to its own terminal pane:

```bash
pnpm nx dev-host cli
```

The target connects to the local API at `http://localhost:4000`, stores its development-only credential under the ignored `out/tau-host-dev` directory, and restarts when CLI or Host source changes. Additional `tau serve` options are forwarded, for example `pnpm nx dev-host cli -- --config=./tau.config.mjs`.

Remote project modules execute on this machine. With a relay, `--trust-projects` is mandatory (`TRUST_REQUIRED`, exit 2, without it) because the Node permission model is defense in depth, not a malicious-code sandbox. A disconnected browser session is not resumed: the UI creates a fresh session after reconnect.

### Clone

`tau clone <project>` clones a Tau Cloud project into a local folder (formerly `tau open`); `tau publish` and `tau revisions` work on the clone.

## Agent commands

`tau agent` drives runs on a Tau Host over the same agent channel the browser uses. A host is always named explicitly — there is no registry and no discovery — with `--host` (or `TAU_HOST_URL`) plus the `TAU_HOST_AGENT_TOKEN` that host was started with. Without both, every command refuses with `HOST_NOT_SPECIFIED` and exit code 3.

```bash
export TAU_HOST_URL=http://127.0.0.1:7777
export TAU_HOST_AGENT_TOKEN=...            # the token `tau serve` was given

tau host inspect --json                    # what this host is and which directory it owns
tau agent list                             # chats in the local workspace, not a remote one
tau agent run chat-1 "extrude the plate to 6 mm"
tau agent run chat-1 - --detach < prompt.txt
tau agent show chat-1                      # the transcript so far, then exit
tau agent tail chat-1 --from=42 --jsonl    # stream until the run settles
tau agent steer chat-1 <run> "use 8 mm instead"
tau agent cancel chat-1 <run>
tau agent respond chat-1 <run> <interrupt> approved --option=allow
```

Stdout carries result data only: tab-separated plain lines by default, one `{"v":1,…}` record with `--json`, or one record per event ending in an `outcome` record with `--jsonl`. Diagnostics go to stderr. Exit codes are `0` completed, `1` failed, `2` usage, `3` refused, `4` requested but not observed to settle — so `tau agent cancel` exits `4`, not `0`, when the run is still running after the host acknowledged the request.

`tau agent list` reads `<workspace>/.tau/chats`; the agent channel has no command that lists chats, so naming a host refuses with `HOST_CHAT_LIST_UNSUPPORTED` rather than guessing at ids.

## Agent plugins

`tau mcp` serves Tau's CAD tools — `evaluate_model`, `test_model`, `screenshot`, `export_model` and `arrange_workbench` — over stdio to the MCP client that launched it. Stdout carries the MCP protocol only. Each call works in the first of: `--project`; the folder Codex sends with the call; `CLAUDE_PROJECT_DIR`; the working directory. Screenshots come back inline; they and GeoSpec reports over 128 KiB are saved in a temporary folder that is removed when the server stops. `--plugin` and `--config` work as they do for `export`. The last sentence of its `initialize` instructions names the CLI version, how it was started (the rung the agent plugin's launcher reports in `TAU_LAUNCH`, or "started directly"), the plugin and Node.js versions, and the `@taucad/mcp` version, so an agent that sees it has the Tau tools. `test_model` sends `notifications/progress` as its run and each test start, to a client that asks for progress, and its results name the GeoSpec `engine` that decided them and the serving `runtime` (this CLI's version and the launcher's descriptor).

Each project folder gets its own worker thread on its first call, so projects evaluate, export and screenshot in parallel (`test_model` calls run one at a time) and a model that hangs or crashes its thread costs only that project. An operation that runs past `--operation-timeout` seconds (default 600) fails, and the project's next call starts a fresh thread. A thread with no tool call in flight for `--idle-release` seconds (default 900) is released, and the project's next call loads a fresh one. Finished builds are kept in the same durable compute store `tau serve` uses (`compute` in the Tau config folder, one file per project), so a restarted server reuses a model it, or `tau serve`, already built; `--compute-mode memory` keeps them for this process only and `off` disables reuse.

Native kernels are composed from the payload store, never downloaded by a CAD tool: a `.py` or `.cs` file whose runtime is not prepared answers `KERNEL_NOT_PREPARED`, and the `prepare_kernel` tool prepares it — a download of about 162 MB for build123d and 49 MB for PicoGK, which an agent host that approves tools without asking starts without a prompt — in the server's process with progress and cancellation, then replaces each project's thread once its in-flight calls finish. A runtime `tau prepare` sealed meanwhile is picked up on the next call. Worker threads start with an allowlisted environment: the platform's variables, proxy and CA settings, and the `TAU_*` acquisition profile.

```bash
tau mcp --project ./bracket
tau mcp --operation-timeout 120 --idle-release 300
```

For Codex and Claude Code, install [`@taucad/agent-plugin`](https://www.npmjs.com/package/@taucad/agent-plugin): it starts `tau mcp` for the agent and adds Tau's CAD skills.

```bash
claude plugin install tau --marketplace taucad/marketplace
codex plugin marketplace add taucad/marketplace && codex plugin add tau@taucad
```

## TUI

`tau tui <chat>` is the same chat, the same channel and the same durable events as `tau agent tail`, with a keyboard attached. It follows the run, keeps at most 2,000 transcript rows resident, and offers exactly four things: type a prompt and press Enter (which starts a turn when the chat is idle and steers the running one when it is not), `y`/`n` to answer a pending approval with the option id the request itself offered, `c` to cancel, and `q` to detach. `q` leaves the run going — the daemon is what owns it.

```bash
export TAU_HOST_URL=http://127.0.0.1:7777
export TAU_HOST_AGENT_TOKEN=...            # the token `tau serve` was given

tau tui chat-1                             # follow from the beginning
tau tui chat-1 --from=42                   # resume from a cursor
```

`q` and `c` are commands only while the prompt is empty, so a prompt cannot begin with either letter. Everything the daemon reports — the operation it performed and the state it reached — is printed verbatim; this view never names an outcome the host did not.

There is no mouse, no colour requirement and no cursor trickery: every row is plain text and every action has a key. Off a terminal — a pipe, a CI job, or `--plain` — `tau tui` refuses with `TUI_NOT_A_TTY` and exit code 3, writes nothing to stdout, and names `tau agent tail <chat> --jsonl` instead.
