import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { buildGeoSpecTypeBundle } from '#extract-geospec-types.js';

describe('GeoSpec public type extraction', () => {
  it('should match every public source export and the checked-in declarations', () => {
    const generated = buildGeoSpecTypeBundle();
    const checkedIn: unknown = JSON.parse(
      readFileSync(new URL('generated/geospec/geospec.bundled.json', import.meta.url), 'utf8'),
    );
    expect(generated).toStrictEqual(checkedIn);
    const manifest = JSON.parse(
      readFileSync(new URL('../../../packages/geospec/package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, string> };
    const expectedExports = Object.fromEntries(
      Object.entries(manifest.exports)
        .filter(([, source]) => source.startsWith('./src/'))
        .map(([specifier, source]) => [
          specifier,
          { types: source.replace('./src/', './').replace(/\.ts$/u, '.d.ts') },
        ]),
    );
    const bundle = generated['geospec']!;
    expect(bundle.packageJson['exports']).toStrictEqual(expectedExports);
    const files: Record<string, string> = { 'index.d.ts': bundle.content, ...bundle.files };
    for (const { types } of Object.values(expectedExports)) {
      expect(files[types.slice(2)]).toBeTruthy();
    }
    expect(bundle.files['runner/native/index.d.ts']).toContain('createNativeGeoSpecRunner');
    expect(bundle.files['model/index.d.ts']).toContain('loadModel');
    expect(bundle.files['create-geospec.d.ts']).toContain('expectGeo');
    const source = generated['geospec']!.files['model/types.d.ts']!;
    const ast = ts.createSourceFile('model/types.d.ts', source, ts.ScriptTarget.Latest, true);
    const options = ast.statements.find(
      (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'MeshSource',
    );
    if (!options || !ts.isTypeAliasDeclaration(options) || !ts.isUnionTypeNode(options.type)) {
      throw new Error('Missing public MeshSource union');
    }
    expect(options.type.types).toHaveLength(7);
    // The legacy TypeScript engine's evidence and STEP structure types left the public surface with it.
    const meshSource = generated['geospec']!.files['mesh/types.d.ts']!;
    const meshAst = ts.createSourceFile('mesh/types.d.ts', meshSource, ts.ScriptTarget.Latest, true);
    expect(meshAst.statements.filter(ts.isTypeAliasDeclaration).map((statement) => statement.name.text)).toStrictEqual([
      'Vec3',
      'MeshFileFormat',
      'GeometryFileFormat',
      'GeometryExportIntent',
      'GeometryDiagnostic',
    ]);
    for (const legacy of ['BrepEvidence', 'GeometrySubject', 'MeshQualityStats', 'StepEvidence', 'XdeReadResult']) {
      expect(bundle.content).not.toContain(legacy);
      expect(bundle.files['mesh/index.d.ts']).not.toContain(legacy);
    }
  }, 30_000);
});
