import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundledTypes, writeBundledTypes } from '#extract-opencascade-types.js';

describe('writeBundledTypes', () => {
  it('should describe Tau synthetic named runtime exports as values', () => {
    const content = buildBundledTypes()['libcascade'];

    expect(content).toContain('export {\n  AppStd_Application,');
    expect(content).toContain('  BRepPrimAPI_MakeBox,');
    expect(content).toContain('export type {\n  AppParCurves_Array1OfConstraintCouple,');
    expect(content).toContain('export type InitOpenCascadeOptions = {');
    expect(content).toContain('declare const oc: OpenCascadeInstance;\nexport default oc;');
  });

  it('should replace obsolete module roots with the exact bundled package set', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tau-libcascade-types-'));
    const outputDirectory = join(temporaryDirectory, 'generated', 'opencascade');
    const legacyDirectory = join(outputDirectory, 'modules', 'opencascade');
    const declaration = 'export declare const canonical: true;\n';

    try {
      mkdirSync(legacyDirectory, { recursive: true });
      writeFileSync(join(legacyDirectory, 'index.d.ts'), "export * from 'libcascade';\n");

      writeBundledTypes({ outputDirectory, bundledTypes: { libcascade: declaration } });

      expect(JSON.parse(readFileSync(join(outputDirectory, 'opencascade.bundled.json'), 'utf8'))).toEqual({
        libcascade: declaration,
      });
      expect(readdirSync(join(outputDirectory, 'modules'))).toEqual(['libcascade']);
      expect(readFileSync(join(outputDirectory, 'modules', 'libcascade', 'index.d.ts'), 'utf8')).toBe(declaration);
      expect(existsSync(legacyDirectory)).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
