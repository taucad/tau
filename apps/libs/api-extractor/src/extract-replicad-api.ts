#!/usr/bin/env node
/* oxlint-disable no-bitwise -- Utility script using TS Compiler API with bitwise flag checks */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import type { ApiData, ApiEntry } from '#api-extraction.types.js';

// =============================================================================
// Configuration
// =============================================================================

const typeDefinitionsPath = join(import.meta.dirname, '../../../../node_modules/replicad/dist/replicad.d.ts');

// =============================================================================
// Categorization
// =============================================================================

function categorizeApi(name: string): string {
  if (/^draw[A-Z]|^sketch[A-Z]|Blueprint|Drawing|Pen/.test(name)) {
    return 'Drawing & Sketching';
  }

  if (/^make[A-Z]|Circle|Rectangle|Polygon|Box|Cylinder|Sphere/.test(name)) {
    return 'Primitives & Makers';
  }

  if (/extrude|revolve|shell|loft|sweep|Extrusion/.test(name)) {
    return '3D Operations';
  }

  if (/fillet|chamfer|cut|fuse|intersect|offset/.test(name)) {
    return 'Modifications';
  }

  if (/translate|rotate|scale|mirror|Transformation/.test(name)) {
    return 'Transformations';
  }

  if (/Finder|Edge|Face|Wire|Corner/.test(name)) {
    return 'Finders & Filters';
  }

  if (/measure|distance|area|volume|length|Properties/.test(name)) {
    return 'Measurements';
  }

  if (/Point|Vector|Plane|Shape|Vertex|Edge|Wire|Face|Shell|Solid/.test(name)) {
    return 'Geometry Types';
  }

  if (/import|export|STEP|STL|mesh|blob/.test(name)) {
    return 'Import/Export';
  }

  return 'Utilities';
}

// =============================================================================
// Class Member Filtering
// =============================================================================

function getMemberName(member: ts.ClassElement): string {
  if ('name' in member && member.name) {
    if (ts.isIdentifier(member.name)) {
      return member.name.text;
    }

    return member.name.getText();
  }

  return 'unknown';
}

function shouldExcludeMember(member: ts.ClassElement): boolean {
  const memberName = getMemberName(member);

  // Exclude "oc" property (OpenCascade internal)
  if (memberName === 'oc') {
    return true;
  }

  // Exclude private/protected members
  const modifierFlags = ts.getCombinedModifierFlags(member);
  if (modifierFlags & ts.ModifierFlags.Private || modifierFlags & ts.ModifierFlags.Protected) {
    return true;
  }

  // Exclude underscore-prefixed (private convention)
  if (memberName.startsWith('_')) {
    return true;
  }

  return false;
}

// =============================================================================
// API Extraction
// =============================================================================

const printer = ts.createPrinter({
  omitTrailingSemicolon: false,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: true,
});

function getTypeText(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!typeNode) {
    return 'any';
  }

  return typeNode.getText(sourceFile);
}

/**
 * Extract structured API entries from the replicad type definitions file.
 * Exported for testing.
 */
