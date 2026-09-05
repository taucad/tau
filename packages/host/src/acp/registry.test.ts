/**
 * Adapter resolution is the daemon's *advertisement* boundary: an agent that
 * cannot be started must never be offered, and must never crash the daemon on
 * the way to not being offered.
 */

import { describe, expect, it } from 'vitest';

import { acpAdapterOverrideVariable, acpAdapterPins, probeAcpAgents, resolveAcpAdapters } from '#acp/registry.js';

const fakeAgentPath = new URL('fixtures/fake-agent.ts', import.meta.url).pathname;

describe('resolveAcpAdapters', () => {
  it('refuses an adapter that is not installed rather than throwing', () => {
    const { agents, refused } = resolveAcpAdapters({
      resolveFrom: import.meta.url,
      pins: [{ id: 'nope', package: '@taucad/definitely-not-installed', version: '0.0.0', configEnv: [] }],
      environment: {},
    });

    expect(agents).toEqual([]);
    expect(refused).toEqual([expect.objectContaining({ id: 'nope', code: 'ADAPTER_NOT_INSTALLED' })]);
  });

  it('resolves the pinned adapters through their package bin entries', () => {
    /* Resolved from the distributed daemon, where the adapters are declared —
     * `packages/host` deliberately does not depend on them. */
    const { agents, refused } = resolveAcpAdapters({
      resolveFrom: new URL('../../../cli/src/commands/serve.ts', import.meta.url).href,
      environment: {},
    });

    expect(refused).toEqual([]);
    expect(agents.map((agent) => agent.id)).toEqual(acpAdapterPins.map((pin) => pin.id));
    for (const agent of agents) {
      expect(agent.modulePath.endsWith('.js')).toBe(true);
      expect(agent.modulePath.startsWith('/')).toBe(true);
    }
  });

  it('honours an adapter override only under NODE_ENV=test', () => {
    const environment = { NODE_ENV: 'test', [acpAdapterOverrideVariable]: `${fakeAgentPath}:codex` };
    const { agents } = resolveAcpAdapters({ resolveFrom: import.meta.url, environment });
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex?.modulePath).toBe(fakeAgentPath);
    // No vendor CLI stands behind a fixture, so the probe is skipped for it.
    expect(codex?.cli).toBeUndefined();

    /* Outside a test run the variable is inert: a production daemon that
     * inherited it must not spawn an arbitrary module under the user's own CLI
     * credentials, so `codex` still resolves to the pinned adapter. */
    const production = resolveAcpAdapters({
      resolveFrom: new URL('../../../cli/src/commands/serve.ts', import.meta.url).href,
      environment: { NODE_ENV: 'production', [acpAdapterOverrideVariable]: `${fakeAgentPath}:codex` },
    });
    expect(production.agents.find((agent) => agent.id === 'codex')?.modulePath).not.toBe(fakeAgentPath);
  });
});

describe('probeAcpAgents', () => {
  it('refuses an adapter whose CLI is absent and keeps the ones that answer', async () => {
    const probed = await probeAcpAgents(
      {
        agents: [
          {
            id: 'ghost',
            package: 'p',
            version: '1',
            cli: 'tau-cli-that-does-not-exist',
            configEnv: [],
            modulePath: '/x',
          },
          { id: 'fixture', package: 'p', version: '1', configEnv: [], modulePath: fakeAgentPath },
        ],
        refused: [],
      },
      { probeTimeout: 5000, environment: process.env },
    );

    expect(probed.agents.map((agent) => agent.id)).toEqual(['fixture']);
    expect(probed.refused).toEqual([expect.objectContaining({ id: 'ghost', code: 'CLI_NOT_FOUND' })]);
  });
});
