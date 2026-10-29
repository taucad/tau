/* oxlint-disable tau-lint/no-time-unit-suffix -- `timeoutMs` and `durationMs` are the shell tool's wire fields (API guide). */
import { describe, expect, it, vi } from 'vitest';

import type { RpcFileSystem } from '@taucad/chat/rpc';
import type { ShellOutput } from '@taucad/chat';
import type { HostToolApproval, InterruptResolution, JsonValue } from '@taucad/agent-host';

import { createChatToolRegistry } from '#registry/tool-registry.js';
import type { ShellClient, ShellRunRequest } from '#registry/shell-tool.js';

const fileSystem: RpcFileSystem = Object.create(null) as RpcFileSystem;
const stream = { text: 'ok\n', bytes: 3, truncated: false, undecodable: false };
const exited: ShellOutput = { status: 'completed', exitCode: 0, stdout: stream, stderr: stream, durationMs: 2 };

const fakeShell = (output: ShellOutput = exited) => {
  const requests: ShellRunRequest[] = [];
  const client: ShellClient = {
    identity: { platform: 'linux', kind: 'bash', shellVersion: '5.2.21(1)-release' },
    run: vi.fn(async (request: ShellRunRequest) => {
      requests.push(request);
      return output;
    }),
  };
  return { client, requests };
};

const registryWith = (shell?: ShellClient) =>
  createChatToolRegistry({ fileSystemFor: () => fileSystem, testingEnabled: false, ...(shell ? { shell } : {}) });

const call = (input: unknown, extra: { runId?: string; approve?: HostToolApproval; signal?: AbortSignal } = {}) => ({
  toolCallId: 'call-shell-1',
  toolName: 'shell',
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- tests exercise unvalidated JSON shapes.
  input: input as JsonValue,
  signal: extra.signal ?? new AbortController().signal,
  ...(extra.runId === undefined ? {} : { runId: extra.runId }),
  ...(extra.approve === undefined ? {} : { approve: extra.approve }),
});

describe('shell registration (D1)', () => {
  it('omits shell without a client, as the browser registry does, and refuses a forged call', async () => {
    const registry = registryWith();

    expect(registry.list().map((tool) => tool.name)).not.toContain('shell');
    await expect(registry.invoke(call({ command: 'id' }, { runId: 'run-1' }))).resolves.toMatchObject({
      content: { errorCode: 'TOOL_NOT_FOUND' },
      isError: true,
    });
  });

  it('lists shell with a client: sequential, a strict schema and the host language and major version', () => {
    const definition = registryWith(fakeShell().client)
      .list()
      .find((tool) => tool.name === 'shell');

    expect(definition).toMatchObject({ executionMode: 'sequential' });
    expect(definition?.description).toContain('On this Linux host the shell is Bash 5.2');
    expect(definition?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['command'],
    });
    expect(Object.keys((definition!.inputSchema as { properties: Record<string, unknown> }).properties)).toStrictEqual([
      'command',
      'cwd',
      'timeoutMs',
      'access',
    ]);
  });

  it('names PowerShell on a Windows host', () => {
    const { client } = fakeShell();
    const definition = registryWith({
      ...client,
      identity: { platform: 'win32', kind: 'powershell', shellVersion: '7.4.6' },
    })
      .list()
      .find((tool) => tool.name === 'shell');

    expect(definition?.description).toContain('On this Windows host the shell is PowerShell 7.4');
  });
});

