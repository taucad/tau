/* eslint-disable @typescript-eslint/naming-convention -- fixtures retain native environment and protocol names. */
import type * as FileSystem from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpAdapter } from '#acp/registry.js';
import { createGrokPermissionReadback } from '#acp/grok-permission-readback.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, realpath: vi.fn(actual.realpath) };
});

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});
const request = (name = 'tau__ask_questions'): RequestPermissionRequest => ({
  sessionId: 'session',
  toolCall: { toolCallId: 'call', kind: 'other', rawInput: { tool_name: name } },
  options: [{ optionId: 'always-allow', kind: 'allow_always', name: 'Always allow' }],
});
const encoded = (value: string): string =>
  encodeURIComponent(value).replaceAll(/[!'()*]/gu, (c) => `%${c.codePointAt(0)!.toString(16).toUpperCase()}`);
const fixture = async (version = '1.0.52') => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-grok-readback-')));
  roots.push(root);
  const cwd = join(root, 'workspace');
  const home = join(root, 'home');
  const grokHome = join(home, '.grok');
  const cli = join(root, 'grok');
  await Promise.all([mkdir(cwd), mkdir(grokHome, { recursive: true })]);
  await writeFile(cli, `#!/bin/sh\nprintf 'grok ${version} (0920c8169e27)\\n'\n`);
  await chmod(cli, 0o700);
  const adapter: AcpAdapter = {
    id: 'grok',
    displayName: 'Grok',
    cli,
    args: ['--no-auto-update', 'agent', 'stdio'],
    configEnv: ['GROK_HOME'],
    spawnEnv: { GROK_HOME: grokHome, HOME: home },
  };
  const pathFor = (scope: string) => join(grokHome, 'sessions', encoded(scope), 'permission.toml');
  const save = async (text: string, scope = cwd) => {
    const path = pathFor(scope);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };
  return { root, cwd, home, grokHome, cli, adapter, save, pathFor };
};

describe('Grok provider permission settings readback', () => {
  it('should observe an exact newly present rule without claiming effective permission or exposing config', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    expect(prepared).toBeDefined();
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]\nsecret = "do-not-return"');
    expect(await prepared?.observe()).toEqual({
      version: 1,
      provider: 'grok',
      toolCallId: 'call',
      optionId: 'always-allow',
      requestedScope: 'persistent',
      stored: 'present',
      effective: 'unknown',
      preexisting: false,
      observation: 'permission-file-readback',
      layerKind: 'project',
      reason: 'policy-observed',
    });
  });
  it('should distinguish preexisting rules and exact denial', async () => {
    const f = await fixture();
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]');
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]\ndisallowed_mcp_tools = ["tau__ask_questions"]');
    expect(await prepared?.observe()).toMatchObject({
      stored: 'present',
      effective: 'overridden',
      preexisting: true,
      reason: 'policy-overridden',
    });
  });
  it('should not confuse a broad server grant or another tool with the requested exact rule', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    await f.save('allowed_mcp_servers = ["tau"]\nallowed_mcp_tools = ["tau__another"]');
    expect(await prepared?.observe()).toMatchObject({
      stored: 'absent',
      effective: 'unknown',
      reason: 'policy-absent',
    });
  });
  it.each(['allowed_mcp_tools = [', 'allowed_mcp_tools = "tau__ask_questions"', `#${'x'.repeat(70_000)}`])(
    'should return unknown for malformed or oversized settings: %#',
    async (text) => {
      const f = await fixture();
      const prepared = await createGrokPermissionReadback(f)?.prepare(request());
      await f.save(text);
      expect(await prepared?.observe()).toMatchObject({ stored: 'unknown', reason: 'config-read-failed' });
    },
  );
  it('should reject a final symlink without reading its target', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    const target = join(f.root, 'private');
    await writeFile(target, 'allowed_mcp_tools = ["tau__ask_questions"]');
    await mkdir(dirname(f.pathFor(f.cwd)), { recursive: true });
    await symlink(target, f.pathFor(f.cwd));
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown' });
  });
  it('should reject a symlinked sessions directory', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    const target = join(f.root, 'elsewhere');
    await mkdir(target);
    await symlink(target, join(f.grokHome, 'sessions'));
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown' });
  });
  it('should use the repository rule ahead of the exact-cwd legacy file', async () => {
    const f = await fixture();
    await execute('git', ['init', '-q', f.cwd]);
    const nested = join(f.cwd, 'nested');
    await mkdir(nested);
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]', nested);
    const reader = createGrokPermissionReadback({ ...f, cwd: nested });
    const legacy = await reader?.prepare(request());
    expect(await legacy?.observe()).toMatchObject({ stored: 'present', preexisting: true });
    await f.save('allowed_mcp_tools = []');
    const canonical = await reader?.prepare(request());
    expect(await canonical?.observe()).toMatchObject({ stored: 'absent', preexisting: false });
  });
  it('should not fall back to legacy when the canonical file is unreadable', async () => {
    const f = await fixture();
    await execute('git', ['init', '-q', f.cwd]);
    const nested = join(f.cwd, 'nested');
    await mkdir(nested);
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]', nested);
    await f.save('invalid = [');
    const prepared = await createGrokPermissionReadback({ ...f, cwd: nested })?.prepare(request());
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown', preexisting: 'unknown' });
  });
  it('should exclude a home dotfiles repository from project scope', async () => {
    const f = await fixture();
    await execute('git', ['init', '-q', f.home]);
    const cwd = join(f.home, 'project');
    await mkdir(cwd);
    await f.save('allowed_mcp_tools = ["tau__ask_questions"]', cwd);
    const prepared = await createGrokPermissionReadback({ ...f, cwd })?.prepare(request());
    expect(await prepared?.observe()).toMatchObject({ stored: 'present' });
  });
  it('should encode reserved characters exactly and refuse hashed long-path namespaces', async () => {
    const f = await fixture();
    const cwd = join(f.root, "project -_.~!'()*é");
    await mkdir(cwd);
    const expectedDirectory = `${encoded(f.root)}%2Fproject%20-_.~%21%27%28%29%2A%C3%A9`;
    const expectedPath = join(f.grokHome, 'sessions', expectedDirectory, 'permission.toml');
    await mkdir(dirname(expectedPath), { recursive: true });
    await writeFile(expectedPath, 'allowed_mcp_tools = ["tau__ask_questions"]');
    const reserved = await createGrokPermissionReadback({ ...f, cwd })?.prepare(request());
    expect(await reserved?.observe()).toMatchObject({
      stored: 'present',
    });
    const long = join(f.root, 'x'.repeat(160), 'y'.repeat(100));
    await mkdir(long, { recursive: true });
    expect(await createGrokPermissionReadback({ ...f, cwd: long })?.prepare(request())).toBeUndefined();
  });
  it.each(['tau___ask', 'tau__ask__other', '../tau__ask', 'shell', 'tau__', 'x'.repeat(257)])(
    'should leave unqualified tool identities unavailable: %s',
    async (name) => {
      const f = await fixture();
      expect(await createGrokPermissionReadback(f)?.prepare(request(name))).toBeUndefined();
    },
  );
  it('should leave unsupported versions, namespaces, kinds and selections unavailable', async () => {
    const f = await fixture('1.0.53');
    expect(await createGrokPermissionReadback(f)?.prepare(request())).toBeUndefined();
    const supported = await fixture();
    const reader = createGrokPermissionReadback(supported);
    expect(await reader?.prepare({ ...request(), _meta: { clientIdentifier: 'other' } })).toBeUndefined();
    expect(
      await reader?.prepare({ ...request(), toolCall: { ...request().toolCall, kind: 'execute' } }),
    ).toBeUndefined();
    expect(await reader?.prepare({ ...request(), options: [] })).toBeUndefined();
  });
  it('should terminate an aborted observation with an honest unknown result', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const prepared = await createGrokPermissionReadback({ ...f, signal: controller.signal })?.prepare(request());
    controller.abort();
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown', reason: 'request-cancelled' });
  });
  it('should probe the actual CLI once with only its filtered environment', async () => {
    const f = await fixture();
    vi.stubEnv('TAU_HOST_AGENT_TOKEN', 'never-forward');
    vi.stubEnv('OPENAI_API_KEY', 'never-forward');
    vi.stubEnv('GROK_HOME', join(f.root, 'wrong-home'));
    const marker = join(f.root, 'probes');
    await writeFile(
      f.cli,
      `#!/bin/sh
[ -z "$TAU_HOST_AGENT_TOKEN" ] && [ -z "$OPENAI_API_KEY" ] || exit 9
[ "$1" = '--no-auto-update' ] && [ "$2" = '--version' ] || exit 10
printf 'probe\n' >> '${marker}'
printf 'grok 1.0.52 (0920c8169e27)\n'
`,
    );
    const reader = createGrokPermissionReadback(f);
    expect(await reader?.prepare(request())).toBeDefined();
    expect(await reader?.prepare(request())).toBeDefined();
    expect(await readFile(marker, 'utf8')).toBe('probe\n');
  });
  it('should bound a stalled native version probe', async () => {
    const f = await fixture();
    await writeFile(f.cli, '#!/bin/sh\nexec sleep 30\n');
    const start = Date.now();
    expect(await createGrokPermissionReadback(f)?.prepare(request())).toBeUndefined();
    expect(Date.now() - start).toBeLessThan(5000);
  }, 7000);
  it('should cancel an outstanding native version probe', async () => {
    const f = await fixture();
    await writeFile(f.cli, '#!/bin/sh\nexec sleep 30\n');
    const controller = new AbortController();
    const result = createGrokPermissionReadback({ ...f, signal: controller.signal })?.prepare(request());
    controller.abort();
    expect(await result).toBeUndefined();
  });
  it('should refuse noncanonical cwd aliases without guessing the namespace', async () => {
    const f = await fixture();
    const cwd = join(f.root, 'alias');
    await symlink(f.cwd, cwd);
    expect(await createGrokPermissionReadback({ ...f, cwd })?.prepare(request())).toBeUndefined();
  });
  it('should reject a FIFO rather than block or parse it', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    await mkdir(dirname(f.pathFor(f.cwd)), { recursive: true });
    await execute('mkfifo', [f.pathFor(f.cwd)]);
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown' });
  });
  it('should reject malformed UTF8 rather than silently replacing bytes in a permission name', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(request());
    await f.save('');
    await writeFile(f.pathFor(f.cwd), new Uint8Array([255, 254, 128]));
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown' });
  });
  it('should decline custom CLI configuration or namespace overrides', async () => {
    const f = await fixture();
    const adapter: AcpAdapter = { ...f.adapter, args: ['--no-auto-update', '--config', 'elsewhere', 'agent', 'stdio'] };
    expect(createGrokPermissionReadback({ ...f, adapter })).toBeUndefined();
    expect(
      createGrokPermissionReadback({ ...f, adapter: { ...f.adapter, args: ['--no-auto-update agent stdio'] } }),
    ).toBeUndefined();
  });

  it('should bound qualification when filesystem canonicalization never resolves', async () => {
    const f = await fixture();
    let release: ((value: string) => void) | undefined;
    const blocked = new Promise<string>((resolve) => {
      release = resolve;
    });
    vi.mocked(realpath).mockImplementationOnce(async () => blocked);
    try {
      expect(await createGrokPermissionReadback(f)?.prepare(request())).toBeUndefined();
    } finally {
      release?.(f.home);
    }
  }, 5000);
  it('should decline relative HOME rather than resolving it against the host cwd', async () => {
    const f = await fixture();
    const adapter: AcpAdapter = { ...f.adapter, spawnEnv: { ...f.adapter.spawnEnv, HOME: '.' } };
    expect(await createGrokPermissionReadback({ ...f, adapter })?.prepare(request())).toBeUndefined();
  });
});

