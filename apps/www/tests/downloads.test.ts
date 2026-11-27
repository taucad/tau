import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createDesktopDownloadCatalog,
  desktopDownloadHref,
  desktopDownloadLabel,
  archiveDownloads,
  desktopDownloads,
  desktopFileLabel,
  isArchivePlatform,
  isBetaPlatform,
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
  it('marks every Windows and Linux route beta until it is qualified on a real device, and no Mac route', () => {
    expect(select(projection())!.map(({ platform }) => [platform, isBetaPlatform(platform)])).toEqual([
      ['mac', false],
      ['macIntel', false],
      ['windows', true],
      ['linux', true],
      ['linuxPortable', true],
    ]);
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
    // Production admits pending clean-host acceptance only on the Mac and beta Windows routes, and says so on each.
    for (const index of value.routes.keys()) {
      const production = projection();
      production.routes[index]!.qualification = { ci: true, vm: 'pending', trust: 'release' };
      const { route } = production.routes[index]!;
      if (route === 'macos-zip' || route === 'windows-nsis') {
        const admitted = select(production)!;
        expect(admitted.filter((choice) => choice.cleanHost === 'pending')).toHaveLength(1);
        expect(admitted.find((choice) => choice.cleanHost === 'pending')?.detail).toContain(
          route === 'windows-nsis' ? 'clean-Windows install testing pending' : 'clean-Mac install testing pending',
        );
      } else {
        expect(() => select(production)).toThrow(/release qualification/u);
      }
    }
    // Staging admits the beta Windows route as pending too (operator ruling 2026-11-17T08:27Z).
    const windowsPending = {
      ...value.routes[2]!,
      qualification: { ci: true, vm: 'pending', trust: 'release' },
    };
    expect(
      createDesktopDownloadCatalog({
        enabled: true,
        channel: 'staging',
        qualification: staging([windowsPending]),
      })!.map((choice) => [choice.platform, choice.cleanHost, choice.detail]),
    ).toEqual([['windows', 'pending', 'Windows x64 · per-user installer · clean-Windows install testing pending']]);
    // Linux never: only the exact `pending` marker on Mac and Windows routes, with release CI evidence.
    for (const index of [3, 4]) {
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
  const windows = () => platformCatalog(({ target }) => target === 'win32-x64');
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

  it('admits a production Windows platform alone and beside Mac and Linux', () => {
    expect(select(composed([{ lane: 'windows', catalog: windows() }]))?.map(({ platform }) => platform)).toEqual([
      'windows',
    ]);
    const all = select(
      composed([
        { lane: 'macos', catalog: mac() },
        { lane: 'windows', catalog: windows() },
        { lane: 'linux', catalog: linux() },
      ]),
    )!;
    expect(all.map(({ platform }) => platform)).toEqual(['mac', 'windows', 'linux', 'linuxPortable']);
    expect(all[1]?.href).toBe('https://downloads.tau.new/releases/desktop%400.2.0/Tau-win32-x64.exe');
  });

  it('refuses a partial, mislabelled, duplicated or other-channel platform', () => {
    const appImageOnly = platformCatalog(({ route }) => route === 'linux-appimage');
    for (const document of [
      composed([]),
      composed([{ lane: 'linux', catalog: appImageOnly }]),
      composed([{ lane: 'macos', catalog: linux() }]),
      composed([{ lane: 'linux', catalog: projection() }]),
      composed([{ lane: 'windows', catalog: projection() }]),
      composed([{ lane: 'windows', catalog: linux() }]),
      composed([{ lane: 'linux', catalog: windows() }]),
      composed([{ lane: '__proto__', catalog: windows() }]),
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

// The live composed catalogs, captured 2026-11-27 from downloads.taucad.dev and downloads.tau.new latest/installers.json.
describe('live composed desktop download catalogs', () => {
  type Live = {
    schemaVersion: 2;
    channel: 'staging' | 'production';
    promoted: true;
    platforms: Array<{
      lane: string;
      catalog: {
        tag: string;
        version: string;
        routes: Array<{
          route: string;
          target: string;
          artifacts: Array<{ kind: string; name: string; sha256: string; size: number }>;
        }>;
      };
    }>;
  };
  const live = (channel: 'staging' | 'production'): Live =>
    JSON.parse(readFileSync(new URL(`fixtures/installers-${channel}.json`, import.meta.url), 'utf8')) as Live;
  const admit = (document: Live) =>
    createDesktopDownloadCatalog({ enabled: true, channel: document.channel, qualification: document });
  const lane = (document: Live, name: string) => document.platforms.find((platform) => platform.lane === name)!;
  const appImage = (document: Live) =>
    lane(document, 'linux').catalog.routes.find((route) => route.route === 'linux-appimage')!;

  it.each([
    ['staging', 'https://downloads.taucad.dev/releases/desktop-staging%400.2.0-staging.1180', 'tau-staging'],
    ['production', 'https://downloads.tau.new/releases/desktop%400.4.0', 'tau'],
  ] as const)('admits every lane of the live %s catalog with the Apple silicon DMG first', (channel, macBase, deb) => {
    const document = live(channel);
    const catalog = admit(document)!;
    expect(catalog.map(({ platform }) => platform)).toEqual(['mac', 'linux', 'linuxPortable']);
    const dmg = lane(document, 'macos').catalog.routes[0]!.artifacts.find(({ kind }) => kind === 'macos-dmg')!;
    expect(catalog[0]).toMatchObject({
      href: `${macBase}/Tau-macos-arm64.dmg`,
      primaryKind: 'macos-dmg',
      cleanHost: 'pending',
      sha256: dmg.sha256,
      size: dmg.size,
    });
    // The managed AppImage's APT packages carry the channel's names, as the desktop release contract names them.
    const { version } = lane(document, 'linux').catalog;
    expect(catalog[2]?.href).toMatch(/\/Tau-linux-x64\.AppImage$/u);
    expect(catalog[2]?.alternatives.map(({ name }) => name).sort()).toEqual(
      [
        'Tau-linux-x64.tar.gz',
        `${deb}-appimage-runtime-${version}_${version}_amd64.deb`,
        `${deb}-appimage_${version}_amd64.deb`,
      ].sort(),
    );
  });

  it.each(['staging', 'production'] as const)(
    'keeps every AppImage artifact check strict on the live %s catalog',
    (channel) => {
      const other = channel === 'staging' ? 'tau-' : 'tau-staging-';
      const mutations: Array<(route: ReturnType<typeof appImage>) => void> = [
        // The route as it was before the 2026-11-16 Linux promotions: image and tar only.
        (route) => {
          route.artifacts = route.artifacts.filter(({ kind }) => kind === 'linux-appimage' || kind === 'linux-tar');
        },
        (route) => {
          route.artifacts = route.artifacts.filter(({ kind }) => kind !== 'linux-appimage-deb-selector');
        },
        // The other channel's package name.
        (route) => {
          const selector = route.artifacts.find(({ kind }) => kind === 'linux-appimage-deb-selector')!;
          selector.name = selector.name.replace(/^tau(?:-staging)?-/u, other);
        },
        // A version that disagrees with the lane's catalog.
        (route) => {
          const runtime = route.artifacts.find(({ kind }) => kind === 'linux-appimage-deb-runtime')!;
          runtime.name = runtime.name.replace(/_amd64\.deb$/u, '.1_amd64.deb');
        },
        // The APT route's package kind in place of the AppImage's.
        (route) => {
          const runtime = route.artifacts.find(({ kind }) => kind === 'linux-appimage-deb-runtime')!;
          runtime.kind = 'linux-deb-runtime';
        },
        (route) => {
          route.artifacts.push({ ...route.artifacts[0]! });
        },
      ];
      for (const mutate of mutations) {
        const document = live(channel);
        mutate(appImage(document));
        // Only the failing Linux lane is dropped; the Apple silicon DMG stays offered.
        expect(admit(document)!.map(({ platform }) => platform)).toEqual(['mac']);
        expect(() =>
          admit({ ...document, platforms: document.platforms.filter((platform) => platform.lane === 'linux') }),
        ).toThrow(/no qualified platform/u);
      }
    },
  );

  it('drops only the lane that fails admission and keeps every other lane', () => {
    const incompleteMac = live('staging');
    lane(incompleteMac, 'macos').catalog.routes[0]!.artifacts.pop();
    expect(admit(incompleteMac)!.map(({ platform }) => platform)).toEqual(['linux', 'linuxPortable']);

    const otherChannelMac = live('staging');
    lane(otherChannelMac, 'macos').catalog = lane(live('production'), 'macos').catalog;
    expect(admit(otherChannelMac)!.map(({ platform }) => platform)).toEqual(['linux', 'linuxPortable']);

    const unknownLane = live('production');
    unknownLane.platforms.push({ lane: 'beos', catalog: lane(unknownLane, 'macos').catalog });
    expect(admit(unknownLane)!.map(({ platform }) => platform)).toEqual(['mac', 'linux', 'linuxPortable']);

    // A lane named twice is ambiguous: every copy is dropped, and the other lanes stay.
    const duplicated = live('production');
    duplicated.platforms.push(lane(duplicated, 'linux'));
    expect(admit(duplicated)!.map(({ platform }) => platform)).toEqual(['mac']);

    // A lane carrying another platform's routes is dropped.
    const misfiled = live('production');
    misfiled.platforms = [
      { lane: 'windows', catalog: lane(misfiled, 'linux').catalog },
      ...misfiled.platforms.filter((platform) => platform.lane === 'macos'),
    ];
    expect(admit(misfiled)!.map(({ platform }) => platform)).toEqual(['mac']);

    // Document-level faults still reject the whole catalog.
    for (const change of [{ channel: 'staging' }, { promoted: false }, { platforms: [] }, { extra: true }]) {
      expect(() =>
        createDesktopDownloadCatalog({
          enabled: true,
          channel: 'production',
          qualification: { ...live('production'), ...change },
        }),
      ).toThrow();
    }
  });
});
