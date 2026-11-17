/**
 * Adapter resolution is the daemon's *advertisement* boundary: an agent that
 * cannot be started must never be offered, and must never crash the daemon on
 * the way to not being offered.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acpAdapterOverrideVariable,
  acpAgentProfiles,
  discoverAcpAgents,
  externalAgentDescriptors,
  probeAcpAgentModels,
  probeAcpAgents,
  resolveAcpAdapters,
} from '#acp/registry.js';
import { acpLocalFileSystem } from '#acp/locate.js';
import type { AcpExecutableFileSystem } from '#acp/locate.js';
import { acpAdapterEnvironment } from '#acp/spawn.js';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';

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
      if (agent.modulePath === undefined) {
        expect(agent.cli).toBe('grok');
        expect(agent.args).toEqual(['--no-auto-update', 'agent', '--no-leader', 'stdio']);
        continue;
      }
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

  it.each(['codex', 'grok'])('honours a %s adapter override only under NODE_ENV=test', (id) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
    const environment = { NODE_ENV: 'test', [acpAdapterOverrideVariable]: `${fakeAgentPath}:${id}` };
    const { agents } = resolveAcpAdapters({ resolveFrom: import.meta.url, environment });
    const codex = agents.find((agent) => agent.id === id);

    expect(codex?.modulePath).toBe(fakeAgentPath);
    // No vendor CLI stands behind a fixture, so the probe is skipped for it.
    expect(codex?.cli).toBeUndefined();

    /* Outside a test run the variable is inert: a production daemon that
     * inherited it must not spawn an arbitrary module under the user's own CLI
     * credentials, so `codex` still resolves to the pinned adapter. */
    const production = resolveAcpAdapters({
      resolveFrom: new URL('../../../cli/src/commands/serve.ts', import.meta.url).href,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
      environment: { NODE_ENV: 'production', [acpAdapterOverrideVariable]: `${fakeAgentPath}:${id}` },
    });
    expect(production.agents.find((agent) => agent.id === id)?.modulePath).not.toBe(fakeAgentPath);
  });
});

const stubRoots: string[] = [];

