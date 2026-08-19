#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { ApiData, ApiEntry, ApiEntryKind } from '#api-extraction.types.js';

// ============================================================================
// Rust JSON Export Schema Types
// These match the JSON structure exported by the Zoo repo's Rust code
// ============================================================================

type RustExportSchema = {
  metadata: {
    version: string;
  };
  functions: RustFunctionData[];
  types: RustTypeData[];
  constants: RustConstData[];
  modules: RustModuleData[];
};

type RustFunctionData = {
  name: string;
  qual_name: string;
  module: string;
  summary: string | undefined;
  description: string | undefined;
  deprecated: boolean;
  experimental: boolean;
  fn_signature: string;
  args: Array<{
    name: string;
    type_: string | undefined;
    description: string;
    required: boolean;
  }>;
  return_value:
    | {
        type_: string;
        description: string;
      }
    | undefined;
};

type RustTypeData = {
  name: string;
  qual_name: string;
  module: string;
  definition: string | undefined;
  summary: string | undefined;
  description: string | undefined;
  deprecated: boolean;
  experimental: boolean;
};

type RustConstData = {
  name: string;
  qual_name: string;
  module: string;
  summary: string | undefined;
  description: string | undefined;
  deprecated: boolean;
  experimental: boolean;
  type_: string | undefined;
  type_desc: string | undefined;
  value: string;
};

type RustModuleData = {
  name: string;
  qual_name: string;
  module: string;
  summary: string | undefined;
  description: string | undefined;
};

// ============================================================================
// Internal Types
// ============================================================================

type KclDocumentCategory = 'functions' | 'types' | 'modules' | 'consts';

type KclDocumentEntry = {
  name: string;
  category: KclDocumentCategory;
  module: string;
  excerpt: string;
  signature: string;
  description: string;
  arguments: ArgumentInfo[];
  returns: string;
  examples: string[];
};

type ArgumentInfo = {
  name: string;
  type: string;
  description: string;
  required: boolean;
};

// ============================================================================
// Schema Transformation
// ============================================================================

/**
 * Transform Rust JSON export schema to our internal KclDocumentEntry format
 */
function transformRustSchema(data: RustExportSchema): KclDocumentEntry[] {
  const entries: KclDocumentEntry[] = [];

  // Transform functions
  for (const functionDefinition of data.functions) {
    entries.push({
      name: functionDefinition.name,
      category: 'functions',
      module: functionDefinition.module,
      excerpt: functionDefinition.summary ?? '',
      signature: functionDefinition.fn_signature,
      description: functionDefinition.description ?? '',
      arguments: functionDefinition.args.map((argument) => ({
        name: argument.name,
        type: argument.type_ ?? '',
        description: argument.description,
        required: argument.required,
      })),
      returns: functionDefinition.return_value?.type_ ?? '',
      examples: [], // Examples are not included in JSON export (used for website only)
    });
  }

  // Transform types
  for (const ty of data.types) {
    entries.push({
      name: ty.name,
      category: 'types',
      module: ty.module,
      excerpt: ty.summary ?? '',
      signature: ty.definition ?? '',
      description: ty.description ?? '',
      arguments: [],
      returns: '',
      examples: [],
    });
  }

  // Transform constants
  for (const cnst of data.constants) {
    entries.push({
      name: cnst.name,
      category: 'consts',
      module: cnst.module,
      excerpt: cnst.summary ?? '',
      signature: cnst.value ? `${cnst.name} = ${cnst.value}` : cnst.name,
      description: cnst.description ?? '',
      arguments: [],
      returns: cnst.type_ ?? '',
      examples: [],
    });
  }

  // Transform modules
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- mod is the standard name for ES module objects
  for (const mod of data.modules) {
    entries.push({
      name: mod.name,
      category: 'modules',
      module: mod.module,
      excerpt: mod.summary ?? '',
      signature: '',
      description: mod.description ?? '',
      arguments: [],
      returns: '',
      examples: [],
    });
  }

  return entries;
}

// ============================================================================
// Structured API Data (shared schema)
// ============================================================================

const kclCategoryToKind: Record<KclDocumentCategory, ApiEntryKind> = {
  functions: 'function',
  types: 'type',
  consts: 'constant',
  modules: 'module',
};

/**
 * Convert KCL doc entries to the shared ApiData format.
 */
function kclEntryToApiEntry(entry: KclDocumentEntry): ApiEntry {
  const apiEntry: ApiEntry = {
    name: entry.name,
    kind: kclCategoryToKind[entry.category],
    module: entry.module,
    signature: entry.signature,
    description: entry.excerpt || entry.description || undefined,
  };

  if (entry.arguments.length > 0) {
    apiEntry.parameters = entry.arguments.map((argument) => ({
      name: argument.name,
      type: argument.type,
      optional: !argument.required,
      description: argument.description || undefined,
    }));
  }

  if (entry.returns) {
    apiEntry.returnType = entry.returns;
  }

  return apiEntry;
}