describe('shell invocation', () => {
  it('hands the client the trusted run, call id, signal and approval with the parsed input', async () => {
    const { client, requests } = fakeShell();
    const approve: HostToolApproval = Object.assign(
      async () => ({ interruptId: 'i-1', outcome: 'approved' }) satisfies InterruptResolution,
      {
        recall: async () => undefined,
      },
    );
    const result = await registryWith(client).invoke(
      call(
        { command: 'npm view simplex-noise version', access: { reason: 'Check it.', domains: ['Registry.NPMjs.org'] } },
        { runId: 'run-1', approve },
      ),
    );

    expect(result).toMatchObject({ isError: false, content: { status: 'completed', exitCode: 0 } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      runId: 'run-1',
      toolCallId: 'call-shell-1',
      approve,
      input: { command: 'npm view simplex-noise version', access: { domains: ['registry.npmjs.org'] } },
    });
  });

  it.each<[string, ShellOutput]>([
    ['a nonzero exit', { status: 'completed', exitCode: 1, stdout: stream, stderr: stream, durationMs: 1 }],
    ['a timeout', { status: 'timed-out', timeoutMs: 1000, stdout: stream, stderr: stream, durationMs: 1000 }],
    ['a refusal', { status: 'not-started', code: 'access-denied', message: 'Denied.' }],
  ])('returns %s as an error result', async (_name, output) => {
    await expect(
      registryWith(fakeShell(output).client).invoke(call({ command: 'false' }, { runId: 'run-1' })),
    ).resolves.toMatchObject({
      isError: true,
      content: output as unknown as JsonValue,
    });
  });

  it.each([
    [{ command: 'ls', argv: ['ls'] }],
    [{ command: '' }],
    [{ command: 'a\u0000b' }],
    [{ command: 'ls', cwd: '../other' }],
    [{ command: 'ls', timeoutMs: 600_001 }],
    [{ command: 'ls', permissions: 'bypass' }],
    [{ command: 'curl x', access: { domains: ['example.com'] } }],
    [{ command: 'curl x', access: { reason: 'r' } }],
    [{ command: 'curl x', access: { reason: 'r', domains: ['localhost'] } }],
    [{ command: 'curl x', access: { reason: 'r', domains: ['*.example.com'] } }],
    [{ command: 'curl x', access: { reason: 'r', domains: ['10.0.0.1'] } }],
    [{ command: 'cat', access: { reason: 'r', read: ['relative/path'] } }],
  ])('refuses %j before the client sees it', async (input) => {
    const { client, requests } = fakeShell();

    await expect(registryWith(client).invoke(call(input, { runId: 'run-1' }))).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' },
    });
    expect(requests).toStrictEqual([]);
  });

  it('refuses a call that belongs to no run instead of defaulting to the live project (F5)', async () => {
    const { client, requests } = fakeShell();

    await expect(registryWith(client).invoke(call({ command: 'pwd' }))).resolves.toMatchObject({
      isError: true,
      content: { status: 'not-started', code: 'checkout-unavailable' },
    });
    expect(requests).toStrictEqual([]);
  });

  it('lets a pausing approval end the attempt instead of reporting a tool error', async () => {
    const controller = new AbortController();
    const client: ShellClient = {
      identity: { platform: 'linux', kind: 'bash', shellVersion: '5.2' },
      run: async () => {
        controller.abort(new Error('paused for approval'));
        throw new Error('approval interrupted the attempt');
      },
    };

    await expect(
      registryWith(client).invoke(call({ command: 'ls' }, { runId: 'run-1', signal: controller.signal })),
    ).rejects.toThrow('paused for approval');
  });
});

describe('a shell that probes after the registry is built', () => {
  it('offers shell only once the source answers, and refuses calls until then', async () => {
    const { client } = fakeShell();
    const probe: { ready?: ShellClient } = {};
    const registry = createChatToolRegistry({
      fileSystemFor: () => fileSystem,
      testingEnabled: false,
      shell: () => probe.ready,
    });

    expect(registry.list().map((tool) => tool.name)).not.toContain('shell');
    await expect(registry.invoke(call({ command: 'id' }, { runId: 'run-1' }))).resolves.toMatchObject({
      content: { errorCode: 'TOOL_NOT_FOUND' },
    });
    probe.ready = client;
    expect(registry.list().map((tool) => tool.name)).toContain('shell');
    await expect(registry.invoke(call({ command: 'id' }, { runId: 'run-1' }))).resolves.toMatchObject({
      isError: false,
    });
  });
});
