/**
 * Spawn one ACP adapter, with the daemon's own environment left behind.
 *
 * X6 keeps two credential planes apart: the adapter inherits the *user's* CLI
 * login, and Tau's bearer buys Tau models only. SP-4 showed how that breaks
 * silently — a leaked `CLAUDE_CODE_MESSAGING_SOCKET` bound the adapter to the
 * host harness's auth channel instead of the user's keychain, and every turn
 * then failed with the harness account's billing error.
 *
 * So the environment is an **allowlist**, not a blocklist: nothing is passed
 * that is not named here. An allowlist strictly subsumes the charter's
 * "drop every `CLAUDE`/`ANTHROPIC`/`CODEX`/`AI_AGENT`/`BAGGAGE`/`OPENAI`/
 * `TAU_HOST_AGENT_TOKEN` prefix" rule — it also drops `NODE_OPTIONS`, which
 * would otherwise inject this process's loader hooks into a vendor adapter.
 * The one carve-out is each adapter's own config-directory variable.
 */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { ndJsonStream } from '@agentclientprotocol/sdk';
import type { Stream } from '@agentclientprotocol/sdk';

import type { AcpAdapter } from '#acp/registry.js';

/**
 * Exact variable names every adapter is given.
 *
 * The proxy and CA entries are here by operator ruling (2026-09-03): a proxy
 * URL or a CA bundle path is the *user's own network setting*, not a Tau
 * credential, and without them an adapter behind a corporate proxy cannot
 * reach its own vendor at all. The X6 fence is about Tau bearers and vendor
 * API keys, and neither of those joins this list.
 *
 * @public
 */
export const acpEnvironmentAllowlist: readonly string[] = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'SHELL',
  'USER',
  'TERM',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
];

/** Variable prefixes every adapter is given. @public */
export const acpEnvironmentPrefixAllowlist: readonly string[] = ['XDG_'];

/** Bytes of adapter stderr retained for a typed failure reason. */
const stderrRetention = 8192;

/**
 * The exact environment one adapter is spawned with.
 *
 * @param base - Environment to filter, normally `process.env`.
 * @param adapter - Adapter whose own config variables survive the allowlist.
 * @returns A fresh environment containing only allowlisted variables.
 * @public
 *
 * @example <caption>Nothing of Tau's own reaches the adapter</caption>
 * ```typescript
 * import { acpAdapterEnvironment } from '@taucad/host';
 *
 * const env = acpAdapterEnvironment(
 *   { PATH: '/usr/bin', TAU_HOST_AGENT_TOKEN: 'secret' },
 *   { configEnv: [] },
 * );
 * console.log(env['TAU_HOST_AGENT_TOKEN']); // undefined
 * ```
 */
export const acpAdapterEnvironment = (
  base: NodeJS.ProcessEnv,
  adapter: Pick<AcpAdapter, 'configEnv'>,
): NodeJS.ProcessEnv => {
  const allowed = new Set([...acpEnvironmentAllowlist, ...adapter.configEnv]);
  return Object.fromEntries(
    Object.entries(base).filter(
      ([name, value]) =>
        value !== undefined && (allowed.has(name) || acpEnvironmentPrefixAllowlist.some((p) => name.startsWith(p))),
    ),
  );
};

/** One newline-delimited JSON-RPC frame observed on the adapter's stdio. @public */
export type AcpWireFrame = {
  readonly direction: 'client->agent' | 'agent->client';
  readonly frame: string;
};

/** A running adapter process and its ACP stream. @public */
export type SpawnedAcpAdapter = {
  readonly child: ChildProcessWithoutNullStreams;
  /** The bidirectional ACP message stream, ready for `ClientSideConnection`. */
  readonly stream: Stream;
  /** The adapter's most recent stderr, for a typed failure reason. */
  stderr(): string;
  /** Kill the adapter. Idempotent. */
  close(): void;
};

/**
 * Spawn one resolved adapter over stdio.
 *
 * Run with **this process's own `node`** rather than the package's shebang: the
 * adapters ship plain ESM entry modules, and executing them through `node`
 * sidesteps exec bits, shebang resolution and Windows shims in one step.
 *
 * @param options - Adapter, working directory, and optional wire tap.
 * @returns The child, its ACP stream, and a stderr tail.
 * @public
 */
export const spawnAcpAdapter = (options: {
  readonly adapter: AcpAdapter;
  /** Absolute cwd — the materialized branch, never the workspace root. */
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
}): SpawnedAcpAdapter => {
  const child = spawn(process.execPath, [options.adapter.modulePath], {
    cwd: options.cwd,
    env: acpAdapterEnvironment(options.environment ?? process.env, options.adapter),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    stderr = (stderr + Buffer.from(chunk).toString('utf8')).slice(-stderrRetention);
  });
  /* An adapter that dies mid-write leaves an EPIPE on stdin; it is already
   * reported through the connection's own failure, never as a process crash. */
  child.stdin.on('error', () => undefined);

  const tap = (
    direction: AcpWireFrame['direction'],
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> => {
    let pending = '';
    return new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(chunk, controller) {
        if (options.onFrame) {
          const lines = (pending + Buffer.from(chunk).toString('utf8')).split('\n');
          pending = lines.pop() ?? '';
          for (const frame of lines) {
            if (frame.trim() !== '') {
              options.onFrame({ direction, frame });
            }
          }
        }
        controller.enqueue(chunk);
      },
    });
  };

  const outbound = tap('client->agent');
  /* async-iife: bootstrap; the pump ends with the child, and a broken pipe is
   * already reported through the ACP connection's own failure. */
  const pump = async (): Promise<void> => {
    try {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Node's duplex web adapters are typed against the DOM stream declarations.
      await outbound.readable.pipeTo(Writable.toWeb(child.stdin) as WritableStream<Uint8Array<ArrayBuffer>>);
    } catch {
      /* The child went away; the connection reports it. */
    }
  };
  void pump();
  const inbound =
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Node's duplex web adapters are typed against the DOM stream declarations.
    (Readable.toWeb(child.stdout) as ReadableStream<Uint8Array<ArrayBuffer>>).pipeThrough(tap('agent->client'));

  return {
    child,
    stream: ndJsonStream(outbound.writable, inbound),
    stderr: () => stderr,
    close: () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    },
  };
};
