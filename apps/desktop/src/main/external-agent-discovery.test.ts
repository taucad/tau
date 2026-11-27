import { acpAgentProfiles } from '@taucad/host';
import type { AcpAdapter, AcpAdapterRefusal, AcpAgentDiscovery, AcpAgentProfile } from '@taucad/host';
import { describe, expect, it, vi } from 'vitest';

import type { DiagnosticsLog } from '#main/diagnostics.js';
import { createExternalAgentDiscovery, externalAgentRediscoveryMilliseconds } from '#main/external-agent-discovery.js';
import type { ExternalAgentDiscoverOptions } from '#main/external-agent-discovery.js';

const resolveFrom = 'file:///app/main.js';

const profileFor = (id: string): AcpAgentProfile => {
  const profile = acpAgentProfiles.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new Error(`No reviewed profile ${id}`);
  }
  return profile;
};

const adapterFor = (id: string): AcpAdapter => {
  const profile = profileFor(id);
  return profile.package === undefined
    ? { ...profile, modulePath: undefined }
    : { ...profile, modulePath: `/adapters/${id}.js` };
};

const refusalOf = (id: string, message = `${id} --version timed out after 10000 ms`): AcpAdapterRefusal => ({
  id,
  code: 'EXTERNAL_AGENT_UNAVAILABLE',
  message,
});

