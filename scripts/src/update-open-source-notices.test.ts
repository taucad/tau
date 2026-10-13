import { describe, expect, it } from 'vitest';
import {
  desktopRuntimeDrift,
  enginePlatformPackages,
  generateNotices,
  parseOcctRevision,
  parseVendoredComponents,
  platformFamilyName,
} from '#update-open-source-notices.mts';

describe('parseVendoredComponents', () => {
  it('reads cleared and deferred components and skips prose headings', () => {
    const record = [
      '# Vendored tscircuit engine licences',
      '## @babel/runtime@7.29.7 — CLEARED (MIT)',
      '## About Kiwi',
      '## circuit-json@0.0.485 — DEFERRED (ISC)',
      '## graphics-debug@0.0.99 — DEFERRED (no SPDX field)',
    ].join('\n');

    expect(parseVendoredComponents(record)).toStrictEqual([
      { name: '@babel/runtime', version: '7.29.7', status: 'CLEARED', license: 'MIT' },
      { name: 'circuit-json', version: '0.0.485', status: 'DEFERRED', license: 'ISC' },
      { name: 'graphics-debug', version: '0.0.99', status: 'DEFERRED', license: 'no SPDX field' },
    ]);
  });
});

describe('platformFamilyName', () => {
  it('keeps packages without a platform restriction', () => {
    expect(platformFamilyName({}, 'sharp')).toBe('sharp');
  });

  it('lists every host build of a platform family under one name', () => {
    expect(platformFamilyName({ os: ['linux'] }, '@img/sharp-libvips-linux-x64')).toBe('@img/sharp-libvips-{platform}');
    expect(platformFamilyName({ os: ['darwin'] }, '@img/sharp-libvips-darwin-arm64')).toBe(
      '@img/sharp-libvips-{platform}',
    );
    expect(platformFamilyName({ cpu: ['x64'], os: ['linux'] }, '@esbuild/linux-x64')).toBe('@esbuild/{platform}');
  });

  it('leaves out platform-only packages outside a family, so every host generates the same file', () => {
    expect(platformFamilyName({ os: ['darwin'] }, 'fsevents')).toBeUndefined();
  });
});

describe('generateNotices', () => {
  const notices = generateNotices({
    packages: [
      { name: 'zod', version: '4.1.12', license: 'MIT', repository: 'https://github.com/colinhacks/zod' },
      {
        name: 'libcascade',
        version: '3.0.2',
        license: 'LGPL-2.1-only WITH Open-CASCADE-Exception-1.0',
        repository: 'https://github.com/taucad/opencascade.js',
      },
      { name: 'unlabelled', version: '1.0.0', license: 'UNKNOWN' },
    ],
    vendored: [{ name: 'circuit-json', version: '0.0.485', status: 'DEFERRED', license: 'ISC' }],
    desktopRuntime: {
      components: [
        {
          name: 'SkiaSharp',
          package: 'SkiaSharp',
          version: '3.119.0',
          copyright: 'Copyright (c) 2017-2018 Microsoft Corporation.',
          source: 'https://github.com/mono/SkiaSharp',
        },
      ],
      mitLicense: 'Permission is hereby granted, free of charge,\n',
    },
    lgpl: 'GNU LESSER GENERAL PUBLIC LICENSE\n',
    occtException: 'Open CASCADE exception (version 1.0) to GNU LGPL version 2.1.\n',
    engine: { version: '0.1.0-next.19', occtRevision: '3d097a0328e71b826377d4814ab05ec3c3d23871' },
  });

  it('names the installed GeoSpec engine release and the OCCT revision it compiles in', () => {
    expect(notices).toContain('- The GeoSpec engine (`geospec-engine` 0.1.0-next.19), built from OCCT upstream');
    expect(notices).toContain(
      '  revision `3d097a0328e71b826377d4814ab05ec3c3d23871` ([source](https://github.com/taucad/geospec))',
    );
  });

  it('gives the Open CASCADE notice, its components and the reverse-engineering permission', () => {
    expect(notices).toContain('facilities provided by the **Open CASCADE Technology** software');
    expect(notices).toContain('- libcascade 3.0.2 ([source](https://github.com/taucad/opencascade.js))');
    expect(notices).toContain('reverse engineer them to debug such modifications');
  });

  it('reproduces the LGPL-2.1 and Open CASCADE exception texts in full', () => {
    expect(notices).toContain('## GNU Lesser General Public License version 2.1\n\n```text\nGNU LESSER GENERAL');
    expect(notices).toContain('## Open CASCADE Exception version 1.0\n\n```text\nOpen CASCADE exception (version 1.0)');
  });

  it('lists the desktop C# runtime components and reproduces the MIT License', () => {
    expect(notices).toContain(
      '| [SkiaSharp](https://github.com/mono/SkiaSharp) | SkiaSharp | 3.119.0 | Copyright (c) 2017-2018 Microsoft Corporation. |',
    );
    expect(notices).toContain('## MIT License\n\n```text\nPermission is hereby granted, free of charge,');
  });

  it('lists packages and vendored components with their licenses', () => {
    expect(notices).toContain('| [zod](https://github.com/colinhacks/zod) | 4.1.12 | MIT |');
    expect(notices).toContain('| unlabelled | 1.0.0 | Not declared |');
    expect(notices).toContain('| circuit-json | 0.0.485 | ISC, license text pending |');
  });
});

