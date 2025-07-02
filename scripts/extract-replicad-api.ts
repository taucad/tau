#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention, no-bitwise, complexity -- This is a utility script for API extraction */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import * as ts from 'typescript';

type ExtractedApi = {
  name: string;
  type: 'function' | 'class' | 'type' | 'interface' | 'constant';
  category: string;
  signature: string;
  signatureWithJSDoc: string;
  parameters?: Parameter[];
  returnType?: string;
  usageCount: number;
  jsDoc?: string;
};

type Parameter = {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
};

// Track removed vs kept nodes
type NodeStats = {
  kept: Array<{
    name: string;
    type: string;
    nodeType: string;
    reason: string;
  }>;
  removed: Array<{
    name: string;
    type: string;
    nodeType: string;
    reason: string;
  }>;
};

// Documentation generation function
function generateDocumentation(apis: ExtractedApi[]): string {
  const categories = groupApisByCategory(apis);

  let markdown = '# Replicad Public API Reference\n\n';
  markdown += `Total APIs: ${apis.length}\n\n`;

  for (const [category, categoryApis] of Object.entries(categories)) {
    markdown += `## ${category}\n\n`;

    for (const api of categoryApis) {
      markdown += `### ${api.name}\n\n`;
      markdown += `**Type:** ${api.type}\n\n`;
      markdown += `**Usage Count:** ${api.usageCount}\n\n`;
      markdown += `**Signature:**\n\`\`\`typescript\n${api.signature}\n\`\`\`\n\n`;

      if (api.parameters && api.parameters.length > 0) {
        markdown += `**Parameters:**\n`;
        for (const parameter of api.parameters) {
          markdown += `- \`${parameter.name}${parameter.optional ? '?' : ''}: ${parameter.type}\`\n`;
        }

        markdown += '\n';
      }

      markdown += '---\n\n';
    }
  }

  return markdown;
}

function groupApisByCategory(apis: ExtractedApi[]): Record<string, ExtractedApi[]> {
  const categories: Record<string, ExtractedApi[]> = {};

  for (const api of apis) {
    const category = api.category ?? 'Uncategorized';
    categories[category] ||= [];
    categories[category].push(api);
  }

  // Sort categories and APIs within each category
  const sortedCategories: Record<string, ExtractedApi[]> = {};
  for (const category of Object.keys(categories).sort()) {
    sortedCategories[category] = categories[category].sort(
      (a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name),
    );
  }

  return sortedCategories;
}

function categorizeApi(name: string): string {
  // Simple automatic categorization based on name patterns
  if (/^draw[A-Z]|^sketch[A-Z]|Blueprint|Drawing|Pen/.test(name)) return 'Drawing & Sketching';
  if (/^make[A-Z]|Circle|Rectangle|Polygon|Box|Cylinder|Sphere/.test(name)) return 'Primitives & Makers';
  if (/extrude|revolve|shell|loft|sweep|Extrusion/.test(name)) return '3D Operations';
  if (/fillet|chamfer|cut|fuse|intersect|offset/.test(name)) return 'Modifications';
  if (/translate|rotate|scale|mirror|Transformation/.test(name)) return 'Transformations';
  if (/Finder|Edge|Face|Wire|Corner/.test(name)) return 'Finders & Filters';
  if (/measure|distance|area|volume|length|Properties/.test(name)) return 'Measurements';
  if (/Point|Vector|Plane|Shape|Vertex|Edge|Wire|Face|Shell|Solid/.test(name)) return 'Geometry Types';
  if (/import|export|STEP|STL|mesh|blob/.test(name)) return 'Import/Export';
  return 'Utilities';
}

function countUsage(name: string, buildExamples: string[]): number {
  let total = 0;
  for (const example of buildExamples) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    const matches = example.match(regex);
    total += matches ? matches.length : 0;
  }

  return total;
}

function getTypeText(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!typeNode) return 'any';
  return typeNode.getText(sourceFile);
}

function getParameterInfo(parameter: ts.ParameterDeclaration, sourceFile: ts.SourceFile): Parameter {
  return {
    name: parameter.name.getText(sourceFile),
    type: getTypeText(parameter.type, sourceFile),
    optional: Boolean(parameter.questionToken),
    defaultValue: parameter.initializer?.getText(sourceFile),
  };
}

function extractJsDoc(node: ts.Node): string | undefined {
  const jsDocTags = ts.getJSDocTags(node);
  if (jsDocTags.length > 0) {
    return jsDocTags
      .map((tag) => tag.comment)
      .filter(Boolean)
      .join(' ');
  }

  return undefined;
}

