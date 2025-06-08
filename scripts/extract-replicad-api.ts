#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type ExtractedAPI = {
  name: string;
  type: 'function' | 'class' | 'type' | 'constant' | 'interface';
  category: string;
  signature: string;
  description?: string;
  usageCount: number;
  isCore: boolean;
};

type ExtractionCriteria = {
  // Functions that are commonly used in examples
  coreFunctions: Set<string>;
  // Patterns that indicate useful APIs
  patterns: {
    drawingFunctions: RegExp;
    sketchingFunctions: RegExp;
    transformFunctions: RegExp;
    finderClasses: RegExp;
    makerFunctions: RegExp;
    measureFunctions: RegExp;
  };
  // Categories to organize APIs
  categories: Record<string, string[]>;
};

function createExtractionCriteria(): ExtractionCriteria {
  // Based on build examples, these are the most commonly used APIs
  const coreFunctions = new Set([
    'draw',
    'drawCircle',
    'drawRoundedRectangle',
    'drawPolysides',
    'drawParametricFunction',
    'drawEllipse',
    'drawSingleCircle',
    'drawProjection',
    'drawText',
    'sketchRectangle',
    'sketchCircle',
    'sketchOnPlane',
    'sketchOnFace',
    'sketchPolysides',
    'sketchRoundedRectangle',
    'sketchText',
    'sketchHelix',
    'makePlane',
    'makeCylinder',
    'makeFace',
    'makeSolid',
    'makeBox',
    'makeSphere',
    'makeCircle',
    'makeLine',
    'makeEllipse',
    'assembleWire',
    'extrude',
    'revolve',
    'shell',
    'fillet',
    'chamfer',
    'cut',
    'fuse',
    'intersect',
    'loft',
    'genericSweep',
    'complexExtrude',
    'twistExtrude',
    'polysideInnerRadius',
    'measureVolume',
    'measureArea',
    'measureLength',
    'translate',
    'rotate',
    'scale',
    'mirror',
    'EdgeFinder',
    'FaceFinder',
    'CornerFinder',
  ]);

  return {
    coreFunctions,
    patterns: {
      drawingFunctions: /^draw[A-Z].*|^sketch[A-Z].*/,
      sketchingFunctions: /.*Sketch.*|.*Blueprint.*|.*Drawing.*/,
      transformFunctions: /^(translate|rotate|scale|mirror|fillet|chamfer)$/,
      finderClasses: /.*Finder$/,
      makerFunctions: /^make[A-Z].*/,
      measureFunctions: /^measure[A-Z].*/,
    },
    categories: {
      'Drawing & Sketching': ['draw', 'sketch', 'Blueprint', 'Drawing', 'Pen'],
      'Primitives & Makers': ['make', 'Circle', 'Rectangle', 'Polygon', 'Box', 'Cylinder', 'Sphere'],
      '3D Operations': ['extrude', 'revolve', 'shell', 'loft', 'sweep', 'Extrusion'],
      Modifications: ['fillet', 'chamfer', 'cut', 'fuse', 'intersect', 'offset'],
      Transformations: ['translate', 'rotate', 'scale', 'mirror', 'Transformation'],
      'Finders & Filters': ['Finder', 'Edge', 'Face', 'Wire', 'Corner'],
      Measurements: ['measure', 'distance', 'area', 'volume', 'length', 'Properties'],
      'Geometry Types': ['Point', 'Vector', 'Plane', 'Shape', 'Vertex', 'Edge', 'Wire', 'Face', 'Shell', 'Solid'],
      Utilities: ['assembleWire', 'polysideInnerRadius', 'cast', 'downcast', 'compoundShapes'],
      'Import/Export': ['import', 'export', 'STEP', 'STL', 'mesh', 'blob'],
    },
  };
}

