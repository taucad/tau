import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { isRecord } from '@taucad/utils/schema';
import { acpAgentProfiles, spawnAcpAdapter } from '@taucad/host';

it('should preserve Codex summary identity through the shipped ACP adapter without promoting raw thoughts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tau-codex-summary-'));
  const require = createRequire(import.meta.url);
  const profile = acpAgentProfiles.find((entry) => entry.id === 'codex');
  if (profile?.package === undefined) {
    throw new Error('Missing Codex adapter');
  }
  /* eslint-disable @typescript-eslint/naming-convention -- Child environment names are external protocol keys. */
  const running = spawnAcpAdapter({
    adapter: {
      ...profile,
      spawnEnv: {
        ...profile.spawnEnv,
        CODEX_PATH: new URL('fixtures/codex-summary-server.ts', import.meta.url).pathname,
      },
      modulePath: join(dirname(require.resolve('@agentclientprotocol/codex-acp/package.json')), 'dist/index.js'),
    },
    cwd: home,
    // Only the fixture peer runs: no user credentials, model requests, or inherited config.
    environment: {
      PATH: dirname(process.execPath),
      HOME: home,
      CODEX_HOME: home,
      CODEX_PATH: new URL('fixtures/codex-summary-server.ts', import.meta.url).pathname,
    },
  });
  /* eslint-enable @typescript-eslint/naming-convention -- External environment keys end here. */
  const updates: Array<Record<string, unknown>> = [];
  const writer = running.stream.writable.getWriter();
  const reader = running.stream.readable.getReader();
  let nextId = 0;
  const request = async (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const id = ++nextId;
    await writer.write({ jsonrpc: '2.0', id, method, params });
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- ACP responses and notifications share one ordered stream.
      const { value: frame, done } = await reader.read();
      if (done) {
        throw new Error('Adapter exited before responding');
      }
      if (
        'method' in frame &&
        frame.method === 'session/update' &&
        isRecord(frame.params) &&
        isRecord(frame.params['update'])
      ) {
        updates.push(frame.params['update']);
      }
      if ('id' in frame && frame.id === id) {
        if ('error' in frame) {
          throw new Error(JSON.stringify(frame.error));
        }
        if ('result' in frame && isRecord(frame.result)) {
          return frame.result;
        }
      }
    }
  };
  const replayTimeout = setTimeout(() => {
    running.signal('SIGKILL');
  }, 15_000);
  try {
    await request('initialize', { protocolVersion: 1, clientCapabilities: {} });
    const session = await request('session/new', { cwd: home, mcpServers: [] });
    await request('session/prompt', {
      sessionId: session['sessionId'],
      prompt: [{ type: 'text', text: 'Replay reasoning fixture' }],
    });
    const thoughts = updates.filter((update) => update['sessionUpdate'] === 'agent_thought_chunk');
    expect(thoughts.map((thought) => (isRecord(thought['_meta']) ? thought['_meta']['codex'] : undefined))).toEqual([
      { reasoningSummary: { index: 0, text: '**Preparing a status comment**' } },
      undefined,
      { reasoningSummary: { index: 1, text: '**Checking ' } },
      { reasoningSummary: { index: 1, text: 'plot quality**' } },
      undefined,
      { reasoningSummary: { index: 1, text: '**Checking plot quality**' } },
      undefined,
    ]);
    expect(thoughts.filter((thought) => thought['messageId'] === 'streamed')).toHaveLength(5);
  } catch (error) {
    throw new Error(`ACP reasoning replay failed: ${running.stderr()}`, { cause: error });
  } finally {
    clearTimeout(replayTimeout);
    writer.releaseLock();
    reader.releaseLock();
    if (running.child.exitCode === null && running.child.signalCode === null) {
      const exited = once(running.child, 'exit');
      running.signal('SIGTERM');
      await exited;
    }
    await rm(home, { recursive: true, force: true });
  }
}, 20_000);