/** A discovery whose answers the test queues and settles by hand. */
const createHarness = (environment: NodeJS.ProcessEnv = {}) => {
  let time = 0;
  const pending: Array<PromiseWithResolvers<AcpAgentDiscovery>> = [];
  const discover = vi.fn(async (_options: ExternalAgentDiscoverOptions): Promise<AcpAgentDiscovery> => {
    const next = Promise.withResolvers<AcpAgentDiscovery>();
    pending.push(next);
    return next.promise;
  });
  const configure = vi.fn<(agents: readonly AcpAdapter[] | undefined) => void>();
  const records: Array<{ level: string; event: string; detail: unknown }> = [];
  const log: DiagnosticsLog = {
    filePath: '/logs/desktop.log',
    log(level, event, detail) {
      records.push({ level, event, detail });
    },
  };
  const discovery = createExternalAgentDiscovery({
    resolveFrom,
    discover,
    configure,
    log,
    now: () => time,
    environment,
  });
  /** Settle the oldest discovery still waiting. */
  const settle = async (answer: AcpAgentDiscovery | Error): Promise<void> => {
    const next = pending.shift();
    if (!next) {
      throw new Error('No discovery is waiting');
    }
    if (answer instanceof Error) {
      next.reject(answer);
    } else {
      next.resolve(answer);
    }
    await Promise.resolve();
  };
  return {
    discover,
    configure,
    records,
    discovery,
    settle,
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
};

describe('createExternalAgentDiscovery', () => {
  it("should hand each adapter main's account and agent variables, because the services utility runs without them", async () => {
    /* Claude Code finds its keychain sign-in by USER; the services utility's own environment carries no HOME or USER. */
    /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
    const harness = createHarness({
      HOME: '/Users/ada',
      USER: 'ada',
      CLAUDE_CONFIG_DIR: '/Users/ada/.claude-work',
      CODEX_HOME: '/Users/ada/.codex-work',
      XDG_CONFIG_HOME: '/Users/ada/.config',
      HTTPS_PROXY: 'http://proxy.example:3128',
      TAU_API_URL: 'https://api.example',
      AWS_SECRET_ACCESS_KEY: 'not-for-agents',
    });

    const listing = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('claude'), adapterFor('codex')], refused: [] });
    await listing;

    const [claude, codex] = harness.configure.mock.calls.at(-1)?.[0] ?? [];
    expect(claude?.spawnEnv).toEqual({
      HOME: '/Users/ada',
      USER: 'ada',
      CLAUDE_CONFIG_DIR: '/Users/ada/.claude-work',
      XDG_CONFIG_HOME: '/Users/ada/.config',
      HTTPS_PROXY: 'http://proxy.example:3128',
    });
    expect(codex?.spawnEnv).toMatchObject({ HOME: '/Users/ada', USER: 'ada', CODEX_HOME: '/Users/ada/.codex-work' });
    expect(codex?.spawnEnv).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    /* eslint-enable @typescript-eslint/naming-convention -- end of the environment variable names */
  });

  it('should discover with the library probe budgets when no timeout is passed', async () => {
    const harness = createHarness();

    const listing = harness.discovery.list();
    await harness.settle({ agents: [], refused: [] });
    await listing;

    expect(harness.discover).toHaveBeenCalledExactlyOnceWith({ resolveFrom });
  });

  it('should share one discovery between concurrent listings', async () => {
    const harness = createHarness();

    const first = harness.discovery.list();
    const second = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [] });

    expect(harness.discover).toHaveBeenCalledOnce();
    await expect(first).resolves.toEqual([{ id: 'codex', displayName: 'Codex', models: [] }]);
    await expect(second).resolves.toBe(await first);
  });

  it('should post the discovered adapters to the services utility', async () => {
    const harness = createHarness();

    const listing = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [refusalOf('claude')] });
    await listing;

    expect(harness.configure).toHaveBeenCalledExactlyOnceWith([adapterFor('codex')]);
  });

  it('should answer the discovered adapter by id for the sign-in tab, and nothing for a refused or unknown one', async () => {
    const harness = createHarness();

    expect(harness.discovery.adapterOf('codex')).toBeUndefined();
    const listing = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [refusalOf('claude')] });
    await listing;

    expect(harness.discovery.adapterOf('codex')).toEqual(adapterFor('codex'));
    expect(harness.discovery.adapterOf('claude')).toBeUndefined();
    expect(harness.discovery.adapterOf('unknown')).toBeUndefined();
  });

  it('should never probe a clean result again', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('claude'), adapterFor('codex')], refused: [] });
    await initial;

    harness.advance(10 * externalAgentRediscoveryMilliseconds);
    const later = await harness.discovery.list();

    expect(harness.discover).toHaveBeenCalledOnce();
    expect(later.map((descriptor) => descriptor.id)).toEqual(['claude', 'codex']);
  });

  it('should not probe a refused agent again within the rediscovery interval', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [refusalOf('claude')] });
    await initial;

    harness.advance(externalAgentRediscoveryMilliseconds - 1);
    const listing = await harness.discovery.list();

    expect(harness.discover).toHaveBeenCalledOnce();
    expect(listing).toContainEqual({
      id: 'claude',
      displayName: 'Claude Code',
      models: [],
      refusal: 'EXTERNAL_AGENT_UNAVAILABLE',
    });
  });

  it('should probe only the refused profiles on the next listing once the interval has passed', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle({
      agents: [adapterFor('codex')],
      refused: [refusalOf('claude'), refusalOf('grok')],
    });
    await initial;

    harness.advance(externalAgentRediscoveryMilliseconds);
    const listing = harness.discovery.list();

    expect(harness.discover).toHaveBeenCalledTimes(2);
    expect(harness.discover).toHaveBeenLastCalledWith({
      resolveFrom,
      pins: [profileFor('claude'), profileFor('grok')],
    });
    await harness.settle({ agents: [adapterFor('claude')], refused: [refusalOf('grok')] });
    await listing;
  });

  it('should merge a recovered agent, post the adapters again and return the new descriptors', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [refusalOf('claude'), refusalOf('grok')] });
    await initial;

    harness.advance(externalAgentRediscoveryMilliseconds);
    const listing = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('claude')], refused: [refusalOf('grok')] });

    await expect(listing).resolves.toEqual([
      { id: 'claude', displayName: 'Claude Code', models: [] },
      { id: 'codex', displayName: 'Codex', models: [] },
      { id: 'grok', displayName: 'Grok Build', models: [], refusal: 'EXTERNAL_AGENT_UNAVAILABLE' },
    ]);
    expect(harness.configure).toHaveBeenLastCalledWith([adapterFor('claude'), adapterFor('codex')]);
    expect(harness.configure).toHaveBeenCalledTimes(2);
  });

  it('should keep the agents it has when a rediscovery rejects', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle({ agents: [adapterFor('codex')], refused: [refusalOf('claude')] });
    const before = await initial;

    harness.advance(externalAgentRediscoveryMilliseconds);
    const listing = harness.discovery.list();
    await harness.settle(new Error('The external agent could not be discovered.'));

    await expect(listing).resolves.toEqual(before);
    expect(harness.configure).toHaveBeenCalledOnce();
  });

  it('should answer no agents and configure the host without them when discovery rejects', async () => {
    const harness = createHarness();

    const listing = harness.discovery.list();
    await harness.settle(new Error('The external agent could not be discovered.'));

    await expect(listing).resolves.toEqual([]);
    expect(harness.configure).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(harness.records).toContainEqual({
      level: 'error',
      event: 'agent-host.external-agents-failed',
      detail: { message: 'Error: The external agent could not be discovered.' },
    });
  });

  it('should retry a rejected discovery in full on the next listing once the interval has passed', async () => {
    const harness = createHarness();
    const initial = harness.discovery.list();
    await harness.settle(new Error('The external agent could not be discovered.'));
    await initial;

    harness.advance(externalAgentRediscoveryMilliseconds - 1);
    await expect(harness.discovery.list()).resolves.toEqual([]);
    expect(harness.discover).toHaveBeenCalledOnce();

    harness.advance(1);
    const listing = harness.discovery.list();
    expect(harness.discover).toHaveBeenLastCalledWith({ resolveFrom });
    await harness.settle({ agents: [adapterFor('codex')], refused: [] });

    await expect(listing).resolves.toEqual([{ id: 'codex', displayName: 'Codex', models: [] }]);
    expect(harness.configure).toHaveBeenLastCalledWith([adapterFor('codex')]);
  });

  it('should log each refusal with its code and message', async () => {
    const harness = createHarness();

    const listing = harness.discovery.list();
    await harness.settle({
      agents: [adapterFor('codex')],
      refused: [refusalOf('claude', 'claude --version timed out after 10000 ms')],
    });
    await listing;

    expect(harness.records).toEqual([
      {
        level: 'info',
        event: 'agent-host.external-agents',
        detail: {
          agents: ['codex:0'],
          refused: ['claude: EXTERNAL_AGENT_UNAVAILABLE: claude --version timed out after 10000 ms'],
        },
      },
    ]);
  });

  it('should cut a long refusal message to 300 characters', async () => {
    const harness = createHarness();

    const listing = harness.discovery.list();
    await harness.settle({ agents: [], refused: [refusalOf('claude', 'x'.repeat(1000))] });
    await listing;

    expect(harness.records).toEqual([
      {
        level: 'info',
        event: 'agent-host.external-agents',
        detail: { agents: [], refused: [`claude: EXTERNAL_AGENT_UNAVAILABLE: ${'x'.repeat(300)}`] },
      },
    ]);
  });
});
