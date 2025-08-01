#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

type ExtractedApiData = {
  metadata: {
    extractionDate: string;
    totalApis: number;
    coreApis: number;
    usedApis: number;
  };
  apis: Array<{
    name: string;
    type: 'function' | 'class' | 'type' | 'constant' | 'interface';
    category: string;
    signature: string;
    usageCount: number;
    isCore: boolean;
  }>;
};

// Example usage functions for the extracted API data
class ReplicadApiHelper {
  private readonly apiData: ExtractedApiData;
  private readonly apiDataPath: string;

  public constructor() {
    this.apiDataPath = join(import.meta.dirname, 'generated/replicad/replicad-ts-api-data.json');
    this.apiData = JSON.parse(readFileSync(this.apiDataPath, 'utf8')) as ExtractedApiData;
  }

  // Get the most frequently used Apis
  public getMostUsedApis(limit = 10): ExtractedApiData['apis'] {
    return this.apiData.apis
      .filter((api) => api.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  // Get Apis by category
  public getApisByCategory(category: string): ExtractedApiData['apis'] {
    return this.apiData.apis.filter((api) => api.category === category);
  }

  // Get core Apis (most important for beginners)
  public getCoreApis(): ExtractedApiData['apis'] {
    return this.apiData.apis.filter((api) => api.isCore);
  }

  // Search Apis by name pattern
  public searchApis(pattern: string): ExtractedApiData['apis'] {
    const regex = new RegExp(pattern, 'i');
    return this.apiData.apis.filter((api) => regex.test(api.name) || regex.test(api.signature));
  }

  // Get API categories summary
  public getCategorySummary(): Record<string, { total: number; core: number; used: number }> {
    const summary: Record<string, { total: number; core: number; used: number }> = {};

    for (const api of this.apiData.apis) {
      summary[api.category] ??= { total: 0, core: 0, used: 0 };

      summary[api.category]!.total++;
      if (api.isCore) {
        summary[api.category]!.core++;
      }

      if (api.usageCount > 0) {
        summary[api.category]!.used++;
      }
    }

    return summary;
  }

  // Generate autocomplete suggestions for IDE
  public generateAutocompleteData(): Array<{
    name: string;
    type: 'function' | 'class' | 'type' | 'constant' | 'interface';
    category: string;
    signature: string;
    priority: string;
    documentation: string;
  }> {
    return this.apiData.apis.map((api) => ({
      name: api.name,
      type: api.type,
      category: api.category,
      signature: api.signature,
      priority: api.isCore ? 'high' : api.usageCount > 0 ? 'medium' : 'low',
      documentation: `${api.signature}\n\nCategory: ${api.category}\nUsage: ${api.usageCount} times in examples`,
    }));
  }

  // Get learning path for beginners
  public getLearningPath(): Array<{ category: string; apis: ExtractedApiData['apis'] }> {
    const categories = [
      'Drawing & Sketching',
      'Primitives & Makers',
      '3D Operations',
      'Transformations',
      'Finders & Filters',
      'Measurements',
    ];

    return categories.map((category) => ({
      category,
      apis: this.getApisByCategory(category)
        .filter((api) => api.isCore || api.usageCount > 0)
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5),
    }));
  }

  // Get metadata
  public getMetadata(): ExtractedApiData['metadata'] {
    return this.apiData.metadata;
  }
}

// Example usage
function main() {
  const helper = new ReplicadApiHelper();

  console.log('🔍 Replicad API Analysis\n');
  console.log('📊 Metadata:', helper.getMetadata());

  console.log('\n🌟 Top 10 Most Used Apis:');
  for (const [index, api] of helper.getMostUsedApis(10).entries()) {
    console.log(`${index + 1}. ${api.name} (${api.usageCount} uses) - ${api.category}`);
  }

  console.log('\n📚 Learning Path for Beginners:');
  for (const step of helper.getLearningPath()) {
    console.log(`\n${step.category}:`);
    for (const api of step.apis) {
      console.log(`  - ${api.name} ${api.isCore ? '🌟' : ''}`);
    }
  }

  console.log('\n🔍 Search Examples:');
  console.log(
    'Drawing functions:',
    helper
      .searchApis('^draw')
      .map((api) => api.name)
      .slice(0, 5),
  );
  console.log(
    'Sketch functions:',
    helper
      .searchApis('^sketch')
      .map((api) => api.name)
      .slice(0, 5),
  );
  console.log(
    'Make functions:',
    helper
      .searchApis('^make')
      .map((api) => api.name)
      .slice(0, 5),
  );

  console.log('\n📋 Category Summary:');
  const summary = helper.getCategorySummary();
  for (const [category, stats] of Object.entries(summary)) {
    console.log(`${category}: ${stats.total} total (${stats.core} core, ${stats.used} used in examples)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ReplicadApiHelper as ReplicadAPIHelper };
