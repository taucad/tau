import { describe, expect, it } from 'vitest';
import {
  createDesktopDownloadCatalog,
  desktopDownloadHref,
  desktopDownloadLabel,
  desktopDownloads,
  desktopFileLabel,
} from '#www/downloads.js';

import { projection } from '#www/download-catalog.fixture.js';

const select = (qualification: unknown) =>
  createDesktopDownloadCatalog({ enabled: true, channel: 'production', qualification });
describe('qualified desktop download catalog', () => {
  it('leaves current public downloads unchanged without explicit cutover', () => {
    expect(
      createDesktopDownloadCatalog({ enabled: false, channel: 'production', qualification: projection() }),
    ).toBeUndefined();
    expect(desktopDownloads.mac.file).toBe('Tau-macos-arm64.zip');
    expect(desktopDownloads.windows.file).toBe('Tau-win32-x64.zip');
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
  it('names the Mac file format a direct link serves and keeps Windows and Linux labels', () => {
    expect(desktopFileLabel('mac')).toContain('<span>Download ZIP for Apple silicon</span>');
    expect(desktopFileLabel('macIntel')).toContain('<span>Download ZIP for Intel Mac</span>');
    expect(desktopFileLabel('mac', 'DMG')).toContain('<span>Download DMG for Apple silicon</span>');
    expect(desktopFileLabel('macIntel', 'DMG')).toContain('<span>Download DMG for Intel Mac</span>');
    expect(desktopFileLabel('windows', 'DMG')).toBe(desktopDownloadLabel('windows'));
    expect(desktopFileLabel('linux')).toBe(desktopDownloadLabel('linux'));
    expect(desktopDownloads.mac.detail).toContain('ZIP');
    expect(desktopDownloads.macIntel.detail).toContain('ZIP');
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
