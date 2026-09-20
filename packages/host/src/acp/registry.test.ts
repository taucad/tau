/**
 * Adapter resolution is the daemon's *advertisement* boundary: an agent that
 * cannot be started must never be offered, and must never crash the daemon on
 * the way to not being offered.
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  acpAdapterOverrideVariable,
  acpAgentProfiles,
  discoverAcpAgents,
  externalAgentDescriptors,
  probeAcpAgentModels,
  probeAcpAgents,
  resolveAcpAdapters,
} from '#acp/registry.js';
import { externalAgentDescriptorSchema } from '@taucad/agent-host';

const fakeAgentPath = new URL('fixtures/fake-agent.ts', import.meta.url).pathname;

describe('resolveAcpAdapters', () => {
  it('refuses an adapter that is not installed rather than throwing', () => {
    const { agents, refused } = resolveAcpAdapters({
      resolveFrom: import.meta.url,
      pins: [
        {
          id: 'nope',
          displayName: 'Nope',
          package: '@taucad/definitely-not-installed',
          version: '0.0.0',
          configEnv: [],
        },
      ],
      environment: {},
    });

    expect(agents).toEqual([]);
    expect(refused).toEqual([expect.objectContaining({ id: 'nope', code: 'ADAPTER_NOT_INSTALLED' })]);
  });

  it('resolves the pinned adapters through their package bin entries', async () => {
    /* Resolved from the distributed daemon, where the adapters are declared —
     * `packages/host` deliberately does not depend on them. */
    const { agents, refused } = resolveAcpAdapters({
      resolveFrom: new URL('../../../cli/src/commands/serve.ts', import.meta.url).href,
      environment: {},
    });

    expect(refused).toEqual([]);
    expect(agents.map((agent) => agent.id)).toEqual(acpAgentProfiles.map((profile) => profile.id));
    for (const agent of agents) {
      expect(agent.modulePath.endsWith('.js')).toBe(true);
      expect(agent.modulePath.startsWith('/')).toBe(true);
    }
    const codex = agents.find((agent) => agent.id === 'codex');
    const installed = await readFile(codex?.modulePath ?? '', 'utf8');
    /* The exact pin still receives additional directories for native skill
     * discovery, but Tau's package skill root must not become trusted or
     * workspace-writable in Codex's sandbox. */
    expect(installed).toContain('const sessionRoots = [projectPath];');
    expect(installed).toContain('const configWithWorkspaceRoots = mergedConfig;');
    expect(installed).toContain('sandboxPolicy: agentMode.sandboxPolicy,');
  });

  it('honours an adapter override only under NODE_ENV=test', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
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
      // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
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
            displayName: 'Ghost',
            package: 'p',
            version: '1',
            cli: 'tau-cli-that-does-not-exist',
            configEnv: [],
            modulePath: '/x',
          },
          {
            id: 'fixture',
            displayName: 'Fixture',
            package: 'p',
            version: '1',
            configEnv: [],
            modulePath: fakeAgentPath,
          },
        ],
        refused: [],
      },
      { probeTimeout: 5000, environment: process.env },
    );

    expect(probed.agents.map((agent) => agent.id)).toEqual(['fixture']);
    expect(probed.refused).toEqual([expect.objectContaining({ id: 'ghost', code: 'CLI_NOT_FOUND' })]);
  });
});

/** The fixture, as a profile a probe can spawn; `mode` steers what it answers. */
const fixtureProfile = (mode?: string) => ({
  id: 'codex',
  displayName: 'Codex',
  package: 'p',
  version: '1',
  configEnv: [],
  // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
  ...(mode === undefined ? {} : { spawnEnv: { TAU_FAKE_AGENT_MODE: mode } }),
});

const fixtureAdapter = (mode?: string) => ({ ...fixtureProfile(mode), modulePath: fakeAgentPath });