// Check if a class member should be excluded
function shouldExcludeMember(member: ts.ClassElement, sourceFile: ts.SourceFile): { exclude: boolean; reason: string } {
  const memberText = member.getText(sourceFile);
  const memberName = getMemberName(member);

  // Check for "oc" property
  if (memberName === 'oc') {
    return { exclude: true, reason: 'oc property excluded' };
  }

  // Check for private/protected modifiers using getCombinedModifierFlags
  // TypeScript modifier flags use bitwise operations for efficient flag checking
  // Each modifier is a power of 2, so we use bitwise AND (&) to test if a flag is set
  const modifierFlags = ts.getCombinedModifierFlags(member);
  if (modifierFlags & ts.ModifierFlags.Private) {
    return { exclude: true, reason: 'private member' };
  }

  if (modifierFlags & ts.ModifierFlags.Protected) {
    return { exclude: true, reason: 'protected member' };
  }

  // Check for private naming convention (underscore prefix)
  if (memberName.startsWith('_')) {
    return { exclude: true, reason: 'private naming convention (underscore)' };
  }

  return { exclude: false, reason: 'public member' };
}

function getMemberName(member: ts.ClassElement): string {
  if ('name' in member && member.name) {
    if (ts.isIdentifier(member.name)) {
      return member.name.text;
    }

    return member.name.getText();
  }

  return 'unknown';
}

function getNodeTypeName(node: ts.Node): string {
  return ts.SyntaxKind[node.kind];
}

// Create TypeScript printer for clean output without JSDoc
const printer = ts.createPrinter({
  omitTrailingSemicolon: false,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: true,
});

// Create TypeScript printer that keeps JSDoc comments
const printerWithJSDoc = ts.createPrinter({
  omitTrailingSemicolon: false,
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});

function getCleanSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  // Use TypeScript's printer to get clean output
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();
}

function getSignatureWithJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  // Use TypeScript's printer to get output with JSDoc comments
  return printerWithJSDoc.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();
}

