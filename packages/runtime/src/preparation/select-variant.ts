import { targetKey } from '#preparation/plugin-deployment.js';
import type { SelectVariantOptions, VariantSelection } from '#preparation/preparation-host.types.js';
import type {
  DependencyTarget,
  DependencyVariant,
  HostIndicators,
  VariantAxis,
} from '#preparation/preparation.types.js';

type NativeTarget = Extract<DependencyTarget, { runtime: 'native' }>;

/**
 * Compare two dotted numeric versions (`12.0`, `2.31`, `14.6.1`); missing segments count as zero.
 * @internal
 * @param left - A version.
 * @param right - Another version.
 * @returns A negative number, zero or a positive number as `left` is lower, equal or higher.
 */
export const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const floorOf = (target: NativeTarget): string | undefined =>
  target.os === 'linux' ? target.minimumLibcVersion : target.minimumOsVersion;

const libcOf = (target: NativeTarget): string | undefined => (target.os === 'linux' ? target.libc : undefined);

const floorAxis = (target: NativeTarget): VariantAxis =>
  target.os === 'linux' ? 'minimumLibcVersion' : 'minimumOsVersion';

// A floor the host cannot read is not satisfied: guessing would launch a closure that may crash.
const floorSatisfied = (target: NativeTarget, host: HostIndicators): boolean => {
  const floor = floorOf(target);
  if (floor === undefined) {
    return true;
  }
  const version = target.os === 'linux' ? host.libcVersion : host.osVersion;
  return version !== undefined && compareVersions(version, floor) >= 0;
};

const byFloorDescending = (left: DependencyVariant, right: DependencyVariant): number =>
  compareVersions(floorOf(right.target as NativeTarget) ?? '0', floorOf(left.target as NativeTarget) ?? '0');

const hostKey = (host: HostIndicators, arch: HostIndicators['arch']): string =>
  host.os === 'linux' ? `linux-${arch}-${host.libc ?? 'unknown'}` : `${host.os}-${arch}`;

// The deepest axis on which the declared targets part from the host, and the variant that came closest.
const unsupported = (
  natives: readonly DependencyVariant[],
  host: HostIndicators,
): Extract<VariantSelection, { status: 'unsupported' }> => {
  const sameOs = natives.filter(({ target }) => (target as NativeTarget).os === host.os);
  if (sameOs.length === 0) {
    return { status: 'unsupported', axis: 'os', ...(natives[0] ? { nearest: natives[0].target } : {}) };
  }
  const sameArch = sameOs.filter(({ target }) => (target as NativeTarget).arch === host.arch);
  if (sameArch.length === 0) {
    return { status: 'unsupported', axis: 'arch', nearest: sameOs[0]!.target };
  }
  const hostLibc = host.os === 'linux' ? host.libc : undefined;
  const sameLibc = sameArch.filter(({ target }) => libcOf(target as NativeTarget) === hostLibc);
  if (sameLibc.length === 0) {
    return { status: 'unsupported', axis: 'libc', nearest: sameArch[0]!.target };
  }
  const nearest = sameLibc.toSorted(byFloorDescending).at(-1)!;
  return { status: 'unsupported', axis: floorAxis(nearest.target as NativeTarget), nearest: nearest.target };
};

const selectBrowser = (variants: readonly DependencyVariant[], host: HostIndicators): VariantSelection => {
  const browsers = variants.filter(({ target }) => target.runtime === 'browser');
  const threaded = browsers.find(({ target }) => target.runtime === 'browser' && target.threads === true);
  const plain = browsers.find(({ target }) => target.runtime === 'browser' && target.threads !== true);
  const variant = host.wasm.threads ? (threaded ?? plain) : plain;
  if (variant === undefined) {
    return { status: 'unsupported', axis: 'runtime', ...(threaded ? { nearest: threaded.target } : {}) };
  }
  return { status: 'selected', variant, candidates: browsers.map(({ target }) => target), emulated: false };
};

/**
 * Pick the variant a host runs, as a pure function of the manifest and the host's indicators:
 *
 * 1. keep the variants of the realm's runtime;
 * 2. keep the exact `(os, arch)` or `(os, arch, libc)` key, or the forced `target` key;
 * 3. keep those whose floor the host satisfies; the highest floor wins;
 * 4. on `(darwin, arm64)` (Rosetta 2) and `(win32, arm64)` (Windows x64 emulation) retry with `x64` and mark the
 *    choice `emulated`, unless `emulation` is `false`; Linux never falls back;
 * 5. otherwise answer `unsupported` with the failing axis and the nearest declared target;
 * 6. a browser realm takes the `threads` variant only when it is cross-origin isolated.
 *
 * A forced `target` the manifest does not declare is `unsupported`, never guessed. For a forced key other than the
 * host's own, floors cannot be checked against this host, so the lowest floor wins.
 * @param variants - One dependency's declared variants.
 * @param host - The host's indicators.
 * @param options - Realm, forced target key and emulation switch.
 * @returns The selected variant with the candidates considered, or the unsupported axis.
 * @public
 */
export const selectVariant = (
  variants: readonly DependencyVariant[],
  host: HostIndicators,
  options: SelectVariantOptions = {},
): VariantSelection => {
  if (options.runtime === 'browser') {
    return selectBrowser(variants, host);
  }
  const natives = variants.filter(({ target }) => target.runtime === 'native');
  if (natives.length === 0) {
    return { status: 'unsupported', axis: 'runtime', ...(variants[0] ? { nearest: variants[0].target } : {}) };
  }
  const keyed = (key: string): DependencyVariant[] =>
    natives.filter(({ target }) => targetKey(target) === key).toSorted(byFloorDescending);

  if (options.target !== undefined) {
    const forced = keyed(options.target);
    if (forced.length === 0) {
      const [os, arch, libc] = options.target.split('-');
      const forcedHost: HostIndicators = {
        ...host,
        os: os as HostIndicators['os'],
        arch: arch as HostIndicators['arch'],
        ...(libc === undefined ? {} : { libc: libc as NonNullable<HostIndicators['libc']> }),
      };
      return unsupported(natives, forcedHost);
    }
    const own = options.target === hostKey(host, host.arch);
    const variant = own ? forced.find(({ target }) => floorSatisfied(target as NativeTarget, host)) : forced.at(-1);
    if (variant === undefined) {
      return unsupported(natives, host);
    }
    return { status: 'selected', variant, candidates: forced.map(({ target }) => target), emulated: false };
  }

  const exact = keyed(hostKey(host, host.arch));
  const candidates = exact.map(({ target }) => target);
  const native = exact.find(({ target }) => floorSatisfied(target as NativeTarget, host));
  if (native !== undefined) {
    return { status: 'selected', variant: native, candidates, emulated: false };
  }
  const emulator = host.arch === 'arm64' && (host.os === 'darwin' || host.os === 'win32');
  if (emulator && options.emulation !== false) {
    const emulated = keyed(hostKey(host, 'x64'));
    const variant = emulated.find(({ target }) => floorSatisfied(target as NativeTarget, host));
    if (variant !== undefined) {
      return {
        status: 'selected',
        variant,
        candidates: [...candidates, ...emulated.map(({ target }) => target)],
        emulated: true,
      };
    }
  }
  return unsupported(natives, host);
};