/**
 * Build the structured API data in the shared schema.
 * Exported for testing.
 */
export function buildApiData(entries: KclDocumentEntry[], kclVersion: string): ApiData {
  const apiEntries = entries.map((entry) => kclEntryToApiEntry(entry));

  const breakdown: Record<string, number> = {};
  for (const entry of apiEntries) {
    breakdown[entry.kind] = (breakdown[entry.kind] ?? 0) + 1;
  }

  return {
    metadata: {
      extractionDate: new Date().toISOString(),
      source: `KCL v${kclVersion}`,
      totalEntries: apiEntries.length,
      breakdown,
    },
    entries: apiEntries,
  };
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * Format a single function entry as markdown
 */
function formatFunctionEntry(entry: KclDocumentEntry): string {
  let markdown = `#### ${entry.name}\n\n`;

  if (entry.excerpt) {
    markdown += `${entry.excerpt}\n\n`;
  }

  if (entry.signature) {
    markdown += '```kcl\n' + entry.signature + '\n```\n\n';
  }

  if (entry.arguments.length > 0) {
    markdown += '**Arguments:**\n';
    for (const argument of entry.arguments) {
      const requiredText = argument.required ? '(required)' : '(optional)';
      markdown += `- \`${argument.name}\`: ${argument.type} ${requiredText} - ${argument.description}\n`;
    }

    markdown += '\n';
  }

  if (entry.returns) {
    markdown += `**Returns:** ${entry.returns}\n\n`;
  }

  // Include first example if available (limit to save tokens)
  if (entry.examples.length > 0) {
    markdown += '**Example:**\n```kcl\n' + entry.examples[0] + '\n```\n\n';
  }

  markdown += '---\n\n';
  return markdown;
}

/**
 * Generate consolidated markdown documentation
 */
function generateMarkdown(entries: KclDocumentEntry[]): string {
  let markdown = '# KCL Standard Library API Reference\n\n';
  markdown += `Total entries: ${entries.length}\n\n`;
  markdown += '---\n\n';

  // Group by category
  const categories: Record<KclDocumentCategory, KclDocumentEntry[]> = {
    functions: [],
    types: [],
    consts: [],
    modules: [],
  };

  for (const entry of entries) {
    categories[entry.category].push(entry);
  }

  // Sort entries within each category by module, then name
  for (const category of Object.keys(categories) as KclDocumentCategory[]) {
    categories[category].sort((a, b) => {
      if (a.module !== b.module) {
        return a.module.localeCompare(b.module);
      }

      return a.name.localeCompare(b.name);
    });
  }

  // Functions section
  if (categories.functions.length > 0) {
    markdown += '## Functions\n\n';

    // Group functions by module
    const functionsByModule: Record<string, KclDocumentEntry[]> = {};
    for (const functionEntry of categories.functions) {
      functionsByModule[functionEntry.module] ??= [];
      functionsByModule[functionEntry.module]!.push(functionEntry);
    }

    for (const [moduleName, functions] of Object.entries(functionsByModule).sort((a, b) => a[0].localeCompare(b[0]))) {
      markdown += `### ${moduleName}\n\n`;

      for (const functionEntry of functions) {
        markdown += formatFunctionEntry(functionEntry);
      }
    }
  }

  // Types section
  if (categories.types.length > 0) {
    markdown += '## Types\n\n';

    for (const type of categories.types) {
      markdown += `### ${type.name}\n\n`;

      if (type.excerpt) {
        markdown += `${type.excerpt}\n\n`;
      }

      if (type.description && type.description !== type.excerpt) {
        // Truncate long descriptions
        const desc = type.description.length > 500 ? type.description.slice(0, 500) + '...' : type.description;
        markdown += `${desc}\n\n`;
      }

      markdown += '---\n\n';
    }
  }

  // Constants section
  if (categories.consts.length > 0) {
    markdown += '## Constants\n\n';

    for (const constant of categories.consts) {
      markdown += `### ${constant.name}\n\n`;

      if (constant.excerpt) {
        markdown += `${constant.excerpt}\n\n`;
      }

      if (constant.signature) {
        markdown += '```kcl\n' + constant.signature + '\n```\n\n';
      }

      if (constant.returns) {
        markdown += `**Type:** ${constant.returns}\n\n`;
      }

      markdown += '---\n\n';
    }
  }

  return markdown;
}

/**
 * Generate a compact version for LLM context (signature-focused)
 */
function generateCompactMarkdown(entries: KclDocumentEntry[]): string {
  let markdown = '# KCL Standard Library Reference\n\n';

  // Group by category
  const categories: Record<KclDocumentCategory, KclDocumentEntry[]> = {
    functions: [],
    types: [],
    consts: [],
    modules: [],
  };

  for (const entry of entries) {
    categories[entry.category].push(entry);
  }

  // Sort entries within each category
  for (const category of Object.keys(categories) as KclDocumentCategory[]) {
    categories[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Functions - compact format
  if (categories.functions.length > 0) {
    markdown += '## Functions\n\n';

    for (const functionEntry of categories.functions) {
      if (functionEntry.signature) {
        // Add brief description as comment
        if (functionEntry.excerpt) {
          markdown += `// ${functionEntry.excerpt}\n`;
        }

        markdown += functionEntry.signature + '\n\n';
      }
    }
  }

  // Types - just list them
  if (categories.types.length > 0) {
    markdown += '## Types\n\n';

    for (const type of categories.types) {
      const desc = type.excerpt ? ` - ${type.excerpt}` : '';
      markdown += `- ${type.name}${desc}\n`;
    }

    markdown += '\n';
  }

  // Constants
  if (categories.consts.length > 0) {
    markdown += '## Constants\n\n';

    for (const constant of categories.consts) {
      if (constant.signature) {
        if (constant.excerpt) {
          markdown += `// ${constant.excerpt}\n`;
        }

        markdown += constant.signature + '\n';
      }
    }
  }

  return markdown;
}

// ============================================================================
// Main Entry Point
// ============================================================================

function main(): void {
  try {
    console.log('Extracting KCL Standard Library API...\n');

    // Paths
    const zooJsonPath = join(
      import.meta.dirname,
      '../../../repos/zoo-modeling-app/docs/kcl-std/kcl-stdlib-export.json',
    );
    const outputDirectory = join(import.meta.dirname, 'generated/kcl');
    const localJsonPath = join(outputDirectory, 'kcl-stdlib-export.json');

    // Create output directory
    mkdirSync(outputDirectory, { recursive: true });
    console.log(`Created output directory: ${outputDirectory}`);

    // Copy JSON from Zoo repo if it exists
    if (existsSync(zooJsonPath)) {
      console.log(`Copying JSON from Zoo repo: ${zooJsonPath}`);
      copyFileSync(zooJsonPath, localJsonPath);
      console.log(`JSON copied to: ${localJsonPath}`);
    } else {
      console.error(`Error: Zoo JSON export not found at ${zooJsonPath}`);
      console.error('Run the following command in the Zoo repo to generate it:');
      console.error(
        '  cd repos/zoo-modeling-app/rust && EXPECTORATE=overwrite cargo test -p kcl-lib test_export_stdlib_json --release',
      );
      process.exit(1);
    }

    // Read and parse the JSON
    console.log('\nParsing JSON export...');
    const rawData = JSON.parse(readFileSync(localJsonPath, 'utf8')) as RustExportSchema;
    console.log(`KCL stdlib version: ${rawData.metadata.version}`);

    // Transform to our internal format
    const entries = transformRustSchema(rawData);
    console.log(`Transformed ${entries.length} API entries`);

    // Generate full documentation
    console.log('\nGenerating full API documentation...');
    const fullDocumentation = generateMarkdown(entries);
    const fullDocumentationPath = join(outputDirectory, 'kcl-stdlib-api.md');
    writeFileSync(fullDocumentationPath, fullDocumentation);
    console.log(`Full docs saved to ${fullDocumentationPath}`);

    // Generate compact version for LLM context
    console.log('Generating compact LLM reference...');
    const compactDocumentation = generateCompactMarkdown(entries);
    const compactDocumentationPath = join(outputDirectory, 'kcl-stdlib-compact.md');
    writeFileSync(compactDocumentationPath, compactDocumentation);
    console.log(`Compact reference saved to ${compactDocumentationPath}`);

    // Generate structured JSON data (shared schema)
    console.log('Generating JSON data...');
    const apiData = buildApiData(entries, rawData.metadata.version);
    const jsonPath = join(outputDirectory, 'kcl-stdlib-data.json');
    writeFileSync(jsonPath, JSON.stringify(apiData, null, 2));
    console.log(`JSON data saved to ${jsonPath}`);

    // Summary
    console.log('\nKCL API extraction completed successfully!');
    console.log(`\nSummary:`);
    console.log(
      `  ${apiData.metadata.totalEntries} entries: ${Object.entries(apiData.metadata.breakdown)
        .map(([k, v]) => `${v} ${k}s`)
        .join(', ')}`,
    );
  } catch (error) {
    console.error('Error during KCL API extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateMarkdown, generateCompactMarkdown, transformRustSchema };
export type { KclDocumentEntry, RustExportSchema };