function extractPublicApi(typeDefinitions: string, buildExamples: string[]): ExtractedAPI[] {
  const criteria = createExtractionCriteria();
  const apis: ExtractedAPI[] = [];

  // Count usage in build examples
  function countUsage(name: string): number {
    return buildExamples.reduce((total, example) => {
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      const matches = example.match(regex);
      return total + (matches ? matches.length : 0);
    }, 0);
  }

  // Extract exported functions with better parameter preservation
  const functionRegex = /export declare (?:function|const) (\w+)([^;]*);/g;
  let match;

  while ((match = functionRegex.exec(typeDefinitions)) !== null) {
    const name = match[1];
    const parameters = match[2];
    const usageCount = countUsage(name);
    const isCore = criteria.coreFunctions.has(name);

    // Include if it's core, used in examples, or matches important patterns
    if (isCore || usageCount > 0 || Object.values(criteria.patterns).some((pattern) => pattern.test(name))) {
      // Clean up the signature to keep parameter names but remove comments
      const cleanedParameters = parameters
        .replaceAll(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
        .replaceAll(/\/\/.*$/gm, '') // Remove // comments
        .replaceAll(/\s+/g, ' ') // Normalize whitespace
        .trim();

      apis.push({
        name,
        type: 'function',
        category: categorizeApi(name, criteria.categories),
        signature: `function ${name}${cleanedParameters};`,
        usageCount,
        isCore,
      });
    }
  }

  // Extract exported classes
  const classRegex = /export declare class (\w+)(?:<[^>]*>)?\s+(?:extends\s+[^{]*)?{([^}]*)}/g;
  while ((match = classRegex.exec(typeDefinitions)) !== null) {
    const name = match[1];
    const classBody = match[2];
    const usageCount = countUsage(name);
    const isCore = criteria.coreFunctions.has(name);

    if (isCore || usageCount > 0 || Object.values(criteria.patterns).some((pattern) => pattern.test(name))) {
      // Extract key methods from class body
      const methodMatches = classBody.match(/^\s*(\w+\([^)]*\):[^;]*);/gm) || [];
      const keyMethods = methodMatches
        .slice(0, 5)
        .map((m) => `  ${m.trim()}`)
        .join('\n');

      apis.push({
        name,
        type: 'class',
        category: categorizeApi(name, criteria.categories),
        signature: keyMethods ? `class ${name} {\n${keyMethods}\n}` : `class ${name} {}`,
        usageCount,
        isCore,
      });
    }
  }

  // Extract useful types
  const typeRegex = /export declare type (\w+)\s*=([^;]*);/g;
  while ((match = typeRegex.exec(typeDefinitions)) !== null) {
    const name = match[1];
    const typeDefinition = match[2].trim();
    const usageCount = countUsage(name);

    // Include commonly used types and those that appear in examples
    const importantTypes = new Set([
      'Point',
      'Point2D',
      'Shape3D',
      'AnyShape',
      'PlaneName',
      'Direction',
      'CurveType',
      'SurfaceType',
    ]);
    if (importantTypes.has(name) || usageCount > 0) {
      apis.push({
        name,
        type: 'type',
        category: categorizeApi(name, criteria.categories),
        signature: `type ${name} = ${typeDefinition};`,
        usageCount,
        isCore: importantTypes.has(name),
      });
    }
  }

  // Extract interfaces
  const interfaceRegex = /export declare interface (\w+)\s*{([^}]*)}/g;
  while ((match = interfaceRegex.exec(typeDefinitions)) !== null) {
    const name = match[1];
    const interfaceBody = match[2];
    const usageCount = countUsage(name);

    if (usageCount > 0 || name.includes('Config') || name.includes('Options')) {
      apis.push({
        name,
        type: 'interface',
        category: categorizeApi(name, criteria.categories),
        signature: `interface ${name} {\n${interfaceBody.trim()}\n}`,
        usageCount,
        isCore: false,
      });
    }
  }

  return apis.sort((a, b) => {
    // Sort by: core first, then usage count, then alphabetically
    if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
    return a.name.localeCompare(b.name);
  });
}

function categorizeApi(name: string, categories: Record<string, string[]>): string {
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((keyword) => name.toLowerCase().includes(keyword.toLowerCase()))) {
      return category;
    }
  }

  return 'Other';
}

function generateApiDocumentation(apis: ExtractedAPI[]): string {
  const grouped = apis.reduce<Record<string, ExtractedAPI[]>>((acc, api) => {
    if (!acc[api.category]) acc[api.category] = [];
    acc[api.category].push(api);
    return acc;
  }, {});

  let documentation = `# Replicad Public API Reference

This document contains the most useful public APIs extracted from replicad, organized by category and sorted by usage frequency in real examples.

**Legend:**
- 🌟 = Core API (frequently used in examples)
- 📊 = Usage count in build examples

---

`;

  // Generate table of contents
  documentation += '## Table of Contents\n\n';
  for (const category of Object.keys(grouped)) {
    documentation += `- [${category}](#${category.toLowerCase().replaceAll(/[^a-z\d]+/g, '-')})\n`;
  }

  documentation += '\n---\n\n';

  for (const [category, categoryAPIs] of Object.entries(grouped)) {
    documentation += `## ${category}\n\n`;

    for (const api of categoryAPIs) {
      const coreIndicator = api.isCore ? ' 🌟' : '';
      const usageIndicator = api.usageCount > 0 ? ` 📊 ${api.usageCount}` : '';

      documentation += `### ${api.name}${coreIndicator}${usageIndicator}\n\n`;
      documentation += `**Type:** ${api.type}\n\n`;

      if (api.signature) {
        documentation += '```typescript\n';
        documentation += api.signature;
        documentation += '\n```\n\n';
      }
    }
  }

  return documentation;
}

