import { FuseV1Options } from '@electron/fuses';

export type MacosPackageMode = { readonly release: boolean; readonly unsigned: boolean; readonly zip: boolean };

const flags = new Set(['--release', '--unsigned', '--zip']);

export const parseMacosPackageMode = (arguments_: readonly string[]): MacosPackageMode => {
  if (arguments_.some((argument) => !flags.has(argument))) {
    throw new TypeError('Usage: <script> [--release | --unsigned] [--zip]');
  }
  const release = arguments_.includes('--release');
  const unsigned = arguments_.includes('--unsigned');
  if (release && unsigned) {
    throw new TypeError('--release and --unsigned cannot be used together');
  }
  // The distribution archive is release output; any other mode writes it only on request.
  return { release, unsigned, zip: release || arguments_.includes('--zip') };
};

/**
 * Electron fuses every macOS package flips before signing, keyed by fuse index.
 *
 * `RunAsNode` stays at Electron's default (enabled): the services utility runs
 * the bundled ACP adapters as `ELECTRON_RUN_AS_NODE=1 <Tau> <adapter>`
 * (`packages/host/src/acp/spawn.ts`), and the package verifier probes the
 * packaged runtime the same way. `--inspect` is refused only in a release:
 * Playwright's Electron launcher attaches to main through `--inspect=0`, and
 * the packaged e2e lane launches the ad-hoc package.
 *
 * @param mode - The package mode; only `release` changes the set.
 * @returns The fuse states to write; an omitted fuse keeps Electron's default.
 */
export const macosPackageFuses = (
  mode: Pick<MacosPackageMode, 'release'>,
): Partial<Record<FuseV1Options, boolean>> => ({
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: !mode.release,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});
