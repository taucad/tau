import { describe, expect, it } from 'vitest';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorDiagnostic } from '#lib/editor-diagnostics.js';
import {
  isVirtualDeclarationPath,
  isVirtualDeclarationUri,
  virtualDeclarationRoot,
  virtualDeclarationRoots,
} from '#lib/virtual-declarations.js';
import { getEditorLanguage } from '#lib/editor-languages.js';

describe('virtual declarations', () => {
  it.each([
    ['__typescript_lib__/lib.es5.d.ts', 'TypeScript library', 'typescript'],
    ['cdn-types/three/index.d.ts', 'Package types', 'typescript'],
    ['node_modules/replicad/index.d.ts', 'Package types', 'typescript'],
    ['__csharp_metadata__/System.Math.cs', 'C# metadata', 'csharp'],
    ['__kcl_std__/sketch.kcl', 'KCL standard library', 'kcl'],
    ['__openscad_builtins__/builtins.scad', 'OpenSCAD built-ins', 'openscad'],
  ])('should open %s as a %s tab in its own language', (path, label, language) => {
    expect(virtualDeclarationRoot(path)?.label).toBe(label);
    expect(isVirtualDeclarationUri(`file:///${path}`)).toBe(true);
    expect(getEditorLanguage(path)).toBe(language);
  });

  it.each([
    'main.kcl',
    'src/__kcl_std__/sketch.kcl',
    '__kcl_std__/notes.md',
    'cdn-types/three/index.js',
    'node_modules/replicad/index.js',
  ])('should treat %s as a project file', (path) => {
    expect(isVirtualDeclarationPath(path)).toBe(false);
  });

  it('should name every root once', () => {
    expect(new Set(virtualDeclarationRoots.map((root) => root.prefix)).size).toBe(virtualDeclarationRoots.length);
  });

  it('should keep diagnostics off library declarations but not project files', () => {
    const diagnostics = new EditorDiagnostics();
    const diagnostic = {
      from: 0,
      to: 1,
      message: 'Duplicate identifier',
      severity: 'error',
    } satisfies EditorDiagnostic;
    diagnostics.set('file:///__typescript_lib__/lib.es5.d.ts', 'typescript', [diagnostic]);
    diagnostics.set('file:///main.ts', 'typescript', [diagnostic]);
    expect(diagnostics.get('file:///__typescript_lib__/lib.es5.d.ts').size).toBe(0);
    expect(diagnostics.get('file:///main.ts').get('typescript')).toEqual([diagnostic]);
  });
});