describe('probeAcpAgentModels', () => {
  it('reads the agent’s own model list and current model off a throwaway session', async () => {
    /* V5 / EQ1 A: the picker is populated *before* the chat's first turn, and
     * the only place ACP publishes a model list is a session's config options. */
    const probed = await probeAcpAgentModels(
      { agents: [fixtureAdapter()], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    expect(probed.agents[0]?.models).toEqual([
      { id: 'gpt-5.3-codex-spark', name: 'gpt-5.3-codex-spark' },
      { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
    ]);
    expect(probed.agents[0]?.defaultModel).toBe('gpt-5.3-codex-spark');
  });

  it('flattens a grouped select, because Tau’s picker is one list', async () => {
    const probed = await probeAcpAgentModels(
      { agents: [fixtureAdapter('grouped')], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    expect(probed.agents[0]?.models?.map((model) => model.id)).toEqual(['gpt-5.3-codex-spark', 'gpt-5.3-codex']);
  });

  it('keeps the agent when the probe never answers, on its own timeout', async () => {
    /* The whole point of a separate budget: a CLI answers `--version` in
     * milliseconds while its adapter hangs the handshake, and a logged-out or
     * unbilled account must cost the user a model list, never the agent row
     * (EQ1 fallback B). */
    const started = Date.now();
    const probed = await probeAcpAgentModels(
      { agents: [fixtureAdapter('silent')], refused: [] },
      { modelProbeTimeout: 750 },
    );

    expect(probed.agents.map((agent) => agent.id)).toEqual(['codex']);
    expect(probed.agents[0]?.models).toBeUndefined();
    expect(probed.refused).toEqual([]);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe('discoverAcpAgents', () => {
  it('spends the two probe budgets in parallel, and neither can refuse for the other', async () => {
    /* The version probe decides *who* is advertised; the model probe decides
     * *what* they offer. A model probe that never answers leaves an advertised
     * agent with no list — it does not remove it, and it does not extend the
     * version probe's own deadline. */
    const started = Date.now();
    const discovery = await discoverAcpAgents({
      resolveFrom: import.meta.url,
      pins: [fixtureProfile('silent')],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
      environment: { ...process.env, NODE_ENV: 'test', [acpAdapterOverrideVariable]: `${fakeAgentPath}:codex` },
      probeTimeout: 1500,
      modelProbeTimeout: 750,
    });

    expect(discovery.agents.map((agent) => agent.id)).toEqual(['codex']);
    expect(discovery.agents[0]?.models).toBeUndefined();
    /* Sequential budgets would be 2250 ms at best; parallel ones settle on the
     * slower single probe. */
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe('externalAgentDescriptors', () => {
  it('is the one shape every tier carries, refusals included', async () => {
    const discovery = await discoverAcpAgents({
      resolveFrom: import.meta.url,
      pins: [fixtureProfile()],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
      environment: { ...process.env, NODE_ENV: 'test', [acpAdapterOverrideVariable]: `${fakeAgentPath}:codex` },
      modelProbeTimeout: 20_000,
    });
    const descriptors = externalAgentDescriptors(
      { ...discovery, refused: [{ id: 'claude', code: 'CLI_TOO_OLD', message: 'too old' }] },
      acpAgentProfiles,
    );

    expect(descriptors).toEqual([
      {
        id: 'codex',
        displayName: 'Codex',
        models: [
          { id: 'gpt-5.3-codex-spark', name: 'gpt-5.3-codex-spark' },
          { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
        ],
        defaultModel: 'gpt-5.3-codex-spark',
      },
      /* V9: the refused agent keeps a row so a GUI can say *why* it is missing,
       * and it is named from the profile because resolution knew about it. */
      { id: 'claude', displayName: 'Claude Code', models: [], refusal: 'CLI_TOO_OLD' },
    ]);
    /* VSC1: every tier parses exactly this — no string element, no extra key. */
    for (const descriptor of descriptors) {
      expect(externalAgentDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    }
    expect(externalAgentDescriptorSchema.safeParse('codex').success).toBe(false);
  });

  it('deleted the Codex model pin, so nothing but a user choice names a model', () => {
    /* V5: two sources of truth disagree the day OpenAI retires a model id, and
     * a pinned default is the one Tau cannot see going stale. */
    expect(acpAgentProfiles.every((profile) => !('model' in profile))).toBe(true);
    expect(acpAgentProfiles.map((profile) => profile.displayName)).toEqual(['Claude Code', 'Codex']);
  });
});