describe('parseOcctRevision', () => {
  it('reads the revision pinned by the OCCT source archive URL', () => {
    const receipt = JSON.stringify({
      occtSourceArchive: {
        url: 'https://github.com/Open-Cascade-SAS/OCCT/archive/3d097a0328e71b826377d4814ab05ec3c3d23871.tar.gz',
      },
    });
    expect(parseOcctRevision(receipt)).toBe('3d097a0328e71b826377d4814ab05ec3c3d23871');
  });

  it('refuses a receipt that pins no revision', () => {
    expect(() =>
      parseOcctRevision(JSON.stringify({ occtSourceArchive: { url: 'https://example.com/occt.tar.gz' } })),
    ).toThrow('names no OCCT upstream revision');
  });
});

describe('enginePlatformPackages', () => {
  const engine = {
    name: 'geospec-engine',
    version: '0.1.0-next.19',
    license: 'Apache-2.0',
    repository: 'https://github.com/taucad/geospec',
  };

  it('lists every platform package the engine pins, whichever host is installed', () => {
    expect(
      enginePlatformPackages(engine, {
        'geospec-engine-linux-x64-gnu': '0.1.0-next.19',
        'geospec-engine-darwin-arm64': '0.1.0-next.19',
      }),
    ).toEqual([
      { ...engine, name: 'geospec-engine-darwin-arm64' },
      { ...engine, name: 'geospec-engine-linux-x64-gnu' },
    ]);
  });

  it('lists none when the engine pins no platform package', () => {
    expect(enginePlatformPackages(engine, undefined)).toEqual([]);
  });

  it('refuses a platform package pinned to a range', () => {
    expect(() => enginePlatformPackages(engine, { 'geospec-engine-darwin-arm64': '^0.1.0' })).toThrow(
      'not an exact version',
    );
  });

  it('refuses an optional dependency that is not an engine platform package', () => {
    expect(() => enginePlatformPackages(engine, { fsevents: '2.3.3' })).toThrow('outside its platform packages');
  });
});

describe('desktopRuntimeDrift', () => {
  const notices = {
    components: [
      { name: '.NET Runtime', package: 'Microsoft.NETCore.App.Runtime', version: '10.0.11', copyright: '', source: '' },
      { name: 'Roslyn', package: 'Microsoft.CodeAnalysis.CSharp', version: '5.9.0', copyright: '', source: '' },
    ],
    mitLicense: '',
  };

  it('accepts versions the lock resolves and packages the lock does not record', () => {
    expect(
      desktopRuntimeDrift(notices, {
        dependencies: { 'net10.0': { 'Microsoft.CodeAnalysis.CSharp': { resolved: '5.9.0' } } },
      }),
    ).toStrictEqual([]);
  });

  it('names a listed version the lock no longer resolves', () => {
    expect(
      desktopRuntimeDrift(notices, {
        dependencies: { 'net10.0': { 'Microsoft.CodeAnalysis.CSharp': { resolved: '5.10.0' } } },
      }),
    ).toStrictEqual(['Microsoft.CodeAnalysis.CSharp 5.9.0 != 5.10.0']);
  });
});
