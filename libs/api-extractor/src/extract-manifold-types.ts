#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Bundle manifold-3d type declarations as raw `.d.ts` content for Monaco's
 * `addExtraLib`.
 *
 * Unlike JSCAD (which needs full TS Compiler API extraction), manifold-3d
 * already ships self-contained `.d.ts` files. This script reads them,
 * strips relative imports, and outputs raw module `.d.ts` content that
 * Monaco registers at virtual file paths via standard module resolution.
 */

// =============================================================================
// Configuration
// =============================================================================

// Resolved, not path-joined: `manifold-3d` is a workspace dependency, so its
// install location is the package manager's business, not this script's. The
// package publishes each declaration file as its own export subpath.
//
// Nx cannot hash this source: its file map excludes `node_modules`, so a
// `{workspaceRoot}/node_modules/...` input — glob or explicit path — matches
// nothing and never invalidates. `pnpm-lock.yaml` is the target's real input.
const requireFromHere = createRequire(import.meta.url);

/** Declaration files this extractor reads, as `manifold-3d` export subpaths. @public */
export const manifoldDeclarationSubpaths = [
  'manifold-global-types.d.ts',
  'manifold-encapsulated-types.d.ts',
  'manifoldCAD.d.ts',
] as const;

/**
 * Resolve a `manifold-3d` declaration subpath to its installed file path.
 *
 * @param subpath - Export subpath, without the package name.
 * @returns Absolute path to the declaration file.
 */
export function resolveManifoldFile(subpath: string): string {
  return requireFromHere.resolve(`manifold-3d/${subpath}`);
}

// =============================================================================
// Helpers
// =============================================================================

function readManifoldFile(subpath: (typeof manifoldDeclarationSubpaths)[number]): string {
  return readFileSync(resolveManifoldFile(subpath), 'utf8');
}

function stripLicenseHeader(content: string): string {
  return content.replace(/^\/\/\s*Copyright[\S\s]*?\/\/\s*limitations under the License\.\s*\n*/m, '');
}

// =============================================================================
// Root module: manifold-3d
// =============================================================================

/**
 * Build the raw `.d.ts` content for the root `manifold-3d` module by inlining:
 *  - manifold-global-types.d.ts  (Vec2, Vec3, Mat3, Mat4, Box, etc.)
 *  - manifold-encapsulated-types.d.ts  (CrossSection, Manifold, Mesh classes)
 *  - ManifoldToplevel interface + Module default export from manifold.d.ts
 *
 * Relative imports between the source files are stripped because all types
 * are combined into a single module file.
 */
function buildRootModuleContent(): string {
  const globalTypes = stripLicenseHeader(readManifoldFile('manifold-global-types.d.ts'));

  let encapsulatedTypes = stripLicenseHeader(readManifoldFile('manifold-encapsulated-types.d.ts'));
  encapsulatedTypes = encapsulatedTypes.replaceAll(
    /import\s*{[^}]*}\s*from\s*["']\.\/manifold-global-types["'];?\s*\n?/g,
    '',
  );

  const rootModuleExtra = `
export interface ManifoldToplevel {
  CrossSection: typeof CrossSection;
  Manifold: typeof Manifold;
  Mesh: typeof Mesh;
  triangulate: typeof triangulate;
  setMinCircularAngle: typeof setMinCircularAngle;
  setMinCircularEdgeLength: typeof setMinCircularEdgeLength;
  setCircularSegments: typeof setCircularSegments;
  getCircularSegments: typeof getCircularSegments;
  resetToCircularDefaults: typeof resetToCircularDefaults;
  setup: () => void;
}

export default function Module(config?: {locateFile: () => string}):
    Promise<ManifoldToplevel>;
`;

  return [globalTypes.trim(), '', encapsulatedTypes.trim(), '', rootModuleExtra.trim()].join('\n');
}

// =============================================================================
// Subpath module: manifold-3d/manifoldCAD
// =============================================================================

/**
 * Build the raw `.d.ts` content for the `manifold-3d/manifoldCAD` subpath
 * from dist/manifoldCAD.d.ts, which is already self-contained (all types inline).
 */
function buildManifoldCadContent(): string {
  let content = stripLicenseHeader(readManifoldFile('manifoldCAD.d.ts'));

  // Strip the trailing `export { }` that api-extractor adds
  content = content.replace(/\nexport\s*{\s*}\s*$/, '');

  // Strip the @packageDocumentation / @module JSDoc block
  content = content.replace(/\/\*\*[\S\s]*?@packageDocumentation[\S\s]*?\*\/\s*\n?/, '');

  return content.trim();
}

// =============================================================================
// Output
// =============================================================================

/**
 * Build the bundled type declarations as a map of module path to raw `.d.ts`
 * content. Each entry is registered at its own virtual file path in Monaco.
 * Exported for testing.
 */
export function buildBundledTypes(): Record<string, string> {
  const rootContent = buildRootModuleContent();
  const manifoldCadContent = buildManifoldCadContent();

  return {
    'manifold-3d': [
      '// Bundled type declarations for manifold-3d.',
      '// Auto-generated by extract-manifold-types.ts - do not edit manually.',
      '',
      rootContent,
      '',
    ].join('\n'),
    'manifold-3d/manifoldCAD': [
      '// Bundled type declarations for manifold-3d/manifoldCAD.',
      '// Auto-generated by extract-manifold-types.ts - do not edit manually.',
      '',
      manifoldCadContent,
      '',
    ].join('\n'),
  };
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  try {
    console.log('Extracting manifold-3d type declarations...\n');
    for (const subpath of manifoldDeclarationSubpaths) {
      console.log(`Source: ${resolveManifoldFile(subpath)}`);
    }

    const outputDirectory = join(import.meta.dirname, 'generated/manifold');
    mkdirSync(outputDirectory, { recursive: true });
    console.log(`Output directory: ${outputDirectory}`);

    const bundledTypes = buildBundledTypes();
    const outputPath = join(outputDirectory, 'manifold.bundled.json');
    writeFileSync(outputPath, JSON.stringify(bundledTypes));
    console.log(`\nBundled type declarations written to ${outputPath}`);
    for (const [name, content] of Object.entries(bundledTypes)) {
      console.log(`  - ${name} (${(content.length / 1024).toFixed(1)} KB)`);
    }

    // Write individual .d.ts files for type-level testing
    const modulesDirectory = join(outputDirectory, 'modules');
    for (const [modulePath, content] of Object.entries(bundledTypes)) {
      const targetDirectory = join(modulesDirectory, modulePath);
      mkdirSync(targetDirectory, { recursive: true });
      writeFileSync(join(targetDirectory, 'index.d.ts'), content);
    }

    console.log('\nmanifold-3d type extraction completed successfully!');
  } catch (error) {
    console.error('Error during manifold-3d type extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
