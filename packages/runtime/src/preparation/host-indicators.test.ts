import { describe, expect, it } from 'vitest';

import { detectHostIndicators, readHostIndicators } from '#preparation/host-indicators.js';
import type { HostProbes } from '#preparation/host-indicators.js';

const glibcLdd = '#!/bin/bash\n# ldd from the GNU C Library\nTEXTDOMAIN=libc\n';
const muslLdd = '#!/bin/sh\nexec /lib/ld-musl-x86_64.so.1 --list "$@"\n';
const plist =
  '<dict><key>ProductName</key><string>macOS</string><key>ProductVersion</key><string>14.6.1</string></dict>';

const probes = (overrides: Partial<HostProbes>): HostProbes => ({
  platform: 'linux',
  arch: 'x64',
  release: '6.8.0',
  readText: () => undefined,
  execute: () => undefined,
  report: () => ({ sharedObjects: [] }),
  threads: false,
  ...overrides,
});

describe('readHostIndicators', () => {
  it('should read glibc and its version from ldd and the diagnostic report', () => {
    const indicators = readHostIndicators(
      probes({ readText: () => glibcLdd, report: () => ({ glibcVersionRuntime: '2.39', sharedObjects: [] }) }),
    );

    expect(indicators).toEqual({
      os: 'linux',
      arch: 'x64',
      libc: 'glibc',
      libcVersion: '2.39',
      translated: false,
      wasm: { threads: false },
    });
  });

  it('should read musl from the ldd text', () => {
    expect(readHostIndicators(probes({ arch: 'arm64', readText: () => muslLdd }))).toMatchObject({
      os: 'linux',
      arch: 'arm64',
      libc: 'musl',
    });
  });

  it('should read musl from the loaded loader when ldd is missing', () => {
    const indicators = readHostIndicators(probes({ report: () => ({ sharedObjects: ['/lib/ld-musl-x86_64.so.1'] }) }));

    expect(indicators?.libc).toBe('musl');
    expect(indicators?.libcVersion).toBeUndefined();
  });

  it('should leave libc unknown when nothing names one', () => {
    expect(readHostIndicators(probes({}))).toEqual({
      os: 'linux',
      arch: 'x64',
      translated: false,
      wasm: { threads: false },
    });
  });

  it('should read the macOS version from SystemVersion.plist and never ask about Rosetta on arm64', () => {
    const asked: string[] = [];
    const indicators = readHostIndicators(
      probes({
        platform: 'darwin',
        arch: 'arm64',
        release: '23.6.0',
        readText: (path) => (path.endsWith('SystemVersion.plist') ? plist : undefined),
        execute: (file) => {
          asked.push(file);
          return '1';
        },
      }),
    );

    expect(indicators).toEqual({
      os: 'darwin',
      arch: 'arm64',
      osVersion: '14.6.1',
      translated: false,
      wasm: { threads: false },
    });
    expect(asked).toEqual([]);
  });

  it('should report an x64 process under Rosetta 2 as translated and fall back to the Darwin release', () => {
    const indicators = readHostIndicators(
      probes({
        platform: 'darwin',
        arch: 'x64',
        release: '24.1.0',
        execute: (file, arguments_) =>
          file === 'sysctl' && arguments_.includes('sysctl.proc_translated') ? '1' : undefined,
      }),
    );

    expect(indicators).toMatchObject({ os: 'darwin', arch: 'x64', osVersion: '15.0', translated: true });
  });

  it('should never report Windows as translated until the registry indicator is read', () => {
    expect(readHostIndicators(probes({ platform: 'win32', arch: 'arm64', release: '10.0.26100' }))).toEqual({
      os: 'win32',
      arch: 'arm64',
      osVersion: '10.0.26100',
      translated: false,
      wasm: { threads: false },
    });
  });

  it('should answer undefined for an OS or architecture no closure targets', () => {
    expect(readHostIndicators(probes({ platform: 'freebsd' }))).toBeUndefined();
    expect(readHostIndicators(probes({ arch: 'riscv64' }))).toBeUndefined();
  });

  it('should record cross-origin isolation as wasm threads', () => {
    expect(readHostIndicators(probes({ threads: true }))?.wasm).toEqual({ threads: true });
  });
});

describe('detectHostIndicators', () => {
  it('should describe this process and compute it once', () => {
    const first = detectHostIndicators();

    expect(first?.os).toBe(process.platform);
    expect(first?.arch).toBe(process.arch);
    expect(detectHostIndicators()).toBe(first);
  });
});