function generateTypescriptDefinitions(apis: ExtractedAPI[]): string {
  let definitions = '';

  // Group by category for better organization
  const grouped = apis.reduce<Record<string, ExtractedAPI[]>>((acc, api) => {
    if (!acc[api.category]) acc[api.category] = [];
    acc[api.category].push(api);
    return acc;
  }, {});

  for (const [category, categoryAPIs] of Object.entries(grouped)) {
    for (const api of categoryAPIs) {
      if (api.isCore || api.usageCount > 0) {
        definitions += `${api.signature}\n`;
      }
    }
  }

  return definitions.trim();
}

function main() {
  try {
    console.log('🔍 Extracting Replicad Public APIs...\n');

    // Read the replicad type definitions
    const typeDefinitionsPath = join(process.cwd(), 'node_modules/replicad/dist/replicad.d.ts');
    const typeDefinitions = readFileSync(typeDefinitionsPath, 'utf8');
    console.log(`✅ Loaded type definitions from ${typeDefinitionsPath}`);

    // Read build examples
    const buildExamplesPath = join(process.cwd(), 'apps/ui/app/constants/build-code-examples.ts');
    const buildExamples = readFileSync(buildExamplesPath, 'utf8');
    console.log(`✅ Loaded build examples from ${buildExamplesPath}`);

    // Split build examples into individual code blocks
    const codeBlocks = buildExamples.match(/`[^`]*`/g) || [];

    console.log('🔄 Extracting APIs...');
    const extractedApis = extractPublicApi(typeDefinitions, codeBlocks);

    console.log(`✅ Extracted ${extractedApis.length} APIs`);
    console.log(`🌟 Core APIs: ${extractedApis.filter((api) => api.isCore).length}`);
    console.log(`📊 Used in examples: ${extractedApis.filter((api) => api.usageCount > 0).length}`);

    // Generate documentation
    console.log('\n📝 Generating documentation...');
    const documentation = generateApiDocumentation(extractedApis);
    writeFileSync('replicad-api-reference.md', documentation);
    console.log('✅ Documentation saved to replicad-api-reference.md');

    // Generate TypeScript definitions
    console.log('📝 Generating TypeScript definitions...');
    const definitions = generateTypescriptDefinitions(extractedApis);
    writeFileSync('replicad-core-api.d.ts', definitions);
    console.log('✅ TypeScript definitions saved to replicad-core-api.d.ts');

    // Generate JSON for programmatic use
    console.log('📝 Generating JSON data...');
    const jsonData = {
      metadata: {
        extractionDate: new Date().toISOString(),
        totalAPIs: extractedApis.length,
        coreAPIs: extractedApis.filter((api) => api.isCore).length,
        usedAPIs: extractedApis.filter((api) => api.usageCount > 0).length,
      },
      apis: extractedApis,
    };
    writeFileSync('replicad-api-data.json', JSON.stringify(jsonData, null, 2));
    console.log('✅ JSON data saved to replicad-api-data.json');

    console.log('\n🎉 API extraction completed successfully!');

    // Print summary by category
    console.log('\n📊 Summary by category:');
    const categoryStats = extractedApis.reduce<Record<string, { total: number; core: number; used: number }>>(
      (acc, api) => {
        if (!acc[api.category]) acc[api.category] = { total: 0, core: 0, used: 0 };
        acc[api.category].total++;
        if (api.isCore) acc[api.category].core++;
        if (api.usageCount > 0) acc[api.category].used++;
        return acc;
      },
      {},
    );

    for (const [category, stats] of Object.entries(categoryStats)) {
      console.log(`  ${category}: ${stats.total} APIs (${stats.core} core, ${stats.used} used)`);
    }
  } catch (error) {
    console.error('❌ Error during extraction:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractPublicApi as extractPublicAPI, generateApiDocumentation, generateTypescriptDefinitions };
