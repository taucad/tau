import { describe, expect, it } from 'vitest';
import { createDesktopDownloadCatalog, desktopDownloadHref, desktopDownloads } from '#www/downloads.js';

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
});
