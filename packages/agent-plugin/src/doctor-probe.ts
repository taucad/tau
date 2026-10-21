/**
 * The doctor's live check: start the plugin's launcher as a host would and ask the server what it serves.
 *
 * Imports nothing but Node.js, so the shipped `dist/doctor.mjs` runs from any installed plugin folder, and
 * `pnpm plugin:dev doctor --smoke` reuses the same session for its tool calls.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';

/**
 * The tools every host gets from `tau mcp`.
 *
 * @internal
 */
export const expectedTools = [
  'evaluate_model',
  'test_model',
  'screenshot',
  'export_model',
  'arrange_workbench',
  'get_parameters',
  'apply_parameter_operation',
  'show_model',
  'view_state',
] as const;

/**
 * Milliseconds one request may wait for its answer: a cold first call boots a kernel, or `npx` fetches the CLI,
 * but a silent server fails.
 *
 * @internal
 */
export const requestTimeout = 180_000;

/**
 * A JSON-RPC session with the launcher over its stdio.
 *
 * @internal
 */
export type ProbeSession = {
  /** The launcher process; kill it to end the session. */
  readonly child: ChildProcessWithoutNullStreams;
  /** Send one request and wait for its result; rejects with the server's error, or its exit or the timeout with
   * the last 4,000 characters it wrote to stderr. */
  readonly request: (method: string, params: unknown) => Promise<unknown>;
};

/**
 * Start `<root>/dist/launch.mjs` with this process's Node.js and open a JSON-RPC session over its stdio.
 *
 * @internal
 * @param root - The plugin folder whose `dist/launch.mjs` starts the server.
 * @param args - The launcher's arguments.
 * @param timeout - Milliseconds each request may wait before it fails with the server's last stderr.
 * @returns The server process and a request function.
 */
export const connect = (root: string, args: readonly string[], timeout = requestTimeout): ProbeSession => {
  const child = spawn(process.execPath, [join(root, 'dist', 'launch.mjs'), ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let buffer = '';
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') {
        continue;
      }
      const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
      const waiter = message.id === undefined ? undefined : pending.get(message.id);
      if (waiter !== undefined && message.id !== undefined) {
        pending.delete(message.id);
        if (message.error === undefined) {
          waiter.resolve(message.result);
        } else {
          waiter.reject(new Error(message.error.message));
        }
      }
    }
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  /* A launcher that exits at once (a preflight failure) closes stdin under a pending write. */
  child.stdin.on('error', () => undefined);
  child.once('exit', (code) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`the server exited with ${String(code)}:\n${stderr}`));
    }
    pending.clear();
  });
  const request = async (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} got no answer in ${String(timeout / 1000)} s:\n${stderr}`));
      }, timeout);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  return { child, request };
};

/**
 * The `initialize` parameters Claude Desktop sends, so the server offers the viewer page.
 *
 * @internal
 */
export const appHostInitialize = {
  protocolVersion: '2025-06-18',
  clientInfo: { name: 'claude-ai', version: '0.1.0' },
  capabilities: {
    roots: { listChanged: true },
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
  },
};

/**
 * What the server answered, or why it did not.
 *
 * @internal
 */
export type ServerProbe = {
  /** Milliseconds from the launcher's start to the `initialize` answer. */
  readonly initializeDuration?: number;
  /** `serverInfo` from `initialize`. */
  readonly serverInfo?: { readonly name?: string; readonly version?: string };
  /** The sentence of the `initialize` instructions that names the serving CLI, starting `Tau CLI `. */
  readonly identity?: string;
  /** Every tool name `tools/list` returned. */
  readonly tools?: readonly string[];
  /** The {@link expectedTools} the server did not list. */
  readonly missingTools?: readonly string[];
  /** The `ui://tau/` viewer page resource, when listed. */
  readonly viewer?: string;
  /** Why the probe failed: the request's error with the server's last stderr. */
  readonly error?: string;
};

/**
 * Start the launcher, initialize as an MCP Apps host, then list tools and resources.
 *
 * @internal
 * @param root - The plugin folder.
 * @param timeout - Milliseconds each request may wait.
 * @returns What the server answered; `error` is set when a request failed, and the launcher is stopped either way.
 */
export const probeServer = async (root: string, timeout = requestTimeout): Promise<ServerProbe> => {
  const started = Date.now();
  const { child, request } = connect(root, [], timeout);
  try {
    const initialized = (await request('initialize', appHostInitialize)) as {
      readonly serverInfo?: { readonly name?: string; readonly version?: string };
      readonly instructions?: string;
    };
    const initializeDuration = Date.now() - started;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const { tools } = (await request('tools/list', {})) as { readonly tools: ReadonlyArray<{ readonly name: string }> };
    /* A server without the viewer page declares no resources and answers `resources/list` with an error. */
    const { resources } = (await request('resources/list', {}).catch(() => ({ resources: [] }))) as {
      readonly resources: ReadonlyArray<{ readonly uri: string }>;
    };
    const names = tools.map((tool) => tool.name);
    return {
      initializeDuration,
      serverInfo: initialized.serverInfo,
      identity: /Tau CLI [^\n]*?\.(?=\s|$)/u.exec(initialized.instructions ?? '')?.[0],
      tools: names,
      missingTools: expectedTools.filter((name) => !names.includes(name)),
      viewer: resources.find((resource) => resource.uri.startsWith('ui://tau/'))?.uri,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    child.kill('SIGTERM');
  }
};
