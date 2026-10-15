import { expectTypeOf, test } from 'vitest';

import { parsePluginDeployment } from '#preparation/plugin-deployment.js';
import type {
  DependencyPayload,
  DependencyTarget,
  Integrity,
  PayloadOrigin,
  PluginDeployment,
} from '#preparation/preparation.types.js';

test('parsePluginDeployment returns the schema v1 type', () => {
  expectTypeOf(parsePluginDeployment).returns.toEqualTypeOf<PluginDeployment>();
  expectTypeOf<PluginDeployment['schemaVersion']>().toEqualTypeOf<1>();
});

test('an integrity is an SRI string of a sha256, sha384 or sha512 digest', () => {
  expectTypeOf<'sha512-6WqK'>().toExtend<Integrity>();
  // @ts-expect-error — the hex `sha256:` spelling is not SRI.
  const hex: Integrity = 'sha256:1178515500000000000000000000000000000000000000000000000000000000';
  // @ts-expect-error — npm's legacy sha1 is not accepted for native payloads.
  const sha1: Integrity = 'sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=';
  expectTypeOf([hex, sha1]).toBeArray();
});

test('a Linux target names its libc and has no CPU-feature axis', () => {
  const linux: DependencyTarget = {
    runtime: 'native',
    os: 'linux',
    arch: 'x64',
    libc: 'glibc',
    minimumLibcVersion: '2.31',
  };
  // @ts-expect-error — `(os, arch)` alone is not a Linux target.
  const withoutLibc: DependencyTarget = { runtime: 'native', os: 'linux', arch: 'x64' };
  // @ts-expect-error — no CPU-feature or microarchitecture tiers exist.
  const tiered: DependencyTarget = { runtime: 'native', os: 'darwin', arch: 'arm64', microarch: 'v3' };
  // @ts-expect-error — browser targets vary on `threads` only; memory64 is refused.
  const memory64: DependencyTarget = { runtime: 'browser', wasmFeatures: ['memory64'] };
  expectTypeOf([linux, withoutLibc, tiered, memory64]).toBeArray();
});

test('an origin needs its canonical URL', () => {
  // @ts-expect-error — mirrors are further entries, never a replacement for the first URL.
  const empty: PayloadOrigin = { kind: 'url', urls: [] };
  expectTypeOf(empty).toExtend<PayloadOrigin>();
  expectTypeOf<DependencyPayload['format']>().toEqualTypeOf<'raw' | 'tar.gz' | 'zip' | 'wheel'>();
});
