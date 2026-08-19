import process from 'node:process';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { buildNamespaceBundle, buildApiData } from '#extract-jscad-types.js';

/**
 * Tests for the @jscad/modeling type extractor.
 *
 * Verifies that the generated output has the correct structure:
 * - Main `@jscad/modeling` module with foundation types + namespaces
 * - Subpath modules `@jscad/modeling/<ns>` for each namespace
 * - Proper `export` modifiers on all declarations
 * - Foundation types are defined and referenced correctly
 */

describe('module side effects', () => {
  it('does not execute main() when imported', () => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- process.exit returns never; mock must be cast to match
    const writeSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    expect(buildNamespaceBundle).toBeDefined();
    expect(buildApiData).toBeDefined();
    expect(typeof buildNamespaceBundle).toBe('function');
    expect(typeof buildApiData).toBe('function');
    writeSpy.mockRestore();
  });
});

let modules: Record<string, string>;
let mainModule: string;

beforeAll(() => {
  modules = buildNamespaceBundle();
  mainModule = modules['@jscad/modeling']!;
});

describe('extract-jscad-types', () => {
  // ---------------------------------------------------------------------------
  // Module map structure
  // ---------------------------------------------------------------------------

  it('produces a map with main module and subpath modules', () => {
    expect(Object.keys(modules)).toContain('@jscad/modeling');
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(15);
  });

  it('contains all 14 top-level namespace exports in main module', () => {
    const expectedNamespaces = [
      'colors',
      'curves',
      'geometries',
      'maths',
      'measurements',
      'primitives',
      'text',
      'utils',
      'booleans',
      'expansions',
      'extrusions',
      'hulls',
      'modifiers',
      'transforms',
    ];

    for (const ns of expectedNamespaces) {
      expect(mainModule).toContain(`export namespace ${ns} {`);
    }
  });

  // ---------------------------------------------------------------------------
  // Foundation types
  // ---------------------------------------------------------------------------

  it('exports foundation geometry types', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?type Vec3\b/);
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface Geom3\b/);
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface Geom2\b/);
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface Path2\b/);
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface Poly3\b/);
  });

  it('exports foundation color types', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?type RGB\b/);
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?type RGBA\b/);
    expect(mainModule).toContain('export type Color = RGB | RGBA');
  });

  it('exports RecursiveArray generic interface', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface RecursiveArray<T>/);
  });

  it('exports Geometry union type', () => {
    expect(mainModule).toContain('export type Geometry = Geom2 | Geom3 | Poly3 | Path2');
  });

  it('exports Mat4 type', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?type Mat4\b/);
  });

  // ---------------------------------------------------------------------------
  // Namespace content: primitives
  // ---------------------------------------------------------------------------

  it('exports cube function with export modifier', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?function cube\(/);
  });

  it('exports CubeOptions interface', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?interface CubeOptions/);
  });

  it('exports sphere function', () => {
    expect(mainModule).toMatch(/export\s+(?:declare\s+)?function sphere\(/);
  });

  // ---------------------------------------------------------------------------
  // Namespace content: booleans
  // ---------------------------------------------------------------------------

  it('exports union function with overloads', () => {
    const booleansModule = modules['@jscad/modeling/booleans']!;
    expect(booleansModule).toMatch(/export\s+(?:declare\s+)?function union\(/);
  });

  it('exports subtract and intersect functions', () => {
    const booleansModule = modules['@jscad/modeling/booleans']!;
    expect(booleansModule).toMatch(/export\s+(?:declare\s+)?function subtract\(/);
    expect(booleansModule).toMatch(/export\s+(?:declare\s+)?function intersect\(/);
  });

  // ---------------------------------------------------------------------------
  // Namespace content: transforms
  // ---------------------------------------------------------------------------

  it('exports translate function with resolved local Vec type', () => {
    const transformsModule = modules['@jscad/modeling/transforms']!;
    expect(transformsModule).toMatch(/export\s+(?:declare\s+)?function translate/);
    expect(transformsModule).toMatch(/export\s+(?:declare\s+)?type Vec\b/);
  });

  // ---------------------------------------------------------------------------
  // Subpath modules
  // ---------------------------------------------------------------------------

  it('contains subpath modules for all 14 namespaces', () => {
    const expectedSubpaths = [
      '@jscad/modeling/colors',
      '@jscad/modeling/curves',
      '@jscad/modeling/geometries',
      '@jscad/modeling/maths',
      '@jscad/modeling/measurements',
      '@jscad/modeling/primitives',
      '@jscad/modeling/text',
      '@jscad/modeling/utils',
      '@jscad/modeling/booleans',
      '@jscad/modeling/expansions',
      '@jscad/modeling/extrusions',
      '@jscad/modeling/hulls',
      '@jscad/modeling/modifiers',
      '@jscad/modeling/transforms',
    ];

    for (const subpath of expectedSubpaths) {
      expect(modules[subpath]).toBeDefined();
    }
  });

  it('subpath modules import foundation types from the main module', () => {
    const primitivesModule = modules['@jscad/modeling/primitives']!;
    expect(primitivesModule).toContain('import type {');
    expect(primitivesModule).toContain("} from '@jscad/modeling'");
  });

  it('subpath primitives module contains exported cube function', () => {
    const primitivesModule = modules['@jscad/modeling/primitives']!;
    expect(primitivesModule).toMatch(/export\s+(?:declare\s+)?function cube\(/);
  });

  it('subpath booleans module contains exported union function', () => {
    const booleansModule = modules['@jscad/modeling/booleans']!;
    expect(booleansModule).toMatch(/export\s+(?:declare\s+)?function union\(/);
  });

  it('no bare declare function statements in output', () => {
    for (const content of Object.values(modules)) {
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('declare function ')) {
          throw new Error(`Found bare 'declare function' (not exported): ${trimmed}`);
        }
      }
    }
  });
});
