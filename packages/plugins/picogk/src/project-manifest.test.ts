import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { libraryVersionMismatches, picogkProjectLibraries } from '#project-manifest.js';

const packageRoot = resolve(import.meta.dirname, '..');

describe('picogk project libraries', () => {
  it('equal the project template and the version its packages.lock.json resolves', async () => {
    const csproj = await readFile(resolve(packageRoot, 'project/project.csproj'), 'utf8');
    const lock = JSON.parse(await readFile(resolve(packageRoot, 'project/packages.lock.json'), 'utf8')) as {
      readonly dependencies: Readonly<
        Record<string, Readonly<Record<string, { readonly type: string; readonly resolved: string }>>>
      >;
    };

    expect(csproj).toContain('<PackageReference Include="PicoGK" Version="2.3.0" />');
    expect(libraryVersionMismatches('project.csproj', csproj)).toEqual([]);
    expect(Object.keys(lock.dependencies)).toEqual(['net10.0']);
    expect(lock.dependencies['net10.0']?.['PicoGK']).toMatchObject({
      type: 'Direct',
      resolved: picogkProjectLibraries['PicoGK'],
    });
  });
});

describe('libraryVersionMismatches', () => {
  const csproj = (references: string): string =>
    `<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n${references}\n  </ItemGroup>\n</Project>\n`;

  it('warns at a PicoGK reference to another exact version, in either attribute order', () => {
    const text = csproj('    <PackageReference Version="[2.2.0]" Include="picogk"/>');

    expect(libraryVersionMismatches('Plate.csproj', text)).toEqual([
      {
        message:
          'Plate.csproj references PicoGK 2.2.0, but the picogk kernel runs PicoGK 2.3.0. Set Version="2.3.0" on its PackageReference and restore, so the project runs the same library inside and outside Tau.',
        code: 'LIBRARY_VERSION_MISMATCH',
        type: 'kernel',
        severity: 'warning',
        location: { fileName: 'Plate.csproj', startLineNumber: 3, startColumn: 1 },
        details: {
          producer: { kernelId: 'picogk' },
          manifest: 'Plate.csproj',
          library: 'PicoGK',
          declared: '2.2.0',
          runs: '2.3.0',
        },
      },
    ]);
  });

  it('accepts the kernel version, floating and ranged versions, versionless and other packages', () => {
    const text = csproj(
      [
        '<PackageReference Include="PicoGK" Version="2.3.0" />',
        '<PackageReference Include="PicoGK" Version="2.*" />',
        '<PackageReference Include="PicoGK" Version="[2.0,3.0)" />',
        '<PackageReference Include="PicoGK" />',
        '<PackageReference Update="PicoGK" Version="1.0.0" />',
        '<PackageReference Include="SkiaSharp" Version="1.0.0" />',
      ].join('\n'),
    );

    expect(libraryVersionMismatches('Plate.csproj', text)).toEqual([]);
  });
});
