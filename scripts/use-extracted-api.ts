#!/usr/bin/env tsx

import { readFileSync } from 'fs';

interface ExtractedAPIData {
  metadata: {
    extractionDate: string;
    totalAPIs: number;
    coreAPIs: number;
    usedAPIs: number;
  };
  apis: Array<{
    name: string;
    type: 'function' | 'class' | 'type' | 'constant' | 'interface';
    category: string;
    signature: string;
    usageCount: number;
    isCore: boolean;
  }>;
}

// Example usage functions for the extracted API data
class ReplicadAPIHelper {
  private apiData: ExtractedAPIData;

  constructor(apiDataPath: string = './replicad-api-data.json') {
    this.apiData = JSON.parse(readFileSync(apiDataPath, 'utf8'));
  }

  // Get the most frequently used APIs
  getMostUsedAPIs(limit: number = 10) {
    return this.apiData.apis
      .filter(api => api.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  // Get APIs by category
  getAPIsByCategory(category: string) {
    return this.apiData.apis.filter(api => api.category === category);
  }

  // Get core APIs (most important for beginners)
  getCoreAPIs() {
    return this.apiData.apis.filter(api => api.isCore);
  }

  // Search APIs by name pattern
  searchAPIs(pattern: string) {
    const regex = new RegExp(pattern, 'i');
    return this.apiData.apis.filter(api => 
      regex.test(api.name) || regex.test(api.signature)
    );
  }

  // Get API categories summary
  getCategorySummary() {
    const summary: Record<string, { total: number; core: number; used: number }> = {};
    
    this.apiData.apis.forEach(api => {
      if (!summary[api.category]) {
        summary[api.category] = { total: 0, core: 0, used: 0 };
      }
      summary[api.category].total++;
      if (api.isCore) summary[api.category].core++;
      if (api.usageCount > 0) summary[api.category].used++;
    });
    
    return summary;
  }

  // Generate autocomplete suggestions for IDE
  generateAutocompleteData() {
    return this.apiData.apis.map(api => ({
      name: api.name,
      type: api.type,
      category: api.category,
      signature: api.signature,
      priority: api.isCore ? 'high' : api.usageCount > 0 ? 'medium' : 'low',
      documentation: `${api.signature}\n\nCategory: ${api.category}\nUsage: ${api.usageCount} times in examples`
    }));
  }

  // Get learning path for beginners
  getLearningPath() {
    const categories = [
      'Drawing & Sketching',
      'Primitives & Makers', 
      '3D Operations',
      'Transformations',
      'Finders & Filters',
      'Measurements'
    ];

    return categories.map(category => ({
      category,
      apis: this.getAPIsByCategory(category)
        .filter(api => api.isCore || api.usageCount > 0)
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
    }));
  }

  // Get metadata
  getMetadata() {
    return this.apiData.metadata;
  }
}

// Example usage
function main() {
  const helper = new ReplicadAPIHelper();
  
  console.log('🔍 Replicad API Analysis\n');
  console.log('📊 Metadata:', helper.getMetadata());
  
  console.log('\n🌟 Top 10 Most Used APIs:');
  helper.getMostUsedAPIs(10).forEach((api, index) => {
    console.log(`${index + 1}. ${api.name} (${api.usageCount} uses) - ${api.category}`);
  });
  
  console.log('\n📚 Learning Path for Beginners:');
  helper.getLearningPath().forEach(step => {
    console.log(`\n${step.category}:`);
    step.apis.forEach(api => {
      console.log(`  - ${api.name} ${api.isCore ? '🌟' : ''}`);
    });
  });
  
  console.log('\n🔍 Search Examples:');
  console.log('Drawing functions:', helper.searchAPIs('^draw').map(api => api.name).slice(0, 5));
  console.log('Sketch functions:', helper.searchAPIs('^sketch').map(api => api.name).slice(0, 5));
  console.log('Make functions:', helper.searchAPIs('^make').map(api => api.name).slice(0, 5));
  
  console.log('\n📋 Category Summary:');
  const summary = helper.getCategorySummary();
  Object.entries(summary).forEach(([category, stats]) => {
    console.log(`${category}: ${stats.total} total (${stats.core} core, ${stats.used} used in examples)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ReplicadAPIHelper }; 
