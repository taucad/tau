# Replicad API Extraction Scripts

This directory contains scripts to programmatically extract and analyze the most useful public APIs from the replicad 3D modeling library.

## Overview

The API extraction tool analyzes the replicad TypeScript type definitions (`replicad.d.ts`) and cross-references them with actual usage patterns from build examples to identify the most useful and commonly used APIs.

## Files

- **`extract-replicad-api.ts`** - Main extraction script
- **`use-extracted-api.ts`** - Helper utilities and analysis examples
- **`README.md`** - This documentation

## Generated Files

When you run the extraction, these files are created in the project root:

- **`replicad-api-reference.md`** - Human-readable API documentation
- **`replicad-core-api.d.ts`** - TypeScript definitions for core APIs
- **`replicad-api-data.json`** - Structured data for programmatic use

## Usage

### Extract APIs

```bash
pnpm extract-replicad-api
```

This will:
1. Parse the replicad type definitions
2. Analyze usage patterns from build examples
3. Categorize and rank APIs by importance
4. Generate documentation and data files

### Analyze Results

```bash
pnpm analyze-replicad-api
```

This demonstrates how to use the extracted data programmatically.

## API Categories

The extraction organizes APIs into logical categories:

1. **Drawing & Sketching** - Functions for 2D drawing and sketching
2. **Primitives & Makers** - Functions that create basic 3D shapes
3. **3D Operations** - Extrusion, revolution, lofting operations
4. **Transformations** - Move, rotate, scale, mirror operations
5. **Modifications** - Fillet, chamfer, cut, fuse operations
6. **Finders & Filters** - Tools to select edges, faces, etc.
7. **Measurements** - Functions to measure distance, area, volume
8. **Geometry Types** - Core types like Point, Vector, Shape
9. **Utilities** - Helper functions and utilities

## Classification System

Each API is classified with:

- **Type**: function, class, type, interface, constant
- **Category**: Logical grouping (see above)
- **Core Status**: Whether it's frequently used (🌟)
- **Usage Count**: How many times it appears in examples (📊)

### Core APIs

Core APIs are those identified as most essential based on:
- Frequency of use in build examples
- Fundamental importance for 3D modeling
- Common patterns in user code

### Usage-Based Ranking

APIs are ranked by actual usage in real build examples, helping identify:
- Most practical functions for users
- Common workflows and patterns
- Essential vs. advanced functionality

## Example: Using Extracted Data

```typescript
import { ReplicadAPIHelper } from './scripts/use-extracted-api.js';

const helper = new ReplicadAPIHelper();

// Get the most used APIs
const topAPIs = helper.getMostUsedAPIs(10);

// Get APIs by category
const drawingAPIs = helper.getAPIsByCategory('Drawing & Sketching');

// Search for specific patterns
const makeAPIs = helper.searchAPIs('^make');

// Get learning path for beginners
const learningPath = helper.getLearningPath();

// Generate autocomplete data for IDEs
const autocompleteData = helper.generateAutocompleteData();
```

## Use Cases

This extracted API data can be used for:

1. **Documentation Generation** - Auto-generate focused API docs
2. **IDE Autocomplete** - Provide smart suggestions based on usage
3. **Learning Materials** - Create guided tutorials for common APIs
4. **Code Analysis** - Understand which APIs are most important
5. **Library Evolution** - Track API usage over time

## Customization

You can customize the extraction by modifying:

- **Core Functions Set** - Which APIs are considered "core"
- **Categories** - How APIs are grouped
- **Patterns** - Regex patterns for API detection
- **Usage Analysis** - Which code examples to analyze

## Output Format

### Markdown Documentation
- Organized by category
- Usage indicators (🌟 for core, 📊 for usage count)
- TypeScript signatures
- Table of contents

### TypeScript Definitions
- Clean, organized type definitions
- Grouped by category
- Only includes frequently used APIs

### JSON Data
- Structured data for programmatic access
- Metadata about extraction
- Full API details with classifications

## Future Enhancements

Potential improvements:
- Integration with LSP for real-time suggestions
- Usage analytics from larger codebases
- API deprecation tracking
- Performance impact analysis
- Community usage patterns 
