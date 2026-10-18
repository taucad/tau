import { describe, expect, it } from 'vitest';

import { parseTargetPylock, readUvLockVersions, renderProjectPylock, renderProjectPyproject } from '#template.js';

const owner = { packageName: '@taucad/example', project: 'example', kernelId: 'example' };

const targetPylock = (environment: string, packages: ReadonlyArray<readonly [string, string, string]>): string =>
  [
    'lock-version = "1.0"',
    `environments = [${JSON.stringify(environment)}]`,
    ...packages.flatMap(([name, version, wheel]) => [
      '',
      '[[packages]]',
      `name = "${name}"`,
      `version = "${version}"`,
      'index = "https://pypi.org/simple"',
      '',
      '[[packages.wheels]]',
      `name = "${wheel}"`,
      `url = "https://files.pythonhosted.org/${wheel}"`,
      'size = 7',
      `hashes = { sha256 = "${'a'.repeat(64)}" }`,
    ]),
  ].join('\n');

describe('renderProjectPylock', () => {
  const darwin = "sys_platform == 'darwin'";
  const linux = "sys_platform == 'linux'";

  it('marks a package only some targets install and lists every target wheel once', () => {
    const text = renderProjectPylock(
      [
        parseTargetPylock(
          targetPylock(darwin, [
            ['numpy', '2.0.0', 'numpy-mac.whl'],
            ['lib3mf', '2.5.0', 'lib3mf.whl'],
          ]),
        ),
        parseTargetPylock(
          targetPylock(linux, [
            ['numpy', '2.0.0', 'numpy-linux.whl'],
            ['coverage', '7.0', 'c.whl'],
          ]),
        ),
      ],
      owner,
    );

    expect(text).toContain(`[[packages]]\nname = "lib3mf"\nversion = "2.5.0"\nmarker = "(${darwin})"\n`);
    expect(text).toContain('[[packages]]\nname = "numpy"\nversion = "2.0.0"\nindex = "https://pypi.org/simple"\n');
    expect(text.indexOf('numpy-linux.whl')).toBeLessThan(text.indexOf('numpy-mac.whl'));
    expect(text).not.toContain('coverage');
    expect(text).toMatch(/^# The libraries this project runs, locked to the wheels Tau's example kernel runs/u);
    expect(text).toContain('`pnpm nx run example:generate-project-template`');
    expect(text).toContain('created-by = "@taucad/example"');
  });

  it('refuses targets that lock one package at different versions', () => {
    expect(() =>
      renderProjectPylock(
        [
          parseTargetPylock(targetPylock(darwin, [['numpy', '2.0.0', 'a.whl']])),
          parseTargetPylock(targetPylock(linux, [['numpy', '2.1.0', 'b.whl']])),
        ],
        owner,
      ),
    ).toThrow('numpy is locked at 2.0.0 and 2.1.0 on different targets.');
  });

  it('refuses a pylock it did not write', () => {
    expect(() => parseTargetPylock('lock-version = "1.0"\n')).toThrow('expected exactly one environment');
    expect(() =>
      parseTargetPylock(targetPylock(darwin, [['numpy', '2.0.0', 'a.whl']]).replace(/^hashes.*$/mu, '')),
    ).toThrow('numpy has no sha256');
  });
});

describe('renderProjectPyproject', () => {
  it('pins the kernel libraries and constrains every closure distribution, coverage aside', () => {
    const targets = [
      parseTargetPylock(
        targetPylock("sys_platform == 'linux'", [
          ['numpy', '2.0.0', 'numpy.whl'],
          ['example-lib', '1.0', 'lib.whl'],
          ['coverage', '7.0', 'c.whl'],
        ]),
      ),
    ];

    const text = renderProjectPyproject({ 'example-lib': '1.0' }, targets, owner);

    expect(text).toContain('dependencies = [\n  "example-lib==1.0",\n]');
    expect(text).toContain(`environments = [\n  "sys_platform == 'linux'",\n]`);
    expect(text).toContain('constraint-dependencies = [\n  "example-lib==1.0",\n  "numpy==2.0.0",\n]');
    expect(text).toContain("Tau's example kernel runs");
  });
});

describe('readUvLockVersions', () => {
  it('reads each locked distribution, the virtual root aside', () => {
    const lock = [
      'version = 1',
      '',
      '[[package]]',
      'name = "numpy"',
      'version = "2.0.0"',
      '',
      '[[package]]',
      'name = "tau-project"',
      'version = "0.1.0"',
      'source = { virtual = "." }',
    ].join('\n');

    expect(Object.fromEntries(readUvLockVersions(lock))).toEqual({ numpy: '2.0.0' });
    expect(() => readUvLockVersions('\n[[package]]\nname = "numpy"\n')).toThrow('Malformed pylock: no version');
  });
});
