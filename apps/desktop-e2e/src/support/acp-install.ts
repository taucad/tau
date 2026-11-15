/* oxlint-disable no-restricted-imports -- This projectless e2e harness cannot resolve the host package export; the
 * reviewed profiles and their locator are the one place an agent's CLI and fallbacks live (V14). */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import { acpLocalFileSystem, acpLocateContext, locateAcpCli } from '../../../../packages/host/src/acp/locate.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import type { AcpExecutableFileSystem } from '../../../../packages/host/src/acp/locate.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import type { AcpAgentProfile } from '../../../../packages/host/src/acp/registry.js';
/* oxlint-enable no-restricted-imports */

/*
 * Oracles for the Finder-style ACP install cases (`desktop-acp-install.spec.ts`, ACP agent install paths blueprint
 * lane E5): which agents this machine has at a declared fallback, and which sign-in command the card may show first.
 */

/** The file-system reads fallback location needs: the home a leading `~/` stands for, and the locator's probes. */
export type FallbackFileSystem = AcpExecutableFileSystem & {
  readonly home: string;
};

/**
 * The first executable file among a profile's declared fallbacks for this platform, as discovery would pick it when
 * PATH has none. It is the host's own locator with an empty PATH, so `*` segments expand as discovery expands them.
 *
 * @param profile - A reviewed agent profile.
 * @param platform - The platform whose fallbacks apply.
 * @param fileSystem - Where to look; this machine's own files and home by default.
 * @returns The file, or `undefined` when no declared fallback exists here.
 */
export const locatedFallback = (
  profile: Pick<AcpAgentProfile, 'cli' | 'fallbackExecutables'>,
  platform: 'darwin' | 'linux',
  fileSystem?: FallbackFileSystem,
): string | undefined => {
  const location = locateAcpCli(
    profile,
    acpLocateContext({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
      environment: { PATH: '', ...(fileSystem === undefined ? {} : { HOME: fileSystem.home }) },
      platform,
      fileSystem: fileSystem ?? acpLocalFileSystem,
    }),
  );
  return location?.found === true && location.executableSource === 'fallback' ? location.executablePath : undefined;
};

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
  if (cli === undefined || fallback === undefined || (loginCommand !== cli && !loginCommand.startsWith(`${cli} `))) {
    return [loginCommand];
  }
  return [loginCommand, `${posixQuote(fallback)}${loginCommand.slice(cli.length)}`];
};
