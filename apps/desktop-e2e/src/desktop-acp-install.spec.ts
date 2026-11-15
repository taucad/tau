import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { currentRun } from '#support/acp-evidence.js';
import { activeChatId, connectPickedFolder, expectVisible, selectAgent, submitPrompt } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
/* oxlint-disable no-restricted-imports -- This projectless e2e harness cannot resolve the host package export; the
 * reviewed profiles are the one place an agent's name, CLI, fallbacks and login command live (V14). */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import { acpAgentProfiles } from '../../../packages/host/src/acp/registry.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import type { AcpAgentProfile } from '../../../packages/host/src/acp/registry.js';
/* oxlint-enable no-restricted-imports */

/*
 * Finder-style ACP agent detection in the packaged app (ACP agent install paths blueprint, lane E5).
 *
 * A Finder or `.desktop` launch hands the app a bare PATH, so an agent CLI installed by its vendor's installer, a
 * Homebrew cask or a vendor app bundle is found only through the profile's declared fallbacks or the login-shell import.
 * Both modes launch the packaged app with that PATH and read the agent descriptors through the desktop bridge:
 *
 * - Shell off (the default): `TAU_E2E_KEEP_PATH=1` also skips the login-shell import, as
 *   `desktop-lfs-packaged.spec.ts` does, so discovery is proven not to need the shell.
 * - Shell on (`TAU_E2E_ACP_INSTALL_SHELL=on`): the same bare PATH with the import, which is what a Finder launch does.
 *
 * Either way every agent whose CLI exists at one of its profile's declared fallbacks on this machine must be advertised.
 * `TAU_E2E_ACP_INSTALL_SIGNED_OUT=<agent id>` adds one turn to that agent with its config directory (the profile's
 * first `configEnv`) pointed at an empty one, and expects the sign-in card's first command to be the profile's login
 * command, never a command that runs Tau's own Electron helper.
 *
 * Opt-in (`TAU_E2E_ACP_INSTALL=true`), macOS and Linux only: it needs the packaged app (the login-shell import runs only
 * there) and the operator's installed CLIs. The recorded run is the blueprint's device qualification (I7, Q9). A true
 * Finder launch (`open -n -a`) cannot be driven, because Playwright attaches only to an app it starts; that cell is read
 * from the `agent-host.external-agents` line of `desktop.log` instead.
 */

const enabled = process.env['TAU_E2E_ACP_INSTALL'] === 'true';
const shellSwitch = process.env['TAU_E2E_ACP_INSTALL_SHELL'] ?? 'off';
if (shellSwitch !== 'on' && shellSwitch !== 'off') {
  throw new Error(`TAU_E2E_ACP_INSTALL_SHELL must be on or off, not ${shellSwitch}.`);
}
const shell: 'on' | 'off' = shellSwitch;
const signedOutAgent = process.env['TAU_E2E_ACP_INSTALL_SIGNED_OUT'];

/** What a Finder launch gives an app on macOS, and what a `.desktop` launch commonly gives one on Linux. */
const finderPath = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);

/** A directory name that is a dotted version, e.g. `2.1.325`. */
const versionName = /^\d+(?:\.\d+)*$/u;

/**
 * Order directory entries as the locator expands a `*` segment: dotted versions first, newest first, then every other
 * name, descending.
 *
 * @param left - One entry name.
 * @param right - The other entry name.
 * @returns A negative number when `left` is tried first.
 */
export const fallbackEntryOrder = (left: string, right: string): number => {
  const leftIsVersion = versionName.test(left);
  const rightIsVersion = versionName.test(right);
  if (leftIsVersion !== rightIsVersion) {
    return leftIsVersion ? -1 : 1;
  }
  if (leftIsVersion) {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
      const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }
    return 0;
  }
  return left === right ? 0 : left < right ? 1 : -1;
};

/** The file-system reads fallback expansion needs, injectable so the expansion can be checked without the files. */
export type FallbackFileSystem = {
  readonly home: string;
  readonly listDirectory: (path: string) => readonly string[];
  readonly isExecutableFile: (path: string) => boolean;
};