afterEach(async () => {
  await Promise.all(stubRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * A PATH directory holding one shell stub per CLI, each answering `--version`.
 *
 * @param versions - Version each stub reports, by CLI name.
 * @returns The directory to put on PATH.
 */
const stubCliDirectory = async (versions: Readonly<Record<string, string>>): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-acp-cli-'));
  stubRoots.push(directory);
  await Promise.all(
    Object.entries(versions).map(async ([name, version]) => {
      const path = join(directory, name);
      await writeFile(path, `#!/bin/sh\necho '${version} (stub)'\n`);
      await chmod(path, 0o755);
    }),
  );
  return directory;
};

/**
 * The real file system, confined to one directory, so a CLI installed on the
 * machine running the suite never answers for a stub.
 *
 * @param root - The only directory whose files exist.
 * @returns The probe resolution reads.
 */
const confinedTo = (root: string): AcpExecutableFileSystem => ({
  isExecutableFile: (path) => path.startsWith(root) && acpLocalFileSystem.isExecutableFile(path),
  listDirectory: (path) => (path.startsWith(root) ? acpLocalFileSystem.listDirectory(path) : []),
});

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
describe.skipIf(process.platform === 'win32')('executable resolution', () => {
  const resolveFrom = new URL('../../../cli/src/commands/serve.ts', import.meta.url).href;

  it('finds each CLI once, and that file is what both module adapters are told to run', async () => {
    /* D3: the probe checks one executable, so the adapter must run that same
     * file rather than the vendor copy its own SDK would otherwise look for. */
    const directory = await stubCliDirectory({ claude: '2.1.301', codex: '0.162.1' });
    const environment = { PATH: `${directory}:/usr/bin:/bin` };
    const { agents } = resolveAcpAdapters({
      resolveFrom,
      pins: acpAgentProfiles.filter((profile) => profile.package !== undefined),
      environment,
    });

    expect(agents.map((agent) => [agent.id, agent.executablePath])).toEqual([
      ['claude', join(directory, 'claude')],
      ['codex', join(directory, 'codex')],
    ]);
    const [claude, codex] = agents.map((agent) => acpAdapterEnvironment(environment, agent));
    expect(claude).toMatchObject({ CLAUDE_CODE_EXECUTABLE: join(directory, 'claude') });
    expect(claude).not.toHaveProperty('CODEX_PATH');
    expect(codex).toMatchObject({ CODEX_PATH: join(directory, 'codex') });
    expect(codex).not.toHaveProperty('CLAUDE_CODE_EXECUTABLE');

    const probed = await probeAcpAgents({ agents, refused: [] }, { environment });
    expect(probed.refused).toEqual([]);
  });

  it('refuses a Claude CLI older than the Agent SDK its adapter drives', async () => {
    const directory = await stubCliDirectory({ claude: '2.1.200' });
    const environment = { PATH: `${directory}:/usr/bin:/bin` };
    const discovery = resolveAcpAdapters({
      resolveFrom,
      pins: acpAgentProfiles.filter((profile) => profile.id === 'claude'),
      environment,
    });
    const probed = await probeAcpAgents(discovery, { environment });

    expect(probed.agents).toEqual([]);
    expect(probed.refused).toEqual([expect.objectContaining({ id: 'claude', code: 'CLI_TOO_OLD' })]);
    expect(probed.refused[0]?.message).toContain('2.1.232');
  });

  it('leaves the executable unset when no such CLI exists, so the probe refuses it without running anything', async () => {
    const home = await stubCliDirectory({});
    const environment = { PATH: home, HOME: home };
    const fileSystem = confinedTo(home);
    const discovery = resolveAcpAdapters({
      resolveFrom,
      pins: acpAgentProfiles.filter((profile) => profile.id === 'claude'),
      environment,
      fileSystem,
    });

    expect(discovery.agents[0]?.executablePath).toBeUndefined();
    expect(discovery.agents[0]?.executableSource).toBeUndefined();
    expect(acpAdapterEnvironment(environment, discovery.agents[0] ?? { configEnv: [] })).not.toHaveProperty(
      'CLAUDE_CODE_EXECUTABLE',
    );
    const probed = await probeAcpAgents(discovery, { environment, fileSystem });
    expect(probed.refused).toEqual([expect.objectContaining({ id: 'claude', code: 'CLI_NOT_FOUND' })]);
    expect(probed.refused[0]?.message).toMatch(/not found on PATH \(1 directory\) or at \d+ declared locations?\./u);
  });

  describe('app-bundled Codex', () => {
    const chatGptCodex = 'Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
    const codexProfiles = acpAgentProfiles.filter((profile) => profile.id === 'codex');

    /**
     * A home directory holding a stub Codex where the ChatGPT desktop app bundles it.
     *
     * @param version - Version the bundled stub reports.
     * @returns The home directory and the stub's absolute path.
     */
    const bundledCodexHome = async (version: string): Promise<{ home: string; bundled: string }> => {
      const home = await mkdtemp(join(tmpdir(), 'tau-acp-home-'));
      stubRoots.push(home);
      const bundled = join(home, chatGptCodex);
      await mkdir(dirname(bundled), { recursive: true });
      await writeFile(bundled, `#!/bin/sh\necho 'codex-cli ${version}'\n`);
      await chmod(bundled, 0o755);
      return { home, bundled };
    };

    it('declares the ChatGPT desktop app bundle after the installer and Homebrew, system-wide before per-user', () => {
      expect(codexProfiles[0]?.fallbackExecutables.darwin).toEqual([
        '~/.local/bin/codex',
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
        `/${chatGptCodex}`,
        `~/${chatGptCodex}`,
      ]);
    });

    it('finds the Codex the ChatGPT desktop app bundles when PATH has none, and runs that file', async () => {
      const { home, bundled } = await bundledCodexHome('0.164.0-alpha.11.1');
      const environment = { PATH: await stubCliDirectory({}), HOME: home };
      const discovery = resolveAcpAdapters({
        resolveFrom,
        pins: codexProfiles,
        environment,
        platform: 'darwin',
        fileSystem: confinedTo(home),
      });

      expect(discovery.agents[0]).toMatchObject({ executablePath: bundled, executableSource: 'fallback' });
      expect(acpAdapterEnvironment(environment, discovery.agents[0] ?? { configEnv: [] })).toMatchObject({
        CODEX_PATH: bundled,
      });
      const probed = await probeAcpAgents(discovery, { environment });
      expect(probed.refused).toEqual([]);
      expect(probed.agents.map((agent) => agent.id)).toEqual(['codex']);
    });

    it('prefers a Codex on PATH over the bundled one', async () => {
      const { home } = await bundledCodexHome('0.164.0');
      const directory = await stubCliDirectory({ codex: '0.162.1' });
      const discovery = resolveAcpAdapters({
        resolveFrom,
        pins: codexProfiles,
        environment: { PATH: directory, HOME: home },
        platform: 'darwin',
        /* The PATH stub and the home are siblings in the temporary directory. */
        fileSystem: confinedTo(tmpdir()),
      });

      expect(discovery.agents[0]?.executablePath).toBe(join(directory, 'codex'));
    });

    it('still refuses a bundled Codex older than the adapter drives', async () => {
      const { home } = await bundledCodexHome('0.140.0');
      const environment = { PATH: await stubCliDirectory({}), HOME: home };
      const discovery = resolveAcpAdapters({
        resolveFrom,
        pins: codexProfiles,
        environment,
        platform: 'darwin',
        fileSystem: confinedTo(home),
      });
      const probed = await probeAcpAgents(discovery, { environment });

      expect(probed.agents).toEqual([]);
      expect(probed.refused).toEqual([expect.objectContaining({ id: 'codex', code: 'CLI_TOO_OLD' })]);
      expect(probed.refused[0]?.message).toContain('0.148.0');
    });

    it('ignores the macOS bundle paths on other platforms', async () => {
      const { home } = await bundledCodexHome('0.164.0');
      const environment = { PATH: await stubCliDirectory({}), HOME: home };
      const fileSystem = confinedTo(home);
      const discovery = resolveAcpAdapters({
        resolveFrom,
        pins: codexProfiles,
        environment,
        platform: 'linux',
        fileSystem,
      });

      expect(discovery.agents[0]?.executablePath).toBeUndefined();
      const probed = await probeAcpAgents(discovery, { environment, platform: 'linux', fileSystem });
      expect(probed.refused).toEqual([expect.objectContaining({ id: 'codex', code: 'CLI_NOT_FOUND' })]);
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of wire-named environments. */

describe('probeAcpAgents', () => {
  it('checks the version floor for native CLIs before advertising them', async () => {
    const native = { id: 'grok', displayName: 'Grok Build', cli: process.execPath, args: [], configEnv: [] };
    const accepted = await probeAcpAgents({ agents: [{ ...native, minimumCliVersion: '1.0.41' }], refused: [] });
    expect(accepted.agents).toHaveLength(1);
    const refused = await probeAcpAgents({ agents: [{ ...native, minimumCliVersion: '999.0.0' }], refused: [] });
    expect(refused.agents).toEqual([]);
    expect(refused.refused).toEqual([expect.objectContaining({ id: 'grok', code: 'CLI_TOO_OLD' })]);
  });

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

    expect(probed.agents[0]?.models?.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'gpt-5.3-codex-spark', name: 'gpt-5.3-codex-spark' },
      { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
    ]);
    expect(probed.agents[0]?.models?.[1]?.thoughtLevel?.currentValue).toBe('medium');
    expect(probed.agents[0]?.defaultModel).toBe('gpt-5.3-codex-spark');
    expect(probed.agents[0]?.configOptions?.map((option) => option.id)).toEqual(['mode', 'web_search']);
    /* PR5: a new chat is shown the mode its first turn chooses, and no plan. */
    expect(probed.agents[0]?.configOptions?.[0]).toMatchObject({
      currentValue: 'auto',
    });
    const offered = probed.agents[0]?.configOptions?.[0];
    expect(
      offered?.type === 'select' && offered.options.flatMap((entry) => ('value' in entry ? [entry.value] : [])),
    ).toEqual(['auto', 'default', 'acceptEdits', 'bypassPermissions']);
    expect(probed.agents[0]?.thoughtLevel).toMatchObject({
      id: 'thought_level',
      currentValue: 'medium',
      options: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }],
    });
  });

  it('keeps a mode option whose values carry adapter `_meta`, as codex-acp 1.7.0 sends them', async () => {
    const probed = await probeAcpAgentModels(
      { agents: [fixtureAdapter('value-meta')], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    const offered = probed.agents[0]?.configOptions?.find((option) => option.category === 'mode');
    expect(offered).toMatchObject({ id: 'mode', currentValue: 'auto' });
    expect(
      offered?.type === 'select' && offered.options.flatMap((entry) => ('value' in entry ? [entry] : [])),
    ).toContainEqual({ value: 'auto', name: 'Auto' });
  });

  it('flattens a grouped select, because Tau’s picker is one list', async () => {
    const probed = await probeAcpAgentModels(
      { agents: [fixtureAdapter('grouped')], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    expect(probed.agents[0]?.models?.map((model) => model.id)).toEqual(['gpt-5.3-codex-spark', 'gpt-5.3-codex']);
  });

  it('reads a model list the agent pushes after session/new, when its profile declares the wait', async () => {
    /* Grok 1.0.52, started on a renewable sign-in, answers `session/new` with its built-in models and
     * lists the rest only in `_x.ai/models/update` a moment later. */
    const probed = await probeAcpAgentModels(
      { agents: [{ ...fixtureAdapter('pushed-models'), modelListGrace: 1000 }], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    expect(probed.agents[0]?.models).toHaveLength(4);
    expect(probed.agents[0]?.models?.slice(2).map((model) => model.id)).toEqual(['pushed-model-a', 'pushed-model-b']);
    expect(probed.agents[0]?.models?.[3]?.thoughtLevel?.currentValue).toBe('medium');
  });

  it('waits for a pushed model list only for an agent seen to push one', () => {
    /* Every other agent's `session/new` answer is its whole list, so its probe must not get slower. */
    expect(
      acpAgentProfiles.filter((profile) => profile.modelListGrace !== undefined).map((profile) => profile.id),
    ).toEqual(['grok']);
  });

  it('ends the wait for a pushed model list at its grace when no push comes', async () => {
    const started = Date.now();
    const probed = await probeAcpAgentModels(
      { agents: [{ ...fixtureAdapter(), modelListGrace: 1000 }], refused: [] },
      { modelProbeTimeout: 20_000 },
    );

    expect(probed.agents[0]?.models).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('never waits for a pushed model list past the probe’s own deadline', async () => {
    const started = Date.now();
    const probed = await probeAcpAgentModels(
      { agents: [{ ...fixtureAdapter(), modelListGrace: 600_000 }], refused: [] },
      { modelProbeTimeout: 3000 },
    );

    expect(probed.agents.map((agent) => agent.id)).toEqual(['codex']);
    expect(probed.agents[0]?.models).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(10_000);
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
    expect(probed.agents[0]?.thoughtLevel).toBeUndefined();
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

describe.skipIf(process.platform === 'win32')('discoverAcpAgents for a CLI that did not resolve', () => {
  it('should not start the model probe', async () => {
    /* The model probe spawns with this process's environment, so a stub on
     * this process's PATH records whether it was started even though
     * discovery's own PATH has no such CLI. */
    const directory = await stubCliDirectory({});
    const marker = join(directory, 'model-probe-started');
    const stub = join(directory, 'tau-unresolved-cli');
    await writeFile(stub, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
    await chmod(stub, 0o755);
    vi.stubEnv('PATH', `${directory}:${process.env['PATH'] ?? ''}`);
    try {
      const discovery = await discoverAcpAgents({
        resolveFrom: import.meta.url,
        pins: [{ id: 'ghost', displayName: 'Ghost', cli: 'tau-unresolved-cli', args: ['acp'], configEnv: [] }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
        environment: { PATH: await stubCliDirectory({}), HOME: directory },
        fileSystem: confinedTo(directory),
        modelProbeTimeout: 2000,
      });

      expect(discovery.refused).toEqual([expect.objectContaining({ id: 'ghost', code: 'CLI_NOT_FOUND' })]);
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      vi.unstubAllEnvs();
    }
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

    expect(descriptors).toMatchObject([
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
    /* ACP agent policy rule 9: the profile's update command clears CLI_TOO_OLD. */
    expect(descriptors[1]).toHaveProperty('fixCommand', 'claude update');
    expect(descriptors[0]).not.toHaveProperty('fixCommand');
    expect(descriptors[0]?.thoughtLevel?.currentValue).toBe('medium');
    expect(descriptors[0]?.configOptions?.map((option) => option.id)).toEqual(['mode', 'web_search']);
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
    expect(acpAgentProfiles.map((profile) => profile.displayName)).toEqual(['Claude Code', 'Codex', 'Grok Build']);
  });
});
