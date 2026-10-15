import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { release } from 'node:os';

import { getIsolationStatus } from '#cross-origin-isolation/headers.js';
import type { HostIndicators } from '#preparation/preparation.types.js';

/**
 * The facts {@link readHostIndicators} reads, so a test can describe any host.
 * @internal
 */
export type HostProbes = {
  readonly platform: string;
  readonly arch: string;
  /** `os.release()`: the kernel release (Darwin, Linux) or the Windows version. */
  readonly release: string;
  /** Text of a small system file, or `undefined` when it cannot be read. */
  readonly readText: (path: string) => string | undefined;
  /** Trimmed stdout of a short system command, or `undefined` when it fails. */
  readonly execute: (file: string, arguments_: readonly string[]) => string | undefined;
  /** The glibc version and loaded shared objects from Node's diagnostic report. */
  readonly report: () => { readonly glibcVersionRuntime?: string; readonly sharedObjects: readonly string[] };
  /** Whether the realm is cross-origin isolated (pthreads WASM). */
  readonly threads: boolean;
};

const productVersionPattern = /<key>ProductVersion<\/key>\s*<string>(?<version>\d+(?:\.\d+)*)<\/string>/u;
const darwinReleasePattern = /^(?<major>\d+)\./u;
// On macOS, version 11 is Darwin 20; every later major is one Darwin major apart.
const firstDarwinOfMacosEleven = 20;
const darwinToMacosOffset = 9;

const macosVersion = (probes: HostProbes): string | undefined => {
  const plist = probes.readText('/System/Library/CoreServices/SystemVersion.plist');
  const fromPlist = plist === undefined ? undefined : productVersionPattern.exec(plist)?.groups?.['version'];
  if (fromPlist !== undefined) {
    return fromPlist;
  }
  const major = Number(darwinReleasePattern.exec(probes.release)?.groups?.['major']);
  return major >= firstDarwinOfMacosEleven ? `${major - darwinToMacosOffset}.0` : undefined;
};

// What npm, NAPI-RS and detect-libc do: the text of `ldd`, then Node's report.
const linuxLibc = (probes: HostProbes): Pick<HostIndicators, 'libc' | 'libcVersion'> => {
  const ldd = probes.readText('/usr/bin/ldd');
  const report = probes.report();
  const musl =
    ldd?.includes('musl') === true ||
    (ldd === undefined &&
      report.glibcVersionRuntime === undefined &&
      report.sharedObjects.some((path) => path.includes('libc.musl-') || path.includes('ld-musl-')));
  if (musl) {
    return { libc: 'musl' };
  }
  const glibc = report.glibcVersionRuntime !== undefined || ldd?.includes('GNU C Library') === true;
  if (!glibc) {
    return {};
  }
  return {
    libc: 'glibc',
    ...(report.glibcVersionRuntime === undefined ? {} : { libcVersion: report.glibcVersionRuntime }),
  };
};

/**
 * Read a host's indicators from probes. Windows reports its version and never `translated`: native kernels do not
 * run on Windows until a sandbox backend exists, so the emulation indicator (the registry's
 * `PROCESSOR_ARCHITECTURE`) is not read yet.
 * @internal
 * @param probes - The facts to read.
 * @returns The indicators, or `undefined` for an OS or architecture no Tau closure targets.
 */
export const readHostIndicators = (probes: HostProbes): HostIndicators | undefined => {
  const { platform, arch } = probes;
  if ((platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') || (arch !== 'arm64' && arch !== 'x64')) {
    return undefined;
  }
  const wasm = { threads: probes.threads };
  if (platform === 'darwin') {
    const osVersion = macosVersion(probes);
    // An arm64 process is never translated; only an x64 one can run under Rosetta 2.
    const translated = arch === 'x64' && probes.execute('sysctl', ['-n', 'sysctl.proc_translated']) === '1';
    return { os: platform, arch, ...(osVersion === undefined ? {} : { osVersion }), translated, wasm };
  }
  if (platform === 'linux') {
    return { os: platform, arch, ...linuxLibc(probes), translated: false, wasm };
  }
  return { os: platform, arch, osVersion: probes.release, translated: false, wasm };
};

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'latin1');
  } catch {
    return undefined;
  }
};

const execute = (file: string, arguments_: readonly string[]): string | undefined => {
  try {
    return execFileSync(file, arguments_, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
};

type DiagnosticReport = {
  readonly header?: { readonly glibcVersionRuntime?: string };
  readonly sharedObjects?: string[];
};

const report = (): ReturnType<HostProbes['report']> => {
  // The report is a debugging facility; reading it must not print anything or touch the network section.
  (process.report as typeof process.report & { excludeNetwork?: boolean }).excludeNetwork = true;
  const value = process.report.getReport() as DiagnosticReport;
  return {
    ...(value.header?.glibcVersionRuntime === undefined
      ? {}
      : { glibcVersionRuntime: value.header.glibcVersionRuntime }),
    sharedObjects: value.sharedObjects ?? [],
  };
};

let detected: { readonly indicators: HostIndicators | undefined } | undefined;

/**
 * This process's host indicators, computed once per process with no new dependency: `process.platform` and
 * `process.arch`; on Linux the libc family from `/usr/bin/ldd` and its version from Node's diagnostic report; on
 * macOS the version from `SystemVersion.plist` and Rosetta 2 translation from `sysctl.proc_translated`; threads from
 * `getIsolationStatus()`. Never CPU features.
 * @returns The indicators, or `undefined` on an OS or architecture no Tau closure targets.
 * @public
 */
export const detectHostIndicators = (): HostIndicators | undefined => {
  detected ??= {
    indicators: readHostIndicators({
      platform: process.platform,
      arch: process.arch,
      release: release(),
      readText,
      execute,
      report,
      threads: getIsolationStatus().crossOriginIsolated,
    }),
  };
  return detected.indicators;
};