/** The real file system, read without following anything the user did not install. */
export const localFileSystem: FallbackFileSystem = {
  home: homedir(),
  listDirectory: (path) => {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
  isExecutableFile: (path) => {
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
};

/**
 * Every concrete path one declared fallback names, in the order the locator tries them: `~/` is the home directory and
 * each `*` segment expands to that directory's entries in {@link fallbackEntryOrder}.
 *
 * @param candidate - A declared fallback, absolute or starting `~/`, with `/` separators.
 * @param fileSystem - Where to read directories.
 * @returns The concrete paths, possibly none.
 */
export const expandFallback = (candidate: string, fileSystem: FallbackFileSystem): readonly string[] => {
  const absolute = candidate.startsWith('~/') ? join(fileSystem.home, candidate.slice(2)) : candidate;
  const [first = '', ...rest] = absolute.split('/');
  let prefixes: readonly string[] = [first];
  for (const segment of rest) {
    prefixes =
      segment === '*'
        ? prefixes.flatMap((prefix) =>
            fileSystem
              .listDirectory(prefix === '' ? '/' : prefix)
              .toSorted(fallbackEntryOrder)
              .map((entry) => `${prefix}/${entry}`),
          )
        : prefixes.map((prefix) => `${prefix}/${segment}`);
  }
  return prefixes;
};

/**
 * The first executable file among a profile's declared fallbacks for this platform, as discovery would pick it when
 * PATH has none.
 *
 * @param profile - A reviewed agent profile.
 * @param platform - The platform whose fallbacks apply.
 * @param fileSystem - Where to look.
 * @returns The file, or `undefined` when no declared fallback exists here.
 */
export const locatedFallback = (
  profile: Pick<AcpAgentProfile, 'fallbackExecutables'>,
  platform: 'darwin' | 'linux',
  fileSystem: FallbackFileSystem,
): string | undefined =>
  (profile.fallbackExecutables?.[platform] ?? [])
    .flatMap((candidate) => expandFallback(candidate, fileSystem))
    .find((path) => fileSystem.isExecutableFile(path));

/**
 * Quote one argument for a POSIX shell (sign-in rule 4): left bare when it is plain, otherwise single-quoted.
 *
 * @param argument - One word of a command line.
 * @returns The word as a user can paste it.
 */
export const posixQuote = (argument: string): string =>
  /^[\w@%+=:,./-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", String.raw`'\''`)}'`;

/**
 * The sign-in commands the card may show first: the profile's `loginCommand` when the CLI was found on PATH, or the
 * same command naming the quoted fallback file when it was found only there (sign-in rule 1).
 *
 * @param profile - The signed-out agent's profile.
 * @param fallback - The fallback file this machine has for it, if any.
 * @returns The acceptable first commands.
 */
export const acceptableLoginCommands = (
  profile: Pick<AcpAgentProfile, 'cli' | 'loginCommand'>,
  fallback: string | undefined,
): readonly string[] => {
  const { cli, loginCommand } = profile;
  if (loginCommand === undefined) {
    return [];
  }
  if (cli === undefined || fallback === undefined || !loginCommand.startsWith(`${cli} `)) {
    return [loginCommand];
  }
  return [loginCommand, `${posixQuote(fallback)}${loginCommand.slice(cli.length)}`];
};

/** The reviewed profile with this registry id. */
const profileOf = (id: string): AcpAgentProfile => {
  const profile = acpAgentProfiles.find((candidate) => candidate.id === id);
  if (profile === undefined) {
    throw new Error(`No ACP agent profile ${id}. Profiles: ${acpAgentProfiles.map((each) => each.id).join(', ')}`);
  }
  return profile;
};

/** The platform these cases run on, or a failure that says why they cannot. */
const finderPlatform = (): 'darwin' | 'linux' => {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(`Finder-style ACP detection runs on macOS and Linux, not ${process.platform}.`);
  }
  return process.platform;
};

/** The agent descriptors main serves the renderer over `externalAgentsChannel`, parsed as every tier parses them. */
const readDescriptors = async (launched: DesktopSession): Promise<readonly ExternalAgentDescriptor[]> =>
  externalAgentDescriptorSchema.array().parse(
    await launched.page.evaluate(async () => {
      const { tau } = globalThis as typeof globalThis & { tau: { externalAgents(): Promise<unknown> } };
      return tau.externalAgents();
    }),
  );

/** The `agent-host.external-agents` lines main wrote, for the evidence file. */
const discoveryLog = (launched: DesktopSession): readonly string[] =>
  existsSync(launched.logPath)
    ? readFileSync(launched.logPath, 'utf8')
        .split('\n')
        .filter((line) => line.includes('agent-host.external-agents'))
    : [];

let session: DesktopSession | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

/** Launch the packaged app the way Finder does: the bare PATH, with or without the login-shell import. */
const launchFinderStyle = async (
  label: string,
  env: Readonly<Record<string, string>> = {},
): Promise<{ readonly launched: DesktopSession; readonly token: string }> => {
  const account = tauTestAccount(`acp-install-${label}`);
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({
    token,
    packaged: true,
    /* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
    env: {
      PATH: finderPath,
      /* `0`, not absent: an inherited `1` from the operator's shell would otherwise skip the import in shell-on mode. */
      TAU_E2E_KEEP_PATH: shell === 'off' ? '1' : '0',
      TAU_DESKTOP_UPDATES: 'off',
      /* An ad-hoc package signature cannot reach Electron's prior Keychain item unattended. */
      TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
      ...env,
    },
    /* eslint-enable @typescript-eslint/naming-convention -- End of environment names. */
  });
  await expectVisible(session.page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  return { launched: session, token };
};

test.skipIf(!enabled)(
  `[acp-install] advertises every agent whose CLI sits at a declared fallback (shell ${shell})`,
  async () => {
    const platform = finderPlatform();
    const expected = acpAgentProfiles.flatMap((profile) => {
      const fallback = locatedFallback(profile, platform, localFileSystem);
      return fallback === undefined ? [] : [{ id: profile.id, fallback }];
    });
    expect(
      expected.length,
      'No agent CLI sits at any declared fallback on this machine, so this run would prove nothing.',
    ).toBeGreaterThan(0);
    const { launched } = await launchFinderStyle(`detect-${shell}`);
    try {
      const descriptors = await readDescriptors(launched);
      const directory = await launched.capture(`acp-install-detect-${shell}`);
      writeFileSync(
        join(directory, 'acp-install.json'),
        JSON.stringify(
          {
            shell,
            platform,
            path: finderPath,
            expected,
            descriptors: descriptors.map(({ id, refusal, models }) => ({ id, refusal, models: models.length })),
            log: discoveryLog(launched),
          },
          undefined,
          2,
        ),
      );
      for (const { id, fallback } of expected) {
        const descriptor = descriptors.find((candidate) => candidate.id === id);
        expect(descriptor, `${id} (CLI at ${fallback}) is missing from the descriptors.`).toBeDefined();
        expect(descriptor?.refusal, `${id} (CLI at ${fallback}) was refused.`).toBeUndefined();
      }
    } catch (error) {
      await launched.capture(`acp-install-detect-${shell}-failure`);
      throw error;
    }
  },
  600_000,
);

test.skipIf(!enabled || signedOutAgent === undefined)(
  `[acp-install] shows ${signedOutAgent ?? 'an agent'}'s own login command first when it is signed out (shell ${shell})`,
  async () => {
    const platform = finderPlatform();
    const profile = profileOf(signedOutAgent ?? '');
    const [configVariable] = profile.configEnv;
    if (configVariable === undefined) {
      throw new Error(`${profile.id} declares no config directory to point at an empty one.`);
    }
    const acceptable = acceptableLoginCommands(profile, locatedFallback(profile, platform, localFileSystem));
    expect(acceptable.length, `${profile.id} declares no login command.`).toBeGreaterThan(0);
    /* The vendor reads its login from this directory, so an empty one signs the agent out without touching the
     * operator's own. A vendor that keeps its credential elsewhere still answers, and the poll below says so. */
    const emptyConfig = await mkdtemp(join(tmpdir(), `tau-acp-install-${profile.id}-`));
    const { launched, token } = await launchFinderStyle(`signed-out-${profile.id}-${shell}`, {
      [configVariable]: emptyConfig,
    });
    const { page } = launched;
    try {
      await authenticatePackagedDesktop(launched, token);
      await connectPickedFolder(launched);
      await selectAgent(page, profile.displayName);
      const slug = await submitPrompt(page, 'Reply only READY. Do not use tools.');
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const eventsPath = join(launched.pickedDirectory, slug, '.tau/chats', activeChatId(page), 'events.jsonl');
      const card = page.getByRole('region', { name: `Sign in to ${profile.displayName}` });
      await expect
        .poll(
          async () => {
            if (await card.isVisible()) {
              return 'card';
            }
            const lifecycle = currentRun(existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : '')?.lifecycle;
            return lifecycle === 'completed' ? `the turn completed, so ${profile.id} is still signed in` : 'waiting';
          },
          { timeout: 180_000, interval: 2000 },
        )
        .toBe('card');
      const commands = await card.locator('code').allTextContents();
      const directory = await launched.capture(`acp-install-signed-out-${profile.id}-${shell}`);
      writeFileSync(
        join(directory, 'acp-install-signed-out.json'),
        JSON.stringify({ agent: profile.id, shell, configVariable, acceptable, commands }, undefined, 2),
      );
      expect(acceptable).toContain(commands[0]);
      for (const command of commands) {
        expect(command, 'A sign-in command runs Tau’s own runtime.').not.toMatch(/Helper|app\.asar/u);
      }
    } catch (error) {
      await launched.capture(`acp-install-signed-out-${profile.id}-${shell}-failure`);
      throw error;
    }
  },
  600_000,
);
