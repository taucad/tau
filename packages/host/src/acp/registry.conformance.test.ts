/**
 * Registry conformance (ACP agent policy rules 1-6, 9): every reviewed profile
 * is complete, is found wherever its vendor installs it, and is refused with
 * the code that is true.
 *
 * Iterates `acpAgentProfiles`, so a new profile is covered with no edit here.
 * A synthetic fourth profile runs through the same cases to prove it. Stub CLIs
 * are `#!/bin/sh` scripts in a temporary home, and the file probe is confined
 * to that home, so a CLI installed on the machine running the suite never
 * answers for a stub.
 */

import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acpAgentProfiles,
  acpModelProbeTimeout,
  discoverAcpAgents,
  externalAgentDescriptors,
  probeAcpAgents,
  resolveAcpAdapters,
} from '#acp/registry.js';
import type { AcpAgentDiscovery, AcpSupportedPlatform, ReviewedAcpAgentProfile } from '#acp/registry.js';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';

/** The PATH a Finder or launchd launch gives an app. */
const launchdPath = '/usr/bin:/bin:/usr/sbin:/sbin';

const supportedPlatforms: readonly AcpSupportedPlatform[] = ['darwin', 'linux', 'win32'];

/** Resolved from the distributed daemon, where the module adapters are declared. */
const resolveFrom = new URL('../../../cli/src/commands/serve.ts', import.meta.url).href;

/** An agent no vendor ships, held to the same cases as the reviewed set. */
const fourthProfile: ReviewedAcpAgentProfile = {
  id: 'acme',
  displayName: 'Acme Agent',
  cli: 'acme',
  args: ['acp'],
  configEnv: [],
  minimumCliVersion: '1.2.0',
  versionSample: 'acme 1.4.2 (build 77)',
  fallbackExecutables: {
    darwin: ['~/.acme/bin/acme', '~/Library/Acme/*/bin/acme'],
    linux: ['~/.acme/bin/acme'],
    win32: ['~/.acme/bin/acme.exe'],
  },
  installCommand: {
    posix: 'curl -fsSL https://acme.example/install.sh | sh',
    windows: 'irm https://acme.example/install.ps1 | iex',
  },
  updateCommand: { posix: 'acme update', windows: 'acme update' },
  loginCommand: 'acme login',
  loginArgs: ['login'],
  defaultModePreference: ['auto'],
};

const profiles: ReadonlyArray<{ readonly label: string; readonly profile: ReviewedAcpAgentProfile }> = [
  ...acpAgentProfiles.map((profile) => ({ label: profile.id, profile })),
  { label: 'a fourth profile (synthetic acme)', profile: fourthProfile },
];

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** A fresh temporary home directory. */
const temporaryHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), 'tau-acp-conformance-'));
  roots.push(home);
  return home;
};

/**
 * The real file system, confined to one directory.
 *
 * @param root - The only directory whose files exist.
 * @returns A probe that sees nothing outside `root`.
 */