function extractAPIFromTypeScript(
  filePath: string,
  buildExamples: string[],
): { apis: ExtractedApi[]; stats: NodeStats } {
  const apis: ExtractedApi[] = [];
  const stats: NodeStats = { kept: [], removed: [] };

  // Read and parse the TypeScript file
  const sourceCode = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

  function visit(node: ts.Node): void {
    // Extract ALL exported functions
    // Use bitwise AND (&) to check if Export or Ambient modifier flags are present
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export ||
        ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient)
    ) {
      const name = node.name.text;
      const usageCount = countUsage(name, buildExamples);

      const parameters = node.parameters.map((parameter) => getParameterInfo(parameter, sourceFile));
      const returnType = getTypeText(node.type, sourceFile);

      apis.push({
        name,
        type: 'function',
        category: categorizeApi(name),
        signature: getCleanSignature(node, sourceFile),
        signatureWithJSDoc: getSignatureWithJSDoc(node, sourceFile),
        parameters,
        returnType,
        usageCount,
        jsDoc: extractJsDoc(node),
      });

      stats.kept.push({
        name,
        type: 'function',
        nodeType: getNodeTypeName(node),
        reason: 'exported function',
      });
    }

    // Extract ALL exported classes (with filtering for members)
    else if (
      ts.isClassDeclaration(node) &&
      node.name &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export ||
        ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient)
    ) {
      const name = node.name.text;
      const usageCount = countUsage(name, buildExamples);

      // Filter class members
      const filteredMembers: ts.ClassElement[] = [];
      for (const member of node.members) {
        const memberName = getMemberName(member);
        const { exclude, reason } = shouldExcludeMember(member, sourceFile);

        if (exclude) {
          stats.removed.push({
            name: `${name}.${memberName}`,
            type: 'class member',
            nodeType: getNodeTypeName(member),
            reason,
          });
        } else {
          filteredMembers.push(member);
          stats.kept.push({
            name: `${name}.${memberName}`,
            type: 'class member',
            nodeType: getNodeTypeName(member),
            reason,
          });
        }
      }

      // Create a new class node with filtered members
      const filteredClass = ts.factory.updateClassDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        filteredMembers,
      );

      apis.push({
        name,
        type: 'class',
        category: categorizeApi(name),
        signature: getCleanSignature(filteredClass, sourceFile),
        signatureWithJSDoc: getSignatureWithJSDoc(filteredClass, sourceFile),
        usageCount,
        jsDoc: extractJsDoc(node),
      });

      stats.kept.push({
        name,
        type: 'class',
        nodeType: getNodeTypeName(node),
        reason: 'exported class',
      });
    }

    // Extract ALL exported type aliases
    else if (
      ts.isTypeAliasDeclaration(node) &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export ||
        ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient)
    ) {
      const name = node.name.text;
      const usageCount = countUsage(name, buildExamples);

      apis.push({
        name,
        type: 'type',
        category: categorizeApi(name),
        signature: getCleanSignature(node, sourceFile),
        signatureWithJSDoc: getSignatureWithJSDoc(node, sourceFile),
        usageCount,
        jsDoc: extractJsDoc(node),
      });

      stats.kept.push({
        name,
        type: 'type',
        nodeType: getNodeTypeName(node),
        reason: 'exported type alias',
      });
    }

    // Extract ALL exported interfaces
    else if (
      ts.isInterfaceDeclaration(node) &&
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export ||
        ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient)
    ) {
      const name = node.name.text;
      const usageCount = countUsage(name, buildExamples);

      apis.push({
        name,
        type: 'interface',
        category: categorizeApi(name),
        signature: getCleanSignature(node, sourceFile),
        signatureWithJSDoc: getSignatureWithJSDoc(node, sourceFile),
        usageCount,
        jsDoc: extractJsDoc(node),
      });

      stats.kept.push({
        name,
        type: 'interface',
        nodeType: getNodeTypeName(node),
        reason: 'exported interface',
      });
    }

    // Extract ALL exported constants/variables
    else if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(
        (mod) => mod.kind === ts.SyntaxKind.ExportKeyword || mod.kind === ts.SyntaxKind.DeclareKeyword,
      )
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          const usageCount = countUsage(name, buildExamples);

          apis.push({
            name,
            type: 'constant',
            category: categorizeApi(name),
            signature: getCleanSignature(node, sourceFile),
            signatureWithJSDoc: getSignatureWithJSDoc(node, sourceFile),
            usageCount,
            jsDoc: extractJsDoc(node),
          });

          stats.kept.push({
            name,
            type: 'constant',
            nodeType: getNodeTypeName(node),
            reason: 'exported constant',
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  // Visit all top-level statements
  for (const statement of sourceFile.statements) {
    visit(statement);
  }

  return {
    apis: apis.sort((a, b) => {
      // Sort by usage count, then alphabetically
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      return a.name.localeCompare(b.name);
    }),
    stats,
  };
}

function generateCleanTypeDefinitions(apis: ExtractedApi[]): string {
  return apis.map((api) => api.signature).join('\n');
}

function generateCleanTypeDefinitionsWithJSDoc(apis: ExtractedApi[]): string {
  return apis.map((api) => api.signatureWithJSDoc).join('\n');
}

function generateStatsReport(stats: NodeStats): string {
  let report = '\n📊 EXTRACTION STATISTICS\n';
  report += '='.repeat(50) + '\n\n';

  // Overall stats
  const totalKept = stats.kept.length;
  const totalRemoved = stats.removed.length;
  const totalProcessed = totalKept + totalRemoved;

  report += `📈 OVERALL STATISTICS:\n`;
  report += `  Total nodes processed: ${totalProcessed}\n`;
  report += `  Nodes kept: ${totalKept} (${((totalKept / totalProcessed) * 100).toFixed(1)}%)\n`;
  report += `  Nodes removed: ${totalRemoved} (${((totalRemoved / totalProcessed) * 100).toFixed(1)}%)\n\n`;

  // Stats by type
  const keptByType: Record<string, number> = {};
  const removedByType: Record<string, number> = {};

  for (const item of stats.kept) {
    keptByType[item.type] = (keptByType[item.type] || 0) + 1;
  }

  for (const item of stats.removed) {
    removedByType[item.type] = (removedByType[item.type] || 0) + 1;
  }

  report += `📊 BREAKDOWN BY TYPE:\n`;
  const allTypes = new Set([...Object.keys(keptByType), ...Object.keys(removedByType)]);

  for (const type of [...allTypes].sort()) {
    const kept = keptByType[type] || 0;
    const removed = removedByType[type] || 0;
    const total = kept + removed;
    report += `  ${type}:\n`;
    report += `    Kept: ${kept}/${total} (${((kept / total) * 100).toFixed(1)}%)\n`;
    report += `    Removed: ${removed}/${total} (${((removed / total) * 100).toFixed(1)}%)\n`;
  }

  // Removal reasons
  report += `\n🚫 REMOVAL REASONS:\n`;
  const removalReasons: Record<string, number> = {};
  for (const item of stats.removed) {
    removalReasons[item.reason] = (removalReasons[item.reason] || 0) + 1;
  }

  for (const [reason, count] of Object.entries(removalReasons).sort((a, b) => b[1] - a[1])) {
    report += `  ${reason}: ${count} nodes\n`;
  }

  return report;
}

function main() {
  try {
    console.log('🔍 Extracting Replicad Public APIs using TypeScript Compiler API (with filtering)...\n');

    const typeDefinitionsPath = join(process.cwd(), 'node_modules/replicad/dist/replicad.d.ts');
    const buildExamplesPath = join(process.cwd(), 'apps/ui/app/constants/build-code-examples.ts');

    // Create output directory
    const outputDir = join(process.cwd(), 'gen/api/replicad');
    mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Created output directory: ${outputDir}`);

    console.log(`✅ Parsing ${typeDefinitionsPath} with TypeScript compiler`);

    const buildExamples = readFileSync(buildExamplesPath, 'utf8');
    const codeBlocks = buildExamples.match(/`[^`]*`/g) ?? [];

    console.log('🔄 Extracting and filtering APIs using TypeScript AST...');
    const { apis: extractedApis, stats } = extractAPIFromTypeScript(typeDefinitionsPath, codeBlocks);

    console.log(`✅ Extracted ${extractedApis.length} APIs after filtering`);
    console.log(`📊 Used in examples: ${extractedApis.filter((api) => api.usageCount > 0).length}`);

    // Generate clean TypeScript definitions (without JSDoc)
    console.log('\n📝 Generating clean TypeScript definitions...');
    const cleanDefinitions = generateCleanTypeDefinitions(extractedApis);
    const cleanApiPath = join(outputDir, 'replicad-clean.d.ts');
    writeFileSync(cleanApiPath, cleanDefinitions);
    console.log(`✅ Clean definitions saved to ${cleanApiPath}`);

    // Generate clean TypeScript definitions (with JSDoc)
    console.log('📝 Generating clean TypeScript definitions with JSDoc...');
    const cleanDefinitionsWithJSDoc = generateCleanTypeDefinitionsWithJSDoc(extractedApis);
    const cleanApiWithJSDocPath = join(outputDir, 'replicad-clean-with-jsdoc.d.ts');
    writeFileSync(cleanApiWithJSDocPath, cleanDefinitionsWithJSDoc);
    console.log(`✅ Clean definitions with JSDoc saved to ${cleanApiWithJSDocPath}`);

    // Generate documentation
    console.log('📝 Generating API documentation...');
    const documentation = generateDocumentation(extractedApis);
    const docsPath = join(outputDir, 'replicad-api-docs.md');
    writeFileSync(docsPath, documentation);
    console.log(`✅ Documentation saved to ${docsPath}`);

    // Generate detailed JSON
    console.log('📝 Generating detailed JSON data...');
    const jsonData = {
      metadata: {
        extractionDate: new Date().toISOString(),
        extractionMethod: 'TypeScript Compiler API (Filtered)',
        totalApis: extractedApis.length,
        usedApis: extractedApis.filter((api) => api.usageCount > 0).length,
        filtering: {
          removedPrivateProtected: true,
          removedOcProperties: true,
          removedUnderscorePrefixed: true,
        },
      },
      apis: extractedApis,
      stats,
    };
    const jsonPath = join(outputDir, 'replicad-ts-api-data.json');
    writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ Detailed JSON saved to ${jsonPath}`);

    // Generate and display statistics report
    const statsReport = generateStatsReport(stats);
    const statsPath = join(outputDir, 'replicad-extraction-stats.txt');
    writeFileSync(statsPath, statsReport);
    console.log(`✅ Statistics report saved to ${statsPath}`);

    console.log('\n🎉 TypeScript-based extraction with filtering completed successfully!');

    // Show top APIs
    console.log('\n🌟 Top 10 Most Used APIs:');
    for (const [index, api] of extractedApis
      .filter((api) => api.usageCount > 0)
      .slice(0, 10)
      .entries()) {
      console.log(`${index + 1}. ${api.name} (${api.usageCount} uses) - ${api.type}`);
    }

    // Display stats summary
    console.log(statsReport);
  } catch (error) {
    console.error('❌ Error during TypeScript-based extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  extractAPIFromTypeScript,
  generateCleanTypeDefinitions,
  generateCleanTypeDefinitionsWithJSDoc,
  generateDocumentation,
};
