import { describe, expect, it } from 'vitest';
import {
  createDesktopDownloadCatalog,
  desktopDownloadHref,
  desktopDownloadLabel,
  archiveDownloads,
  desktopDownloads,
  desktopFileLabel,
  isArchivePlatform,
} from '#www/downloads.js';

import { projection } from '#www/download-catalog.fixture.js';

const select = (qualification: unknown) =>
  createDesktopDownloadCatalog({ enabled: true, channel: 'production', qualification });
describe('qualified desktop download catalog', () => {
  it('leaves current public downloads unchanged without explicit cutover', () => {
    expect(
      createDesktopDownloadCatalog({ enabled: false, channel: 'production', qualification: projection() }),
    ).toBeUndefined();
    expect(archiveDownloads.windows.file).toBe('Tau-win32-x64.zip');
    // A Mac has no archive fallback: it is offered only as the catalog's qualified DMG.
    expect(Object.hasOwn(desktopDownloads.mac, 'file')).toBe(false);
    expect(isArchivePlatform('mac')).toBe(false);
    expect(isArchivePlatform('macIntel')).toBe(false);
    expect(isArchivePlatform('linux')).toBe(true);
    expect(desktopDownloadHref('linux')).toBe('https://downloads.tau.new/latest/Tau-linux-x64.tar.gz');
  });
  it('selects immutable installer links with retained archives and truthful update ownership', () => {
    const catalog = select(projection())!;
    expect(catalog).toHaveLength(5);
    expect(catalog[0]?.href).toBe('https://downloads.tau.new/releases/desktop%400.2.0/Tau-macos-arm64.dmg');
    expect(catalog[0]?.alternatives[0]?.name).toBe('Tau-macos-arm64.zip');
    expect(catalog.find((item) => item.platform === 'windows')?.updates).toContain('ordinary quit does not install');
    expect(catalog.find((item) => item.platform === 'linux')?.updates).toContain('administrator enrollment');
    expect(catalog.find((item) => item.platform === 'linuxPortable')?.updates).toContain('manual replacement');
  });
  it.each([
    { schemaVersion: 2 },
    { promoted: false },
    { channel: 'staging' },
    { version: '0.3.0' },
    { sourceCommit: 'bad' },
    { extra: true },
    { routes: [] },
  ])('rejects unqualified or inconsistent catalog %j', (change) => {
    expect(() => select({ ...projection(), ...change })).toThrow();
  });
  it('requires actual CI and VM release qualification for every selected route', () => {
    for (const qualification of [
      { ci: false, vm: true, trust: 'release' },
      { ci: true, vm: false, trust: 'release' },
      { ci: true, vm: true, trust: 'test' },
    ]) {
      const value = projection();
      value.routes[0]!.qualification = qualification;
      expect(() => select(value)).toThrow();
    }
    const partial = projection();
    partial.routes.pop();
    expect(() => select(partial)).toThrow(/every supported route/u);
  });
  it('refuses malformed artifacts, duplicates and injected URLs', () => {
    for (const change of [
      { name: '../../evil.exe' },
      { sha256: 'wrong' },
      { size: 0 },
      { url: 'https://evil.test/file' },
      { kind: 'windows-nsis' },
    ]) {
      const value = projection();
      Object.assign(value.routes[0]!.artifacts[0]!, change);
      expect(() => select(value)).toThrow();
    }
    const inconsistent = projection();
    inconsistent.routes[4]!.artifacts[1]!.sha256 = 'c'.repeat(64);
    expect(() => select(inconsistent)).toThrow(/inconsistent bytes/u);
    const value = projection();
    value.routes.push(value.routes[0]!);
    expect(() => select(value)).toThrow(/duplicate/u);
  });
  it('admits a separately qualified staging subset with the mapped version', () => {
    const value = {
      ...projection(),
      tag: 'desktop-staging@0.1.0-staging.75',
      version: '1.0.75',
      channel: 'staging',
      routes: [projection().routes[0]!],
    };
    const catalog = createDesktopDownloadCatalog({ enabled: true, channel: 'staging', qualification: value });
    expect(catalog?.[0]?.href).toContain('https://downloads.taucad.dev/releases/desktop-staging%400.1.0-staging.75/');
    expect(() => select(value)).toThrow();
  });
  it('labels a direct Mac link as its DMG and keeps Windows and Linux labels', () => {
    expect(desktopFileLabel('mac')).toContain('<span>Download DMG for Apple silicon</span>');
    expect(desktopFileLabel('macIntel')).toContain('<span>Download DMG for Intel Mac</span>');
    expect(desktopFileLabel('windows')).toBe(desktopDownloadLabel('windows'));
    expect(desktopFileLabel('linux')).toBe(desktopDownloadLabel('linux'));
    expect(JSON.stringify(desktopDownloads)).not.toContain('Tau-macos');
  });
  it('selects both Mac disk images from a Mac-only staging catalog with mount, drag, eject and launch steps', () => {
    const value = projection();
    const catalog = createDesktopDownloadCatalog({
      enabled: true,
      channel: 'staging',
      qualification: {
        ...value,
        tag: 'desktop-staging@0.1.0-staging.455',
        version: '1.4.55',
        channel: 'staging',
        routes: value.routes.slice(0, 2),
      },
    })!;
    expect(catalog.map((choice) => [choice.platform, choice.primaryKind, choice.href])).toEqual([
      [
        'mac',
        'macos-dmg',
        'https://downloads.taucad.dev/releases/desktop-staging%400.1.0-staging.455/Tau-macos-arm64.dmg',
      ],
      [
        'macIntel',
        'macos-dmg',
        'https://downloads.taucad.dev/releases/desktop-staging%400.1.0-staging.455/Tau-macos-x64.dmg',
      ],
    ]);
    for (const choice of catalog) {
      expect(choice.detail).toContain('DMG installer');
      expect(choice.install).toMatch(
        /Open the DMG to mount it, drag Tau to Applications, eject the disk image, then launch/u,
      );
      expect(choice.alternatives.map((artifact) => artifact.href)).toEqual([choice.href.replace(/\.dmg$/u, '.zip')]);
    }
    expect(() =>
      createDesktopDownloadCatalog({
        enabled: true,
        channel: 'production',
        qualification: { ...value, routes: value.routes.slice(0, 2) },
      }),
    ).toThrow(/every supported route/u);
  });
  it('offers staging Mac disk images admitted on CI evidence and says clean-host testing is pending', () => {
    const value = projection();
    const staging = (routes: unknown[]) => ({
      ...value,
      tag: 'desktop-staging@0.1.0-staging.455',
      version: '1.4.55',
      channel: 'staging',
      routes,
    });
    const pending = value.routes.slice(0, 2).map((route) => ({
      ...route,
      qualification: { ci: true, vm: 'pending', trust: 'release' },
    }));
    const catalog = createDesktopDownloadCatalog({
      enabled: true,
      channel: 'staging',
      qualification: staging(pending),
    })!;
    expect(catalog.map((choice) => [choice.platform, choice.primaryKind, choice.cleanHost])).toEqual([
      ['mac', 'macos-dmg', 'pending'],
      ['macIntel', 'macos-dmg', 'pending'],
    ]);
    expect(catalog.map((choice) => choice.detail)).toEqual([
      'Apple silicon · DMG installer · clean-Mac install testing pending',
      'Intel Mac · DMG installer · clean-Mac install testing pending',
    ]);
    expect(catalog.every((choice) => choice.href.endsWith('.dmg'))).toBe(true);
    // One route may be clean-host qualified while the other is pending; each says only what it has.
    const mixed = createDesktopDownloadCatalog({
      enabled: true,
      channel: 'staging',
      qualification: staging([value.routes[0]!, pending[1]!]),
    })!;
    expect(mixed.map((choice) => [choice.cleanHost, choice.detail.includes('pending')])).toEqual([
      ['passed', false],
      ['pending', true],
    ]);
    expect(
      select(projection())!.every((choice) => choice.cleanHost === 'passed' && !choice.detail.includes('pending')),
    ).toBe(true);
    // Production admits pending clean-host acceptance only on the Mac routes, and says so on each.
    for (const index of value.routes.keys()) {
      const production = projection();
      production.routes[index]!.qualification = { ci: true, vm: 'pending', trust: 'release' };
      if (production.routes[index]!.route === 'macos-zip') {
        const admitted = select(production)!;
        expect(admitted.filter((choice) => choice.cleanHost === 'pending')).toHaveLength(1);
        expect(admitted.find((choice) => choice.cleanHost === 'pending')?.detail).toContain(
          'clean-Mac install testing pending',
        );
      } else {
        expect(() => select(production)).toThrow(/release qualification/u);
      }
    }
    // Staging admits it only on Mac routes, and only as the exact `pending` marker with release CI evidence.
    for (const index of [2, 3, 4]) {
      const route = { ...value.routes[index]!, qualification: { ci: true, vm: 'pending', trust: 'release' } };
      expect(() =>
        createDesktopDownloadCatalog({ enabled: true, channel: 'staging', qualification: staging([route]) }),
      ).toThrow(/release qualification/u);
    }
    for (const qualification of [
      { ci: true, vm: false, trust: 'release' },
      { ci: true, vm: 'skipped', trust: 'release' },
      { ci: true, vm: 'Pending', trust: 'release' },
      { ci: false, vm: 'pending', trust: 'release' },
      { ci: 'pending', vm: 'pending', trust: 'release' },
      { ci: true, vm: 'pending', trust: 'test' },
      { ci: true, vm: 'pending', trust: 'release', cleanHost: 'passed' },
    ]) {
      expect(() =>
        createDesktopDownloadCatalog({
          enabled: true,
          channel: 'staging',
          qualification: staging([{ ...pending[0]!, qualification }, pending[1]!]),
        }),
      ).toThrow();
    }
  });
  it('rejects a Mac route whose disk image is missing or replaced by another kind', () => {
    for (const artifacts of [
      [projection().routes[0]!.artifacts[1]!],
      [{ ...projection().routes[0]!.artifacts[1]! }, { ...projection().routes[0]!.artifacts[1]! }],
    ]) {
      const value = projection();
      value.routes[0]!.artifacts = artifacts;
      expect(() => select(value)).toThrow();
    }
  });
});