const shellRequest = (command = 'python3 -c "print(42)"'): RequestPermissionRequest => ({
  ...request(),
  toolCall: { toolCallId: 'shell-call', kind: 'execute', rawInput: { variant: 'Bash', command, is_background: false } },
});

describe('Grok exact shell preference readback', () => {
  it('should observe a persisted exact command without claiming effective approval', async () => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(shellRequest());
    expect(prepared).toBeDefined();
    await f.save(`allowed_bash_commands = ['python3 -c "print(42)"']`);
    expect(await prepared?.observe()).toMatchObject({
      toolCallId: 'shell-call',
      stored: 'present',
      preexisting: false,
      effective: 'unknown',
      reason: 'policy-observed',
    });
  });
  it.each([
    'allow_bash_execute = true',
    'allowed_bash_globs = ["python3 *"]',
    `allowed_mcp_tools = ['python3 -c "print(42)"']`,
    `allowed_bash_commands = ['python3  -c "print(42)"']`,
  ])('should not claim the exact command is saved for broader or different settings: %s', async (settings) => {
    const f = await fixture();
    const prepared = await createGrokPermissionReadback(f)?.prepare(shellRequest());
    await f.save(settings);
    expect(await prepared?.observe()).toMatchObject({ stored: 'absent', effective: 'unknown' });
  });
  it('should preserve preexisting and denied command observations', async () => {
    const f = await fixture();
    await f.save(`allowed_bash_commands = ['python3 -c "print(42)"']`);
    const prepared = await createGrokPermissionReadback(f)?.prepare(shellRequest());
    await f.save(
      `allowed_bash_commands = ['python3 -c "print(42)"']\ndisallowed_bash_commands = ['python3 -c "print(42)"']`,
    );
    expect(await prepared?.observe()).toMatchObject({ stored: 'present', preexisting: true, effective: 'overridden' });
  });
  it.each([
    { variant: 'Python', command: 'python3 -c "print(42)"', is_background: false },
    { variant: 'Bash', command: '', is_background: false },
    { variant: 'Bash', command: 'echo\u0000bad', is_background: false },
    { variant: 'Bash', command: 'python3 -c "print(42)"', is_background: true },
  ])('should leave unqualified shell inputs unverified: %j', async (rawInput) => {
    const f = await fixture();
    const input = shellRequest();
    expect(
      await createGrokPermissionReadback(f)?.prepare({ ...input, toolCall: { ...input.toolCall, rawInput } }),
    ).toBeUndefined();
  });
  it('should leave unreadable or cancelled shell settings unknown', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const prepared = await createGrokPermissionReadback({ ...f, signal: controller.signal })?.prepare(shellRequest());
    await f.save('allowed_bash_commands = 42');
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown', reason: 'config-read-failed' });
    controller.abort();
    expect(await prepared?.observe()).toMatchObject({ stored: 'unknown', reason: 'request-cancelled' });
  });
});
