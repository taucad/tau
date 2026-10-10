import { resolve as resolvePath } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { serveLocalHostMcp } from '@taucad/host';
import { createHostGeoSpecRunner, createHostToolRegistry } from '@taucad/host/agent-tools';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { systemSkillBundles } from '@taucad/skills/resources';
import { defineCommand } from 'citty';

/** Milliseconds a stopping server waits for its kernels before it exits anyway. */
const shutdownGrace = 5000;

/**
 * `tau mcp` command.
 *
 * Serves Tau's CAD tools — evaluate, test, screenshot, export and the
 * workbench record — over stdio (MCP) to the agent that launched it. The
 * `@taucad/agent-plugin` launcher runs it for Codex and Claude Code; any MCP
 * client may run `tau mcp` itself.
 *
 * Stdout carries the protocol and nothing else: every other write this process
 * makes goes to stderr. The server answers `initialize` before any kernel
 * loads; the first tool call loads the runtime. It exits when the agent closes
 * stdin, on SIGTERM or SIGINT, or when the transport closes, removing the
 * temporary folder its screenshots were saved in.
 *
 * A call works in the first of: `--project`; the folder Codex names with each
 * call (`_meta["codex/sandbox-state-meta"].sandboxCwd`); `CLAUDE_PROJECT_DIR`,
 * which Claude Code sets for the servers it launches; the working directory.
 * Each project gets its own runtime client on its first call.
 *
 * @example <caption>Serve one project to an MCP client</caption>
 * ```text
 * tau mcp --project ./bracket
 * ```
 */
export const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Serve Tau CAD tools to a local agent over stdio (MCP)',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project folder for every call (default: the folder the agent names, CLAUDE_PROJECT_DIR, the cwd)',
    },
    plugin: {
      type: 'string',
      description: 'Additional plugin specifier to load (repeatable)',
    },
    config: {
      type: 'string',
      description: 'Path to a tau.config module that exports plugins',
    },
  },
  async run({ args }) {
    /* Stdout belongs to the protocol. The transport keeps the original writer;
     * any other write — a kernel's console.log, Emscripten glue, a worker's
     * forwarded stdout — goes to stderr instead of corrupting the stream. */
    const protocolWrite = process.stdout.write.bind(process.stdout);
    const stdout = new Writable({
      write: (chunk: Uint8Array<ArrayBuffer>, _encoding, callback) => {
        protocolWrite(chunk, callback);
      },
    });
    process.stdout.write = process.stderr.write.bind(process.stderr);
    console.log = console.error;
    console.info = console.error;
    console.debug = console.error;

    const stopped = Promise.withResolvers<void>();
    const stop = (): void => {
      stopped.resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.stdin.once('end', stop);
    /* The agent stopped reading. */
    stdout.once('error', stop);

    const workspaceRoot = resolvePath(args.project ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd());
    /* The runtime — every kernel module — loads on the first call, never before
     * `initialize`, and never for a session that calls no tool. */
    let runtime: Promise<AnyRuntimeDefinition> | undefined;
    const openClient = async (projectPath: string) => {
      const [{ loadCliRuntime }, { createNodeClient }] = await Promise.all([
        import('#runtime-options.js'),
        import('@taucad/runtime/node'),
      ]);
      runtime ??= loadCliRuntime({ projectRoot: workspaceRoot, plugin: args.plugin, config: args.config });
      return createNodeClient({ runtime: await runtime, projectPath });
    };
    const clients = new Map<string, ReturnType<typeof openClient>>();
    const clientFor = async (projectPath: string): ReturnType<typeof openClient> => {
      let client = clients.get(projectPath);
      if (client === undefined) {
        client = openClient(projectPath);
        clients.set(projectPath, client);
      }
      return client;
    };
    const checkouts = new Map<string, { readonly cwd: string }>();
    const registry = createHostToolRegistry({
      workspaceRoot,
      checkouts,
      runtimeClient: clientFor,
      /* `test_model` borrows the project's runtime and runs on the native
       * engine. Delete once taucad/tau#410 makes this the registry default. */
      geospecRunner: async (projectPath) => createHostGeoSpecRunner(projectPath, await clientFor(projectPath)),
      systemSkillBundles,
    });
    const local = await serveLocalHostMcp(
      { workspaceRoot, pinned: args.project !== undefined, registry, checkouts },
      { stdout },
    );
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The SDK server exposes an onclose callback, not EventTarget.
    local.server.server.onclose = stop;

    await stopped.promise;
    const close = async (): Promise<void> => {
      /* The server and its evidence folder go first, so a kernel that ignores
       * shutdown cannot keep the folder past the grace. */
      await local.close();
      await Promise.allSettled(
        [...clients.values()].map(async (pending) => {
          const client = await pending;
          await client.shutdown();
        }),
      );
    };
    await Promise.race([close(), sleep(shutdownGrace)]);
    // oxlint-disable-next-line unicorn/no-process-exit -- a kernel worker that ignores termination would keep the event loop alive; the protocol is already closed, so no reader is truncated.
    process.exit(0);
  },
});
