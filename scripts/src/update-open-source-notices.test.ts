import { describe, expect, it } from 'vitest';
import { generateNotices, parseVendoredComponents, platformFamilyName } from '#update-open-source-notices.mts';

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
    lgpl: 'GNU LESSER GENERAL PUBLIC LICENSE\n',
    occtException: 'Open CASCADE exception (version 1.0) to GNU LGPL version 2.1.\n',
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

  it('lists packages and vendored components with their licenses', () => {
    expect(notices).toContain('| [zod](https://github.com/colinhacks/zod) | 4.1.12 | MIT |');
    expect(notices).toContain('| unlabelled | 1.0.0 | Not declared |');
    expect(notices).toContain('| circuit-json | 0.0.485 | ISC, license text pending |');
  });
});