export function extractApi(): ApiEntry[] {
  const sourceCode = readFileSync(typeDefinitionsPath, 'utf8');
  const sourceFile = ts.createSourceFile(typeDefinitionsPath, sourceCode, ts.ScriptTarget.Latest, true);
  const entries: ApiEntry[] = [];

  function isExported(node: ts.Node): boolean {
    const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
    return Boolean(flags & ts.ModifierFlags.Export || flags & ts.ModifierFlags.Ambient);
  }

  function visit(node: ts.Node): void {
    // Functions
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      entries.push({
        name: node.name.text,
        kind: 'function',
        category: categorizeApi(node.name.text),
        signature: printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim(),
        parameters: node.parameters.map((parameter) => ({
          name: parameter.name.getText(sourceFile),
          type: getTypeText(parameter.type, sourceFile),
          optional: Boolean(parameter.questionToken) || parameter.initializer !== undefined,
        })),
        returnType: getTypeText(node.type, sourceFile),
      });
    }

    // Classes (with member filtering)
    else if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
      const filteredMembers = node.members.filter((member) => !shouldExcludeMember(member));
      const filteredClass = ts.factory.updateClassDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        filteredMembers,
      );

      entries.push({
        name: node.name.text,
        kind: 'class',
        category: categorizeApi(node.name.text),
        signature: printer.printNode(ts.EmitHint.Unspecified, filteredClass, sourceFile).trim(),
      });
    }

    // Type aliases
    else if (ts.isTypeAliasDeclaration(node) && isExported(node)) {
      entries.push({
        name: node.name.text,
        kind: 'type',
        category: categorizeApi(node.name.text),
        signature: printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim(),
      });
    }

    // Interfaces
    else if (ts.isInterfaceDeclaration(node) && isExported(node)) {
      entries.push({
        name: node.name.text,
        kind: 'interface',
        category: categorizeApi(node.name.text),
        signature: printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim(),
      });
    }

    // Constants
    else if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(
        // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- mod is the standard name for ES module objects
        (mod) => mod.kind === ts.SyntaxKind.ExportKeyword || mod.kind === ts.SyntaxKind.DeclareKeyword,
      )
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          entries.push({
            name: declaration.name.text,
            kind: 'constant',
            category: categorizeApi(declaration.name.text),
            signature: printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim(),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) {
    visit(statement);
  }

  return entries;
}

// =============================================================================
// Output Generation
// =============================================================================

/**
 * Build the bundled type declarations as a map of module path to raw `.d.ts`
 * content. Each entry is registered at its own virtual file path in Monaco.
 * Exported for testing.
 */
export function buildBundledTypes(): Record<string, string> {
  const originalTypes = readFileSync(typeDefinitionsPath, 'utf8').replaceAll(/\r\n?/g, '\n');

  return {
    replicad: [
      '// Bundled type declarations for replicad.',
      '// Auto-generated by extract-replicad-api.ts - do not edit manually.',
      '',
      originalTypes.trim(),
      '',
    ].join('\n'),
  };
}

/**
 * Build the structured API data JSON.
 * Exported for testing.
 */
export function buildApiData(): ApiData {
  const entries = extractApi();

  const breakdown: Record<string, number> = {};
  for (const entry of entries) {
    breakdown[entry.kind] = (breakdown[entry.kind] ?? 0) + 1;
  }

  return {
    metadata: {
      extractionDate: new Date().toISOString(),
      source: 'TypeScript Compiler API (replicad)',
      totalEntries: entries.length,
      breakdown,
    },
    entries,
  };
}

// =============================================================================
// Main Pipeline
// =============================================================================

function main(): void {
  try {
    console.log('Extracting replicad type declarations...\n');

    const outputDirectory = join(import.meta.dirname, 'generated/replicad');
    mkdirSync(outputDirectory, { recursive: true });
    console.log(`Output directory: ${outputDirectory}`);

    // Generate bundled types (one raw .d.ts per module)
    const bundledTypes = buildBundledTypes();
    const bundledPath = join(outputDirectory, 'replicad.bundled.json');
    writeFileSync(bundledPath, JSON.stringify(bundledTypes));
    console.log(`\nBundled type declarations written to ${bundledPath}`);
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

    // Generate structured JSON
    console.log('\n📝 Generating structured API data JSON...');
    const apiData = buildApiData();
    const jsonPath = join(outputDirectory, 'replicad-api-data.json');
    writeFileSync(jsonPath, JSON.stringify(apiData, null, 2));
    console.log(`✅ API data JSON saved to ${jsonPath}`);
    console.log(
      `   ${apiData.metadata.totalEntries} entries: ${Object.entries(apiData.metadata.breakdown)
        .map(([k, v]) => `${v} ${k}s`)
        .join(', ')}`,
    );

    console.log('\nReplicad type extraction completed successfully!');
  } catch (error) {
    console.error('Error during replicad type extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
