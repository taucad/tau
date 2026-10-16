/* eslint-disable @typescript-eslint/naming-convention -- Native Grok TOML keys and environment variables retain their provider spelling. */
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import type { ProviderPermissionObservation } from '@taucad/agent-host/wire';
import { parse } from 'smol-toml';
import { z } from 'zod';
import type { AcpAdapter } from '#acp/registry.js';
import { acpAdapterEnvironment } from '#acp/spawn.js';

const execute = promisify(execFile);
const maximumBytes = 65_536;
const probeTimeout = 2000;
const permissions = z.object({
  allowed_mcp_tools: z.array(z.string()).default([]),
  disallowed_mcp_tools: z.array(z.string()).default([]),
  allowed_bash_commands: z.array(z.string()).default([]),
  disallowed_bash_commands: z.array(z.string()).default([]),
});
const rawInput = z.object({ tool_name: z.string().min(1).max(256) });
const shellInput = z.object({
  variant: z.literal('Bash'),
  command: z
    .string()
    .min(1)
    .max(32_768)
    .refine((command) => !command.includes('\0')),
  is_background: z.literal(false),
});

type Snapshot =
  | {
      state: 'present';
      mcp: { allowed: readonly string[]; denied: readonly string[] };
      shell: { allowed: readonly string[]; denied: readonly string[] };
    }
  | { state: 'missing' | 'unknown' };
type Location = { home: string; directory: string; legacy?: string };
type PreparedObservation = { observe(): Promise<ProviderPermissionObservation> };

const isAborted = (signal?: AbortSignal): boolean => signal?.aborted === true;
const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const encodedDirectory = (cwd: string): string | undefined => {
  const encoded = encodeURIComponent(cwd).replaceAll(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
  );
  // Native Grok hashes longer names with BLAKE3. Unknown is safer than scanning or guessing.
  return encoded.length <= 255 ? encoded : undefined;
};

const directoryIdentity = async (path: string): Promise<string> => {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Unsupported settings directory');
  }
  return `${stat.dev}:${stat.ino}`;
};

