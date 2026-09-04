import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { buildGeoSpecTypeBundle } from '#extract-geospec-types.js';

describe('GeoSpec public type extraction', () => {
  it('keeps checked-in LLM declarations identical to the public source and exposes the analysis union', () => {
    const generated = buildGeoSpecTypeBundle();
    const checkedIn: unknown = JSON.parse(
      readFileSync(new URL('generated/geospec/geospec.bundled.json', import.meta.url), 'utf8'),
    );
    expect(generated).toStrictEqual(checkedIn);
    const source = generated['geospec']!.files['mesh/load-mesh.d.ts']!;
    const ast = ts.createSourceFile('mesh/load-mesh.d.ts', source, ts.ScriptTarget.Latest, true);
    const options = ast.statements.find(
      (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'AnalyzeMeshOptions',
    );
    if (!options || !ts.isTypeAliasDeclaration(options) || !ts.isUnionTypeNode(options.type)) {
      throw new Error('Missing public AnalyzeMeshOptions union');
    }
    expect(options.type.types).toHaveLength(2);
    const statsSource = generated['geospec']!.files['mesh/types.d.ts']!;
    const statsAst = ts.createSourceFile('mesh/types.d.ts', statsSource, ts.ScriptTarget.Latest, true);
    const stats = statsAst.statements.find(
      (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'GeometryStats',
    );
    if (!stats || !ts.isTypeAliasDeclaration(stats) || !ts.isTypeLiteralNode(stats.type)) {
      throw new Error('Missing public GeometryStats');
    }
    expect(stats.type.members.map((member) => member.name?.getText(statsAst))).toEqual([
      'vertexCount',
      'meshCount',
      'triangleCount',
      'meshQuality',
      'watertight',
      'boundingBox',
    ]);
  });
});
