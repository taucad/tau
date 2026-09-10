import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundledTypes, buildShardTiers, shardOf, writeBundledTypes } from '#extract-opencascade-types.js';

const bundledTypes = buildBundledTypes();

describe('shardOf', () => {
  it('should split on the OCCT package prefix', () => {
    expect(shardOf('BRepPrimAPI_MakeBox')).toBe('BRepPrimAPI');
    expect(shardOf('NCollection_Array1_double')).toBe('NCollection');
    expect(shardOf('OpenCascadeInstance')).toBe('OpenCascadeInstance');
  });
});

describe('buildBundledTypes', () => {
  it('should emit one module per OCCT package plus the package root', () => {
    const shards = Object.keys(bundledTypes).filter((specifier) => specifier !== 'libcascade');

    expect(shards.length).toBeGreaterThan(200);
    expect(shards).toContain('libcascade/gp');
    expect(shards).toContain('libcascade/NCollection');
    expect(shards.every((specifier) => specifier.startsWith('libcascade/'))).toBe(true);
  });

  it('should re-export every shard from the package root and keep the default instance', () => {
    const root = bundledTypes['libcascade'] ?? '';

    for (const specifier of Object.keys(bundledTypes)) {
      if (specifier === 'libcascade') {
        continue;
      }
      expect(root).toContain(`export * from './${specifier.slice('libcascade/'.length)}/index.js';`);
    }
    expect(root).toContain('declare const oc: OpenCascadeInstance;\nexport default oc;');
    expect(root).toContain('declare global {');
  });

  it('should describe Tau synthetic named runtime exports as values and aliases as types', () => {
    expect(bundledTypes['libcascade/AppStd']).toContain('export {\n  AppStd_Application,\n};');
    expect(bundledTypes['libcascade/BRepPrimAPI']).toContain('  BRepPrimAPI_MakeBox,');
    expect(bundledTypes['libcascade/AppParCurves']).toContain(
      'export type {\n  AppParCurves_Array1OfConstraintCouple,',
    );
    expect(bundledTypes['libcascade/OpenCascadeInstance']).toContain('export type OpenCascadeInstance = {');
  });

  it('should import foreign symbols a shard references from their owning shard', () => {
    expect(bundledTypes['libcascade/BRepPrimAPI']).toContain("} from '../TopoDS/index.js';");
    expect(bundledTypes['libcascade/BRepPrimAPI']).toContain('  gp_Pnt,');
  });

  it('should pass declaration text through byte-for-byte', () => {
    const upstream = readFileSync(
      join(dirname(createRequire(import.meta.url).resolve('libcascade/package.json')), 'dist/types.d.ts'),
      'utf8',
    );
    const start = upstream.indexOf('declare class BRepPrimAPI_MakeBox ');
    const declaration = upstream.slice(start, upstream.indexOf('\n}\n', start) + 2);

    expect(start).toBeGreaterThan(0);
    expect(bundledTypes['libcascade/BRepPrimAPI']).toContain(declaration);
  });
});

describe('buildShardTiers', () => {
  it('should place the R14 authoring core eager and the rest cold', () => {
    const { eager, cold } = buildShardTiers(bundledTypes);

    expect(eager).toEqual(expect.arrayContaining(['gp', 'Geom', 'TopoDS', 'BRepPrimAPI', 'STEPControl']));
    expect(cold).toContain('NCollection');
    expect(eager).not.toContain('NCollection');
    expect(eager.length + cold.length).toBe(Object.keys(bundledTypes).length - 1);
  });
});

describe('writeBundledTypes', () => {
  it('should replace obsolete module roots with the exact bundled package set', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tau-libcascade-types-'));
    const outputDirectory = join(temporaryDirectory, 'generated', 'opencascade');
    const legacyDirectory = join(outputDirectory, 'modules', 'opencascade');
    const declaration = 'export declare const canonical: true;\n';

    try {
      mkdirSync(legacyDirectory, { recursive: true });
      writeFileSync(join(legacyDirectory, 'index.d.ts'), "export * from 'libcascade';\n");

      writeBundledTypes({ outputDirectory, bundledTypes: { libcascade: declaration, 'libcascade/gp': declaration } });

      expect(JSON.parse(readFileSync(join(outputDirectory, 'opencascade.bundled.json'), 'utf8'))).toEqual({
        libcascade: declaration,
        'libcascade/gp': declaration,
      });
      expect(JSON.parse(readFileSync(join(outputDirectory, 'opencascade.shards.json'), 'utf8'))).toEqual({
        eager: ['gp'],
        cold: [],
      });
      expect(readdirSync(join(outputDirectory, 'modules'))).toEqual(['libcascade']);
      expect(readFileSync(join(outputDirectory, 'modules', 'libcascade', 'index.d.ts'), 'utf8')).toBe(declaration);
      expect(readFileSync(join(outputDirectory, 'modules', 'libcascade', 'gp', 'index.d.ts'), 'utf8')).toBe(
        declaration,
      );
      expect(existsSync(legacyDirectory)).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