const readSettings = async (home: string, directory: string): Promise<Snapshot> => {
  const parents = [home, join(home, 'sessions'), join(home, 'sessions', directory)];
  let opened = false;
  try {
    // Check outward from the canonical root: never follow a symlink to inspect its descendants.
    const identities = [
      await directoryIdentity(home),
      await directoryIdentity(join(home, 'sessions')),
      await directoryIdentity(join(home, 'sessions', directory)),
    ];
    const path = join(home, 'sessions', directory, 'permission.toml');
    // oxlint-disable-next-line no-bitwise -- Node requires a bitmask for nofollow/nonblocking open flags.
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    opened = true;
    try {
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.size > BigInt(maximumBytes)) {
        return { state: 'unknown' };
      }
      const buffer = new Uint8Array(maximumBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const after = await file.stat({ bigint: true });
      const current = await lstat(path, { bigint: true });
      const remaining = await Promise.all(parents.map(async (parent) => directoryIdentity(parent)));
      if (
        bytesRead !== Number(before.size) ||
        bytesRead > maximumBytes ||
        before.dev !== current.dev ||
        before.ino !== current.ino ||
        current.isSymbolicLink() ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        after.mtimeNs !== current.mtimeNs ||
        after.ctimeNs !== current.ctimeNs ||
        identities.some((identity, index) => identity !== remaining[index])
      ) {
        return { state: 'unknown' };
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
      const settings = permissions.parse(parse(text));
      return {
        state: 'present',
        mcp: { allowed: settings.allowed_mcp_tools, denied: settings.disallowed_mcp_tools },
        shell: { allowed: settings.allowed_bash_commands, denied: settings.disallowed_bash_commands },
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    return { state: !opened && missing(error) ? 'missing' : 'unknown' };
  }
};

const bounded = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T | undefined> => {
  if (signal?.aborted) {
    return undefined;
  }
  // A hung local filesystem must not hold a provider permission response open.
  const controller = new AbortController();
  const deadline = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
  let abort: (() => void) | undefined;
  const cancelled = new Promise<undefined>((resolve) => {
    abort = () => {
      resolve(undefined);
    };
    deadline.addEventListener('abort', abort, { once: true });
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, probeTimeout);
  try {
    return await Promise.race([operation(deadline), cancelled]);
  } finally {
    clearTimeout(timer);
    if (abort) {
      deadline.removeEventListener('abort', abort);
    }
  }
};

const snapshot = async (location: Location, signal?: AbortSignal): Promise<Snapshot> => {
  if (signal?.aborted) {
    return { state: 'unknown' };
  }
  const read = async (): Promise<Snapshot> => {
    const primary = await readSettings(location.home, location.directory);
    return primary.state === 'missing' && location.legacy !== undefined
      ? readSettings(location.home, location.legacy)
      : primary;
  };
  return (await bounded(async () => read(), signal)) ?? { state: 'unknown' };
};

const resolveLocation = async (
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<Location | undefined> => {
  if (process.platform === 'win32' || !isAbsolute(cwd) || !environment['HOME'] || !isAbsolute(environment['HOME'])) {
    return undefined;
  }
  try {
    const home = await realpath(environment['HOME']);
    const canonicalCwd = await realpath(cwd);
    // Native no-repository scope preserves cwd spelling; aliases are deliberately unqualified.
    if (canonicalCwd !== resolvePath(cwd)) {
      return undefined;
    }
    let scope = cwd;
    try {
      const result = await execute('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
        env: { ...environment, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
        timeout: probeTimeout,
        maxBuffer: 4096,
        signal,
      });
      const root = await realpath(result.stdout.trim());
      if (root !== home) {
        scope = root;
      }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('stderr' in error) ||
        typeof error.stderr !== 'string' ||
        !error.stderr.includes('not a git repository (or any of the parent directories): .git')
      ) {
        return undefined;
      }
    }
    const directory = encodedDirectory(scope);
    const legacy = encodedDirectory(cwd);
    if (directory === undefined || legacy === undefined || signal?.aborted) {
      return undefined;
    }
    const grokHome = environment['GROK_HOME'] ?? join(home, '.grok');
    if (!isAbsolute(grokHome)) {
      return undefined;
    }
    return { home: await realpath(grokHome), directory, ...(scope === cwd ? {} : { legacy }) };
  } catch {
    return undefined;
  }
};

/**
 * Read an exact Grok 1.0.52 project preference after a correlated persistent selection.
 * The provider file remains user/agent editable: this is settings observation, never authority,
 * proof of a causal write, or proof that the active policy will suppress another request.
 * @internal
 * @param options - Native adapter, its session cwd and lifetime cancellation signal.
 * @returns A narrow reader, or undefined for an unsupported adapter.
 */
export const createGrokPermissionReadback = (options: {
  adapter: AcpAdapter;
  cwd: string;
  signal?: AbortSignal;
}): { prepare(request: RequestPermissionRequest): Promise<PreparedObservation | undefined> } | undefined => {
  const { adapter, cwd, signal } = options;
  if (adapter.id !== 'grok' || adapter.package !== undefined) {
    return undefined;
  }
  const acceptedArguments = [
    ['--no-auto-update', 'agent', 'stdio'],
    ['--no-auto-update', 'agent', '--no-leader', 'stdio'],
    ['--no-auto-update', '--permission-mode', 'default', 'agent', 'stdio'],
    ['--no-auto-update', '--permission-mode', 'default', 'agent', '--no-leader', 'stdio'],
  ];
  if (
    !acceptedArguments.some(
      (candidate) =>
        candidate.length === adapter.args.length &&
        candidate.every((argument, index) => argument === adapter.args[index]),
    )
  ) {
    return undefined;
  }
  const environment = acpAdapterEnvironment(process.env, adapter);
  let qualified: Promise<Location | undefined> | undefined;
  const qualify = async (deadline: AbortSignal): Promise<Location | undefined> => {
    try {
      const version = await execute(adapter.cli, ['--no-auto-update', '--version'], {
        cwd,
        env: environment,
        timeout: probeTimeout,
        maxBuffer: 1024,
        signal: deadline,
      });
      if (!/^grok 1\.0\.52 \([a-f\d]+\)\s*$/u.test(version.stdout)) {
        return undefined;
      }
      return await resolveLocation(cwd, environment, deadline);
    } catch {
      return undefined;
    }
  };
  return {
    async prepare(request) {
      const input = rawInput.safeParse(request.toolCall.rawInput);
      const shell = shellInput.safeParse(request.toolCall.rawInput);
      const family = request.toolCall.kind === 'execute' && shell.success ? 'shell' : 'mcp';
      const subject = family === 'shell' && shell.success ? shell.data.command : input.data?.tool_name;
      if (
        signal?.aborted === true ||
        (family === 'mcp' && (request.toolCall.kind !== 'other' || !input.success)) ||
        subject === undefined ||
        request._meta?.['clientIdentifier'] !== undefined ||
        !request.options.some((option) => option.optionId === 'always-allow' && option.kind === 'allow_always')
      ) {
        return undefined;
      }

      const { toolCallId } = request.toolCall;
      if (toolCallId.length === 0 || toolCallId.length > 512) {
        return undefined;
      }
      const boundary = subject.indexOf('__');
      if (
        family === 'mcp' &&
        (!/^[A-Za-z_][\w-]*$/u.test(subject) ||
          boundary < 1 ||
          boundary + 2 === subject.length ||
          subject.includes('__', boundary + 1))
      ) {
        return undefined;
      }
      qualified ??= bounded(qualify, signal);
      const location = await qualified;
      if (!location || isAborted(signal)) {
        return undefined;
      }
      const before = await snapshot(location, signal);
      const preexisting =
        before.state === 'unknown' ? 'unknown' : before.state === 'present' && before[family].allowed.includes(subject);
      return {
        async observe() {
          const after = await snapshot(location, signal);
          const stored =
            after.state === 'unknown'
              ? 'unknown'
              : after.state === 'present' && after[family].allowed.includes(subject)
                ? 'present'
                : 'absent';
          const denied = after.state === 'present' && after[family].denied.includes(subject);
          return {
            version: 1,
            provider: 'grok',
            toolCallId,
            optionId: 'always-allow',
            requestedScope: 'persistent',
            stored,
            effective: denied ? 'overridden' : 'unknown',
            preexisting,
            observation: 'permission-file-readback',
            layerKind: 'project',
            reason: signal?.aborted
              ? 'request-cancelled'
              : stored === 'unknown'
                ? 'config-read-failed'
                : denied
                  ? 'policy-overridden'
                  : stored === 'present'
                    ? 'policy-observed'
                    : 'policy-absent',
          };
        },
      };
    },
  };
};
