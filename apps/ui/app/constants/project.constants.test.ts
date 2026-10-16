import { describe, expect, it } from 'vitest';
import type { KernelProvider } from '@taucad/runtime';
import { createInitialProject } from '#constants/project.constants.js';
import type { CreateInitialProjectResult } from '#constants/project.constants.js';
import {
  getEmptyCode,
  getKernelDependencies,
  getKernelOption,
  getKernelProjectTemplate,
  getMainFile,
} from '#utils/kernel.utils.js';

describe('createInitialProject', () => {
  it('should return fresh file buffers and a minimal module manifest', () => {
    const firstInput = new TextEncoder().encode('export default 1;');
    const secondInput = new TextEncoder().encode('export default 1;');

    const first = createInitialProject({
      projectName: 'First',
      mainFileName: 'main.ts',
      emptyCodeContent: firstInput,
      ecosystem: 'npm',
    });
    const second = createInitialProject({
      projectName: 'First',
      mainFileName: 'main.ts',
      emptyCodeContent: secondInput,
      ecosystem: 'npm',
    });

    const firstMain = first.files['main.ts']?.content;
    const secondMain = second.files['main.ts']?.content;
    const firstPackageJson = first.files['package.json']?.content;
    const secondPackageJson = second.files['package.json']?.content;

    expect(firstMain).toEqual(firstInput);
    expect(firstMain).not.toBe(firstInput);
    expect(firstMain?.buffer).not.toBe(firstInput.buffer);

    expect(secondMain).toEqual(secondInput);
    expect(secondMain).not.toBe(secondInput);
    expect(secondMain?.buffer).not.toBe(secondInput.buffer);

    expect(firstPackageJson).toBeInstanceOf(Uint8Array);
    expect(secondPackageJson).toBeInstanceOf(Uint8Array);
    expect(firstPackageJson).toEqual(secondPackageJson);
    expect(firstPackageJson).not.toBe(secondPackageJson);
    expect(firstPackageJson?.buffer).not.toBe(secondPackageJson?.buffer);
    expect(JSON.parse(new TextDecoder().decode(firstPackageJson))).toEqual({
      name: 'first',
      private: true,
      type: 'module',
    });
  });

  const packageJsonOf = (options: { projectName: string; dependencies?: Record<string, string> }): unknown => {
    const { files } = createInitialProject({
      ...options,
      mainFileName: 'main.ts',
      emptyCodeContent: new TextEncoder().encode(''),
      ecosystem: 'npm',
    });
    return JSON.parse(new TextDecoder().decode(files['package.json']?.content));
  };

  it.each([
    ['Mounting Bracket v2', 'mounting-bracket-v2'],
    ['  Café Déjà Vu!  ', 'cafe-deja-vu'],
    ['_private.thing', 'private-thing'],
    ['日本', 'tau-project'],
    ['', 'tau-project'],
    ['a'.repeat(300), 'a'.repeat(214)],
  ])('should name the package %j as %j', (projectName, name) => {
    expect(packageJsonOf({ projectName })).toMatchObject({ name });
  });

  it('should declare the kernel dependencies sorted by name, alias specs verbatim', () => {
    const packageJson = packageJsonOf({
      projectName: 'Circuit',
      dependencies: { tscircuit: 'npm:@tscircuit/core@0.0.1844', react: '19.2.7', '@tscircuit/props': '0.0.646' },
    });

    expect(packageJson).toEqual({
      name: 'circuit',
      private: true,
      type: 'module',
      dependencies: { '@tscircuit/props': '0.0.646', react: '19.2.7', tscircuit: 'npm:@tscircuit/core@0.0.1844' },
    });
    expect(Object.keys((packageJson as { dependencies: Record<string, string> }).dependencies)).toEqual([
      '@tscircuit/props',
      'react',
      'tscircuit',
    ]);
  });

  it('should write no lock and no scripts', () => {
    const { files } = createInitialProject({
      projectName: 'Plate',
      mainFileName: 'main.ts',
      emptyCodeContent: new TextEncoder().encode(''),
      ecosystem: 'npm',
      dependencies: { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' },
    });

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'package.json']);
    expect(packageJsonOf({ projectName: 'Plate' })).not.toHaveProperty('scripts');
  });

  const decode = (content: Uint8Array<ArrayBuffer> | undefined): string => new TextDecoder().decode(content);

  const createForKernel = async (kernel: KernelProvider, projectName = 'Plate'): Promise<CreateInitialProjectResult> =>
    createInitialProject({
      projectName,
      mainFileName: getMainFile(kernel),
      emptyCodeContent: new TextEncoder().encode(getEmptyCode(kernel)),
      ecosystem: getKernelOption(kernel).ecosystem,
      dependencies: await getKernelDependencies(kernel),
      template: await getKernelProjectTemplate(kernel),
    });

  it.each<[KernelProvider, string[]]>([
    ['openscad', ['main.scad']],
    ['zoo', ['main.kcl', 'project.toml']],
    ['build123d', ['main.py', 'pylock.toml', 'pyproject.toml', 'uv.lock']],
    ['picogk', ['MountingBracketV2.csproj', 'main.cs', 'packages.lock.json']],
    ['replicad', ['main.ts', 'package.json']],
  ])('should give a %s project the files its ecosystem reads: %j', async (kernel, paths) => {
    const { files } = await createForKernel(kernel, 'Mounting Bracket v2');

    expect(Object.keys(files).sort()).toEqual(paths);
  });

  it('should declare both Replicad and its OpenCascade runtime in the project', async () => {
    const { files } = await createForKernel('replicad');

    expect(JSON.parse(decode(files['package.json']?.content))).toEqual({
      name: 'plate',
      private: true,
      type: 'module',
      dependencies: {
        replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0',
        'replicad-opencascadejs': 'npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0',
      },
    });
  });

  it('should name a build123d project in pyproject.toml and uv.lock, keeping uv.lock sorted by name', async () => {
    const template = await getKernelProjectTemplate('build123d');
    const { files } = await createForKernel('build123d', 'Zebra Hinge');
    const pyproject = decode(files['pyproject.toml']?.content);
    const lock = decode(files['uv.lock']?.content);
    const lockedNames = [...lock.matchAll(/^\[\[package\]\]\nname = "(.*)"$/gmu)].map(([, name]) => String(name));

    expect(pyproject).toBe(template?.['pyproject.toml']?.replace('name = "tau-project"', 'name = "zebra-hinge"'));
    expect(pyproject).toContain('dependencies = [\n  "build123d==0.13.0",\n  "cadquery-ocp-novtk==8.0.1.0.0",\n]');
    expect(decode(files['pylock.toml']?.content)).toBe(template?.['pylock.toml']);
    expect(lock).toContain('[[package]]\nname = "zebra-hinge"\nversion = "0.1.0"\nsource = { virtual = "." }\n');
    expect(lock).not.toContain('tau-project');
    expect(lockedNames.at(-1)).toBe('zebra-hinge');
    expect(lockedNames).toEqual(lockedNames.toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
    expect(lock.length).toBe(template?.['uv.lock']?.replace('tau-project', 'zebra-hinge').length);
  });

  it.each([
    ['Mounting Bracket v2', 'MountingBracketV2'],
    ['  Café déjà vu!  ', 'CafeDejaVu'],
    ['3d printed clip', 'Project3dPrintedClip'],
    ['日本', 'TauProject'],
  ])(
    'should name the PicoGK project file for %j %s.csproj, with the template and lock verbatim',
    async (name, base) => {
      const template = await getKernelProjectTemplate('picogk');
      const { files } = await createForKernel('picogk', name);

      expect(decode(files[`${base}.csproj`]?.content)).toBe(template?.['project.csproj']);
      expect(decode(files['packages.lock.json']?.content)).toBe(template?.['packages.lock.json']);
    },
  );

  it("should write Zoo's project.toml for a KCL project, in millimetres", async () => {
    const { files } = await createForKernel('zoo');

    expect(decode(files['project.toml']?.content)).toBe('[settings.modeling]\nbase_unit = "mm"\n');
  });

  it('should refuse a pypi or nuget project without its kernel template', () => {
    expect(() =>
      createInitialProject({
        projectName: 'Plate',
        mainFileName: 'main.py',
        emptyCodeContent: new TextEncoder().encode(''),
        ecosystem: 'pypi',
      }),
    ).toThrow("A pypi project starts from its kernel's template, which has no pyproject.toml.");
  });
});
