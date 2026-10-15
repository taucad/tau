import { describe, expect, it } from 'vitest';

import { targetKey } from '#preparation/plugin-deployment.js';
import { selectVariant } from '#preparation/select-variant.js';
import type { SelectVariantOptions } from '#preparation/preparation-host.types.js';
import type { DependencyTarget, DependencyVariant, HostIndicators } from '#preparation/preparation.types.js';

const variant = (target: DependencyTarget): DependencyVariant => ({
  target,
  payloads: [
    {
      name: 'runtime',
      integrity: 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
      byteLength: 1,
      format: 'raw',
      origin: { kind: 'url', urls: ['https://registry.example/runtime'] },
      destination: '.',
    },
  ],
});

const darwinArm12 = variant({ runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '12.0' });
const darwinArm14 = variant({ runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' });
const darwinX64 = variant({ runtime: 'native', os: 'darwin', arch: 'x64', minimumOsVersion: '11.0' });
const linuxGlibc217 = variant({
  runtime: 'native',
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  minimumLibcVersion: '2.17',
});
const linuxGlibc231 = variant({
  runtime: 'native',
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  minimumLibcVersion: '2.31',
});
const linuxMusl = variant({ runtime: 'native', os: 'linux', arch: 'x64', libc: 'musl' });
const linuxArmGlibc = variant({ runtime: 'native', os: 'linux', arch: 'arm64', libc: 'glibc' });
const windowsX64 = variant({ runtime: 'native', os: 'win32', arch: 'x64' });
const browser = variant({ runtime: 'browser' });
const browserThreads = variant({ runtime: 'browser', threads: true });

const all = [
  darwinArm12,
  darwinArm14,
  darwinX64,
  linuxGlibc217,
  linuxGlibc231,
  linuxMusl,
  linuxArmGlibc,
  windowsX64,
  browser,
  browserThreads,
];

const host = (overrides: Partial<HostIndicators>): HostIndicators => ({
  os: 'linux',
  arch: 'x64',
  translated: false,
  wasm: { threads: false },
  ...overrides,
});

const macArm = (osVersion: string): HostIndicators => host({ os: 'darwin', arch: 'arm64', osVersion });
const glibc = (libcVersion: string, arch: HostIndicators['arch'] = 'x64'): HostIndicators =>
  host({ arch, libc: 'glibc', libcVersion });

type Row = {
  readonly name: string;
  readonly variants: readonly DependencyVariant[];
  readonly host: HostIndicators;
  readonly options?: SelectVariantOptions;
  readonly expected:
    | { readonly selected: DependencyVariant; readonly emulated?: boolean }
    | { readonly axis: string; readonly nearest?: DependencyVariant };
};

const rows: readonly Row[] = [
  // Exact key.
  {
    name: 'linux glibc host takes the glibc variant',
    variants: all,
    host: glibc('2.39'),
    expected: { selected: linuxGlibc231 },
  },
  {
    name: 'linux musl host takes the musl variant',
    variants: all,
    host: host({ libc: 'musl' }),
    expected: { selected: linuxMusl },
  },
  {
    name: 'linux arm64 glibc host takes its own arch',
    variants: all,
    host: glibc('2.39', 'arm64'),
    expected: { selected: linuxArmGlibc },
  },
  // Floors: the highest floor the host satisfies wins.
  {
    name: 'macOS 15 takes the macOS 14 floor',
    variants: all,
    host: macArm('15.1'),
    expected: { selected: darwinArm14 },
  },
  {
    name: 'macOS 13 falls back to the macOS 12 floor',
    variants: all,
    host: macArm('13.6.1'),
    expected: { selected: darwinArm12 },
  },
  {
    name: 'glibc 2.28 falls back to the 2.17 floor',
    variants: all,
    host: glibc('2.28'),
    expected: { selected: linuxGlibc217 },
  },
  {
    name: 'glibc 2.12 satisfies no floor',
    variants: [linuxGlibc217, linuxGlibc231],
    host: glibc('2.12'),
    expected: { axis: 'minimumLibcVersion', nearest: linuxGlibc217 },
  },
  {
    name: 'an unreadable glibc version satisfies no floor',
    variants: [linuxGlibc231],
    host: host({ libc: 'glibc' }),
    expected: { axis: 'minimumLibcVersion', nearest: linuxGlibc231 },
  },
  // Emulation: macOS arm64 retries x64 through Rosetta 2; Linux never falls back.
  {
    name: 'macOS 11 arm64 runs the x64 variant emulated',
    variants: all,
    host: macArm('11.7'),
    expected: { selected: darwinX64, emulated: true },
  },
  {
    name: 'windows arm64 runs the x64 variant emulated',
    variants: all,
    host: host({ os: 'win32', arch: 'arm64', osVersion: '10.0.26100' }),
    expected: { selected: windowsX64, emulated: true },
  },
  {
    name: 'emulation disabled refuses on the floor axis',
    variants: all,
    host: macArm('11.7'),
    options: { emulation: false },
    expected: { axis: 'minimumOsVersion', nearest: darwinArm12 },
  },
  {
    name: 'linux arm64 never takes an x64 variant',
    variants: [linuxGlibc231],
    host: glibc('2.39', 'arm64'),
    expected: { axis: 'arch', nearest: linuxGlibc231 },
  },
  // Unsupported axes.
  {
    name: 'an undeclared OS fails on os',
    variants: [darwinArm12],
    host: glibc('2.39'),
    expected: { axis: 'os', nearest: darwinArm12 },
  },
  {
    name: 'a glibc-only manifest fails a musl host on libc',
    variants: [linuxGlibc231],
    host: host({ libc: 'musl' }),
    expected: { axis: 'libc', nearest: linuxGlibc231 },
  },
  {
    name: 'a browser-only manifest fails a native realm on runtime',
    variants: [browser],
    host: glibc('2.39'),
    expected: { axis: 'runtime', nearest: browser },
  },
  // Forced target: never guessed.
  {
    name: 'a forced own key still checks floors',
    variants: all,
    host: glibc('2.28'),
    options: { target: 'linux-x64-glibc' },
    expected: { selected: linuxGlibc217 },
  },
  {
    name: 'a forced foreign key takes its lowest floor',
    variants: all,
    host: glibc('2.39'),
    options: { target: 'darwin-arm64' },
    expected: { selected: darwinArm12 },
  },
  {
    name: 'a forced undeclared key is unsupported',
    variants: [linuxGlibc231],
    host: glibc('2.39'),
    options: { target: 'linux-x64-musl' },
    expected: { axis: 'libc', nearest: linuxGlibc231 },
  },
  // Browser realm: threads only when cross-origin isolated.
  {
    name: 'an isolated browser takes the threads variant',
    variants: all,
    host: host({ wasm: { threads: true } }),
    options: { runtime: 'browser' },
    expected: { selected: browserThreads },
  },
  {
    name: 'a non-isolated browser takes the plain variant',
    variants: all,
    host: host({ wasm: { threads: false } }),
    options: { runtime: 'browser' },
    expected: { selected: browser },
  },
  {
    name: 'a non-isolated browser cannot take a threads-only manifest',
    variants: [browserThreads],
    host: host({ wasm: { threads: false } }),
    options: { runtime: 'browser' },
    expected: { axis: 'runtime', nearest: browserThreads },
  },
];

describe('selectVariant', () => {
  it.each(rows)('should answer as specified when $name', ({ variants, host: indicators, options, expected }) => {
    const selection = selectVariant(variants, indicators, options);

    if ('selected' in expected) {
      expect(selection).toMatchObject({ status: 'selected', emulated: expected.emulated ?? false });
      expect(selection.status === 'selected' && targetKey(selection.variant.target)).toBe(
        targetKey(expected.selected.target),
      );
      expect(selection.status === 'selected' && selection.variant).toBe(expected.selected);
    } else {
      expect(selection).toEqual({
        status: 'unsupported',
        axis: expected.axis,
        ...(expected.nearest === undefined ? {} : { nearest: expected.nearest.target }),
      });
    }
  });

  it('should list every considered target so two runs can be diffed', () => {
    const selection = selectVariant(all, macArm('11.7'));

    expect(selection.status === 'selected' && selection.candidates).toEqual([
      darwinArm14.target,
      darwinArm12.target,
      darwinX64.target,
    ]);
  });

  it('should be a pure function of the manifest and the indicators', () => {
    const indicators = glibc('2.39');
    const snapshot = structuredClone(all);

    expect(selectVariant(all, indicators)).toEqual(selectVariant(all, indicators));
    expect(all).toEqual(snapshot);
  });
});