const confinedTo = (root: string) => ({
  isExecutableFile: (path: string): boolean => {
    if (!path.startsWith(root)) {
      return false;
    }
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  listDirectory: (path: string): readonly string[] => {
    if (!path.startsWith(root)) {
      return [];
    }
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
});

/**
 * Write one executable `#!/bin/sh` stub.
 *
 * @param path - Absolute file to create, with its directories.
 * @param body - Shell script body.
 */
const writeStub = async (path: string, body: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
};

/** A stub that prints `line` for `--version` and fails anything else. */
const answering = (line: string, delay = ''): string =>
  `if [ "$1" = "--version" ]; then\n${delay}echo '${line}'\nexit 0\nfi\nexit 1`;

/** Expand `~/` against a home directory, POSIX-style. */
const inHome = (home: string, entry: string): string => posix.join(home, entry.slice(2));

/** The first home-relative fallback this profile declares for a POSIX platform. */
const firstHomeEntry = (profile: ReviewedAcpAgentProfile): string => {
  const entry = profile.fallbackExecutables.linux.find((candidate) => candidate.startsWith('~/'));
  if (entry === undefined) {
    throw new Error(`${profile.id} declares no home-relative linux fallback`);
  }
  return entry;
};

/** The fix command a refused descriptor must carry on one platform. */
const commandFor = (commands: { readonly posix: string; readonly windows: string }, platform: AcpSupportedPlatform) =>
  platform === 'win32' ? commands.windows : commands.posix;

/**
 * Discover one profile against a temporary home.
 *
 * @param profile - The profile to discover.
 * @param home - The temporary home; the only place files exist.
 * @param options - PATH, platform and probe budgets.
 * @returns The discovery and the warnings it logged.
 */
const discoverIn = async (
  profile: ReviewedAcpAgentProfile,
  home: string,
  options: {
    readonly path?: string;
    readonly platform?: AcpSupportedPlatform;
    readonly probeTimeout?: number;
    readonly probeModels?: boolean;
  } = {},
): Promise<{ readonly discovery: AcpAgentDiscovery; readonly warnings: readonly string[] }> => {
  const warnings: string[] = [];
  const discovery = await discoverAcpAgents({
    resolveFrom,
    pins: [profile],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    environment: { PATH: options.path ?? launchdPath, HOME: home },
    platform: options.platform ?? 'linux',
    fileSystem: confinedTo(home),
    probeModels: options.probeModels ?? false,
    ...(options.probeTimeout === undefined ? {} : { probeTimeout: options.probeTimeout }),
    modelProbeTimeout: 3000,
    onWarning: (message) => warnings.push(message),
  });
  return { discovery, warnings };
};

/**
 * The descriptors of a discovery, after every tier's strict parse (C12).
 *
 * @param discovery - What one discovery found.
 * @param profile - The profile it came from.
 * @param platform - The host platform whose fix commands apply.
 * @returns The parsed descriptors.
 */
const parsedDescriptors = (
  discovery: AcpAgentDiscovery,
  profile: ReviewedAcpAgentProfile,
  platform: AcpSupportedPlatform,
) => externalAgentDescriptorSchema.array().parse(externalAgentDescriptors(discovery, [profile], platform));

describe.each(profiles)('the $label profile', ({ profile }) => {
  it('should declare a unique lower-case id, a CLI and an x.y.z floor', () => {
    expect(profile.id).toMatch(/^[a-z][a-z\d-]*$/u);
    expect(profiles.filter((each) => each.profile.id === profile.id)).toHaveLength(1);
    expect(profile.cli).toMatch(/^[\w.-]+$/u);
    expect(profile.minimumCliVersion).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  it('should keep any wait for a pushed model list short and inside the model probe budget', () => {
    if (profile.modelListGrace !== undefined) {
      expect(profile.modelListGrace).toBeGreaterThan(0);
      expect(profile.modelListGrace).toBeLessThanOrEqual(2000);
      expect(profile.modelListGrace).toBeLessThan(acpModelProbeTimeout);
    }
  });

  it('should declare fallbacks for every supported platform in the allowed shape', () => {
    expect(Object.keys(profile.fallbackExecutables).toSorted()).toEqual([...supportedPlatforms].toSorted());
    for (const platform of supportedPlatforms) {
      const path = platform === 'win32' ? win32 : posix;
      for (const entry of profile.fallbackExecutables[platform]) {
        const segments = entry.split(/[/\\]/u);
        expect(entry.startsWith('~/') || path.isAbsolute(entry), entry).toBe(true);
        expect(segments.at(-1), entry).toBe(platform === 'win32' ? `${profile.cli}.exe` : profile.cli);
        expect(entry, entry).not.toMatch(/\.(?:cmd|bat)$/iu);
        expect(segments, entry).not.toContain('..');
        expect(
          segments.filter((segment) => segment.includes('*')).every((segment) => segment === '*'),
          entry,
        ).toBe(true);
      }
    }
  });

  it('should declare install and update commands for both shells and a login command starting with its CLI', () => {
    for (const command of [
      profile.installCommand.posix,
      profile.installCommand.windows,
      profile.updateCommand.posix,
      profile.updateCommand.windows,
      profile.loginCommand,
    ]) {
      expect(command.trim()).not.toBe('');
      expect(command).not.toMatch(/[\r\n]/u);
      expect(command.length).toBeLessThanOrEqual(256);
      expect(command).not.toMatch(/Helper|app\.asar|node_modules/u);
    }
    expect(profile.loginCommand === profile.cli || profile.loginCommand.startsWith(`${profile.cli} `)).toBe(true);
  });

  it('should declare structured login arguments that spell its login command exactly', () => {
    /* Tau's sign-in tab runs `cli` with these and no shell, and the card shows `loginCommand`:
     * both must be the same invocation, with no word a shell would quote or split. */
    expect(Array.isArray(profile.loginArgs), 'loginArgs').toBe(true);
    for (const argument of profile.loginArgs) {
      expect(argument, argument).toMatch(/^[\w@%+=:,./-]+$/u);
    }
    expect([profile.cli, ...profile.loginArgs].join(' ')).toBe(profile.loginCommand);
  });

  describe.skipIf(process.platform === 'win32')('with stub CLIs', () => {
    it('should read its own version sample without a warning, at or above the floor', async () => {
      const home = await temporaryHome();
      await writeStub(join(home, 'bin', profile.cli), answering(profile.versionSample));

      const { discovery, warnings } = await discoverIn(profile, home, { path: `${join(home, 'bin')}:${launchdPath}` });

      expect(discovery.refused).toEqual([]);
      expect(discovery.agents.map((agent) => agent.id)).toEqual([profile.id]);
      expect(warnings).toEqual([]);
    });

    const homeEntries = (['darwin', 'linux'] as const).flatMap((platform) =>
      profile.fallbackExecutables[platform]
        .filter((entry) => entry.startsWith('~/'))
        .map((entry) => ({ platform, entry })),
    );

    it.each(homeEntries)(
      'should resolve the $platform fallback $entry with the launchd PATH, to the file a terminal PATH finds',
      async ({ platform, entry }) => {
        const home = await temporaryHome();
        /* Two versions behind every `*`: the newer must win. */
        const older = inHome(home, entry.replaceAll('/*/', '/2.1.99/'));
        const newer = inHome(home, entry.replaceAll('/*/', '/2.1.325/'));
        await writeStub(older, answering(profile.versionSample));
        await writeStub(newer, answering(profile.versionSample));
        const resolve = (path: string) =>
          resolveAcpAdapters({
            resolveFrom,
            pins: [profile],
            // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
            environment: { PATH: path, HOME: home },
            platform,
            fileSystem: confinedTo(home),
          }).agents[0];

        const fromLaunchd = resolve(launchdPath);
        const fromTerminal = resolve(`${dirname(newer)}:${launchdPath}`);

        expect(fromLaunchd).toMatchObject({ executablePath: newer, executableSource: 'fallback' });
        expect(fromTerminal).toMatchObject({ executablePath: newer, executableSource: 'path' });

        const { discovery } = await discoverIn(profile, home, { platform });
        expect(discovery.refused).toEqual([]);
        expect(discovery.agents[0]).toMatchObject({ executablePath: newer, executableSource: 'fallback' });
      },
    );

    it('should prefer PATH over every fallback', async () => {
      const home = await temporaryHome();
      for (const entry of profile.fallbackExecutables.linux.filter((candidate) => candidate.startsWith('~/'))) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of stubs, written in order.
        await writeStub(inHome(home, entry), answering(profile.versionSample));
      }
      const onPath = join(home, 'path-bin', profile.cli);
      await writeStub(onPath, answering(profile.versionSample));

      const { discovery } = await discoverIn(profile, home, { path: `${dirname(onPath)}:${launchdPath}` });

      expect(discovery.agents[0]).toMatchObject({ executablePath: onPath, executableSource: 'path' });
    });

    it.each(supportedPlatforms)(
      'should refuse CLI_NOT_FOUND on %s only when no file exists, with the install command',
      async (platform) => {
        const home = await temporaryHome();

        const { discovery } = await discoverIn(profile, home, { platform });

        expect(discovery.agents).toEqual([]);
        expect(discovery.refused).toEqual([expect.objectContaining({ id: profile.id, code: 'CLI_NOT_FOUND' })]);
        /* Nothing ran: the message counts what was searched instead of quoting a probe error. */
        expect(discovery.refused[0]?.message).toMatch(/declared location/u);
        expect(parsedDescriptors(discovery, profile, platform)).toEqual([
          {
            id: profile.id,
            displayName: profile.displayName,
            models: [],
            refusal: 'CLI_NOT_FOUND',
            fixCommand: commandFor(profile.installCommand, platform),
          },
        ]);
      },
    );

    it.each(['fallback', 'PATH'] as const)(
      'should refuse CLI_TOO_OLD below the floor at a %s, with the update command',
      async (where) => {
        const home = await temporaryHome();
        const file = where === 'fallback' ? inHome(home, firstHomeEntry(profile)) : join(home, 'path-bin', profile.cli);
        await writeStub(file, answering(`${profile.cli} 0.0.1`));

        const { discovery } = await discoverIn(profile, home, {
          path: where === 'PATH' ? `${dirname(file)}:${launchdPath}` : launchdPath,
        });

        expect(discovery.refused).toEqual([expect.objectContaining({ id: profile.id, code: 'CLI_TOO_OLD' })]);
        expect(discovery.refused[0]?.message).toContain(profile.minimumCliVersion);
        for (const platform of supportedPlatforms) {
          expect(parsedDescriptors(discovery, profile, platform)[0]?.fixCommand).toBe(
            commandFor(profile.updateCommand, platform),
          );
        }
      },
    );

    it('should refuse EXTERNAL_AGENT_UNAVAILABLE, never CLI_NOT_FOUND, when the probe times out', async () => {
      const home = await temporaryHome();
      /* `exec` so the timeout's signal reaches the process holding the pipe. */
      await writeStub(inHome(home, firstHomeEntry(profile)), 'exec sleep 5');

      const { discovery } = await discoverIn(profile, home, { probeTimeout: 100 });

      expect(discovery.refused).toEqual([
        expect.objectContaining({ id: profile.id, code: 'EXTERNAL_AGENT_UNAVAILABLE' }),
      ]);
      expect(discovery.refused[0]?.message).toMatch(/did not answer within 100 ms/u);
      expect(parsedDescriptors(discovery, profile, 'linux')[0]).not.toHaveProperty('fixCommand');
    });

    it('should refuse EXTERNAL_AGENT_UNAVAILABLE when the CLI ends cleanly on the timeout signal without a version', async () => {
      const home = await temporaryHome();
      /* A CLI that traps the timeout's SIGTERM and exits 0 resolves the run with empty stdout. */
      await writeStub(inHome(home, firstHomeEntry(profile)), "trap 'exit 0' TERM\nsleep 5 & wait");

      const { discovery } = await discoverIn(profile, home, { probeTimeout: 100 });

      expect(discovery.agents).toEqual([]);
      expect(discovery.refused).toEqual([
        expect.objectContaining({ id: profile.id, code: 'EXTERNAL_AGENT_UNAVAILABLE' }),
      ]);
      expect(discovery.refused[0]?.message).toMatch(/did not answer within 100 ms/u);
    });

    it('should refuse EXTERNAL_AGENT_UNAVAILABLE when the CLI exits non-zero', async () => {
      const home = await temporaryHome();
      await writeStub(inHome(home, firstHomeEntry(profile)), 'exit 3');

      const { discovery } = await discoverIn(profile, home);

      expect(discovery.refused).toEqual([
        expect.objectContaining({ id: profile.id, code: 'EXTERNAL_AGENT_UNAVAILABLE' }),
      ]);
      expect(discovery.refused[0]?.message).toMatch(/exited with code 3/u);
      expect(parsedDescriptors(discovery, profile, 'linux')[0]).not.toHaveProperty('fixCommand');
    });

    it('should refuse EXTERNAL_AGENT_UNAVAILABLE when the found CLI has lost its execute bit', async () => {
      const home = await temporaryHome();
      const file = inHome(home, firstHomeEntry(profile));
      await writeStub(file, answering(profile.versionSample));
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
      const environment = { PATH: launchdPath, HOME: home };
      const resolved = resolveAcpAdapters({
        resolveFrom,
        pins: [profile],
        environment,
        platform: 'linux',
        fileSystem: confinedTo(home),
      });
      await chmod(file, 0o644);

      const probed = await probeAcpAgents(resolved, { environment });

      expect(probed.refused).toEqual([expect.objectContaining({ id: profile.id, code: 'EXTERNAL_AGENT_UNAVAILABLE' })]);
      expect(probed.refused[0]?.message).toContain('EACCES');
      expect(parsedDescriptors(probed, profile, 'linux')[0]).not.toHaveProperty('fixCommand');
    });

    it('should stay advertised when --version is slow but inside the budget, with the model probe beside it', async () => {
      const home = await temporaryHome();
      await writeStub(inHome(home, firstHomeEntry(profile)), answering(profile.versionSample, 'sleep 0.3\n'));

      const { discovery } = await discoverIn(profile, home, { probeModels: true });

      expect(discovery.refused).toEqual([]);
      expect(discovery.agents.map((agent) => agent.id)).toEqual([profile.id]);
    }, 20_000);

    it('should stay advertised, with a logged warning, when the version line has no x.y.z', async () => {
      const home = await temporaryHome();
      await writeStub(inHome(home, firstHomeEntry(profile)), answering('ready'));

      const { discovery, warnings } = await discoverIn(profile, home);

      expect(discovery.refused).toEqual([]);
      expect(discovery.agents.map((agent) => agent.id)).toEqual([profile.id]);
      expect(warnings).toEqual([expect.stringContaining('ready')]);
    });
  });
});
