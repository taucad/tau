import { describe, expect, it } from 'vitest';
import type { KernelProvider } from '@taucad/runtime';
import { createInitialProject } from '#constants/project.constants.js';
import type { CreateInitialProjectResult } from '#constants/project.constants.js';
import { getEmptyCode, getKernelOption, getMainFile } from '#utils/kernel.utils.js';

describe('createInitialProject', () => {
  it('should return fresh file buffers and a minimal module manifest', () => {
    const firstInput = new TextEncoder().encode('export default 1;');
    const secondInput = new TextEncoder().encode('export default 1;');

    const first = createInitialProject({
      projectName: 'First',
      mainFileName: 'main.ts',
      emptyCodeContent: firstInput,
      language: 'typescript',
    });
    const second = createInitialProject({
      projectName: 'First',
      mainFileName: 'main.ts',
      emptyCodeContent: secondInput,
      language: 'typescript',
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
      language: 'typescript',
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
      language: 'typescript',
      dependencies: { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' },
    });

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'package.json']);
    expect(packageJsonOf({ projectName: 'Plate' })).not.toHaveProperty('scripts');
  });

  const createForKernel = (kernel: KernelProvider): CreateInitialProjectResult =>
    createInitialProject({
      projectName: 'Plate',
      mainFileName: getMainFile(kernel),
      emptyCodeContent: new TextEncoder().encode(getEmptyCode(kernel)),
      language: getKernelOption(kernel).language,
      dependencies: kernel === 'replicad' ? { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' } : {},
    });

  it.each<[KernelProvider, string]>([
    ['openscad', 'main.scad'],
    ['picogk', 'main.cs'],
    ['build123d', 'main.py'],
    ['zoo', 'main.kcl'],
  ])('should write no package.json for the %s kernel, whose language npm does not serve', (kernel, mainFile) => {
    expect(Object.keys(createForKernel(kernel).files)).toEqual([mainFile]);
  });

  it('should keep the replicad project unchanged: its main file and a package.json declaring replicad', () => {
    const { files } = createForKernel('replicad');

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'package.json']);
    expect(JSON.parse(new TextDecoder().decode(files['package.json']?.content))).toEqual({
      name: 'plate',
      private: true,
      type: 'module',
      dependencies: { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' },
    });
  });
});