// D-H5: production composes one complete catalog per promoted platform, each from its own candidate and tag.
describe('composed per-platform desktop download catalog', () => {
  const platformCatalog = (keep: (route: { route: string; target: string }) => boolean) => {
    const value = projection();
    value.routes = value.routes.filter(keep);
    return value;
  };
  const mac = () => platformCatalog(({ route, target }) => route === 'macos-zip' && target === 'darwin-arm64');
  const linux = () => platformCatalog(({ target }) => target === 'linux-x64');
  const composed = (platforms: unknown[]) => ({ schemaVersion: 2, channel: 'production', promoted: true, platforms });

  it('admits a production Linux platform alone, then Mac and Linux from different tags', () => {
    expect(select(composed([{ lane: 'linux', catalog: linux() }]))?.map(({ platform }) => platform)).toEqual([
      'linux',
      'linuxPortable',
    ]);
    const later = { ...linux(), tag: 'desktop@0.3.0', version: '0.3.0' };
    later.routes = later.routes.map((route) => ({
      ...route,
      artifacts: route.artifacts.map((item) => ({ ...item, name: item.name.replaceAll('0.2.0', '0.3.0') })),
    }));
    const both = select(
      composed([
        { lane: 'macos', catalog: mac() },
        { lane: 'linux', catalog: later },
      ]),
    )!;
    expect(both.map(({ platform }) => platform)).toEqual(['mac', 'linux', 'linuxPortable']);
    expect(both[0]?.href).toBe('https://downloads.tau.new/releases/desktop%400.2.0/Tau-macos-arm64.dmg');
    expect(both[2]?.sha256).toHaveLength(64);
    expect(both[1]?.alternatives.some(({ href }) => href.includes('desktop%400.3.0'))).toBe(true);
  });

  it('refuses a partial, mislabelled, duplicated or other-channel platform', () => {
    const appImageOnly = platformCatalog(({ route }) => route === 'linux-appimage');
    for (const document of [
      composed([]),
      composed([{ lane: 'linux', catalog: appImageOnly }]),
      composed([{ lane: 'macos', catalog: linux() }]),
      composed([{ lane: 'linux', catalog: projection() }]),
      composed([{ lane: 'windows', catalog: projection() }]),
      composed([
        { lane: 'linux', catalog: linux() },
        { lane: 'linux', catalog: linux() },
      ]),
      { ...composed([{ lane: 'linux', catalog: linux() }]), channel: 'staging' },
      { ...composed([{ lane: 'linux', catalog: linux() }]), promoted: false },
      { ...composed([{ lane: 'linux', catalog: linux() }]), extra: true },
      composed([{ lane: 'linux', catalog: linux(), extra: true }]),
    ]) {
      expect(() => select(document)).toThrow();
    }
  });
});
