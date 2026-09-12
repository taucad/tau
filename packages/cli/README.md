# @taucad/cli

CLI for `@taucad/runtime`.

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

## Plugins

The CLI ships every first-party plugin except Zoo, which needs credential configuration for a
headless export. Add Zoo or any third-party plugin with repeatable `--plugin`, resolved from the
invoking project:

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

Point the CLI at a prepared, target-specific PicoGK payload to run C# entry points natively. The worker runs inside the operating-system sandbox described by `@taucad/native-process-core`; the export fails with a native-runtime-unavailable error when that sandbox cannot start.

```bash
TAU_PICOGK_RESOURCE_ROOT=/path/to/picogk-resources tau export model.cs --ext=3mf
TAU_PICOGK_RESOURCE_ROOT=/path/to/picogk-resources tau export model.cs --ext=usdz
```

The resource root contains directories such as `darwin-arm64/` with `tau-runtime-manifest.json` and the integrity-pinned worker payload prepared by the desktop build.

## Tau Host

Run the outbound daemon with the same built-in/configured plugin composition used by `export`:

```bash
tau serve --trust-projects
tau serve --trust-projects --config ./tau.config.mjs
tau serve --trust-projects --plugin @example/tau-plugin
```

The first launch prints a pairing URL and code. The default relay is `https://api.tau.new`; override it with `--relay` or `TAU_HOST_RELAY_URL`. `--max-sessions` defaults to `1`.

For local Tau development, keep a hot-reloading Host attached to its own terminal pane:

```bash
pnpm nx dev-host cli
```

The target connects to the local API at `http://localhost:4000`, stores its development-only credential under the ignored `out/tau-host-dev` directory, and restarts when CLI or Host source changes. Additional `tau serve` options are forwarded, for example `pnpm nx dev-host cli -- --config=./tau.config.mjs`.

Remote project modules execute on this machine. `--trust-projects` is mandatory because the Node permission model is defense in depth, not a malicious-code sandbox. A disconnected browser session is not resumed: the UI creates a fresh session after reconnect.

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
