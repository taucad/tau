/**
 * The credential fence (X6) and the stdio wire, proved against the fake agent.
 *
 * SP-4's most expensive finding was that a leaked `CLAUDE_CODE_*` variable
 * silently re-pointed the adapter at the *host's* auth channel — a failure that
 * looks like a vendor billing error, not like a Tau defect. The allowlist below
 * is the fix, and this is the test that keeps it honest.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { Client } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it } from 'vitest';

import { acpAdapterEnvironment, spawnAcpAdapter } from '#acp/spawn.js';
import type { AcpAdapter, AcpWireFrame } from '#acp/index.js';

const fakeAgent: AcpAdapter = {
  id: 'codex',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
};

const roots: string[] = [];
const spawned: Array<{ close(): void }> = [];

afterEach(async () => {
  for (const adapter of spawned.splice(0)) {
    adapter.close();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const branch = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-acp-spawn-'));
  roots.push(root);
  return root;
};

describe('acpAdapterEnvironment', () => {
  it('passes only allowlisted names and the adapter’s own config directory', () => {
    const environment = acpAdapterEnvironment(
      {
        PATH: '/usr/bin',
        HOME: '/home/tau',
        XDG_CONFIG_HOME: '/home/tau/.config',
        CODEX_HOME: '/home/tau/.codex',
        CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/socket',
        ANTHROPIC_API_KEY: 'sk-should-never-travel',
        OPENAI_API_KEY: 'sk-should-never-travel',
        TAU_HOST_AGENT_TOKEN: 'admission-secret',
        NODE_OPTIONS: '--import=./attacker.mjs',
        AI_AGENT: 'yes',
        BAGGAGE: 'trace',
      },
      { configEnv: ['CODEX_HOME'] },
    );

    expect(environment).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/tau',
      XDG_CONFIG_HOME: '/home/tau/.config',
      CODEX_HOME: '/home/tau/.codex',
    });
  });

  it('passes the user’s own proxy and CA settings, and still no credential', () => {
    /* Operator ruling 2026-09-03: without these an adapter behind a corporate
     * proxy cannot reach its vendor at all, and a proxy URL is a network
     * setting rather than a secret the X6 fence exists to hold back. */
    const environment = acpAdapterEnvironment(
      {
        HTTP_PROXY: 'http://proxy.corp:3128',
        HTTPS_PROXY: 'http://proxy.corp:3128',
        NO_PROXY: 'localhost,127.0.0.1',
        http_proxy: 'http://proxy.corp:3128',
        https_proxy: 'http://proxy.corp:3128',
        no_proxy: 'localhost',
        SSL_CERT_FILE: '/etc/ssl/corp.pem',
        SSL_CERT_DIR: '/etc/ssl/certs',
        NODE_EXTRA_CA_CERTS: '/etc/ssl/corp-root.pem',
        ANTHROPIC_AUTH_TOKEN: 'sk-should-never-travel',
        TAU_HOST_AGENT_TOKEN: 'admission-secret',
        AWS_SECRET_ACCESS_KEY: 'should-never-travel',
      },
      { configEnv: [] },
    );

    expect(Object.keys(environment).toSorted()).toEqual([
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NODE_EXTRA_CA_CERTS',
      'NO_PROXY',
      'SSL_CERT_DIR',
      'SSL_CERT_FILE',
      'http_proxy',
      'https_proxy',
      'no_proxy',
    ]);
  });
});

describe('spawnAcpAdapter', () => {
  it('drives a full ACP turn in the branch directory with a scrubbed environment', async () => {
    const cwd = await branch();
    const frames: AcpWireFrame[] = [];
    const adapter = spawnAcpAdapter({
      adapter: fakeAgent,
      cwd,
      environment: { ...process.env, ANTHROPIC_API_KEY: 'sk-should-never-travel', TAU_HOST_AGENT_TOKEN: 'secret' },
      onFrame: (frame) => frames.push(frame),
    });
    spawned.push(adapter);

    const chunks: string[] = [];
    const handler: Client = {
      sessionUpdate: (params) => {
        const { update } = params;
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
          chunks.push(update.content.text);
        }
      },
      requestPermission: () => ({ outcome: { outcome: 'selected', optionId: 'allow' } }),
    };
    /* oxlint-disable-next-line typescript/no-deprecated -- the long-lived
     * connection object is the shape SP-4 proved and the shape an always-on run
     * needs; the replacement scopes the connection to one callback. */
    const connection = new ClientSideConnection(() => handler, adapter.stream);

    await connection.initialize({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
    const session = await connection.newSession({ cwd, mcpServers: [] });
    const result = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'write the file' }],
    });

    expect(result.stopReason).toBe('end_turn');
    // Cwd confinement: the agent's own write landed in the branch, not the workspace.
    await expect(readFile(join(cwd, 'hello.txt'), 'utf8')).resolves.toBe('write the file');

    // Env scrub: the fake echoes the variable names it was actually handed.
    const echoed = JSON.parse(chunks[0] ?? '{}') as { cwd?: string; env?: readonly string[] };
    expect(echoed.cwd).toBe(cwd);
    expect(echoed.env).not.toContain('ANTHROPIC_API_KEY');
    expect(echoed.env).not.toContain('TAU_HOST_AGENT_TOKEN');
    expect(echoed.env).toContain('PATH');

    // Wire log: both directions were observed, and no credential is in them.
    expect(frames.some((frame) => frame.direction === 'client->agent')).toBe(true);
    expect(frames.some((frame) => frame.direction === 'agent->client')).toBe(true);
    expect(frames.some((frame) => frame.frame.includes('sk-should-never-travel'))).toBe(false);
  }, 30_000);
});
