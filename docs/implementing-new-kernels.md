# Implementing New Kernels in Tau

This document outlines the complete process for implementing a new CAD kernel in Tau. The example used throughout this guide is the Zoo (KCL) kernel implementation.

## Overview

A kernel in Tau is a CAD computation engine that can execute code in a specific language and produce 3D geometry. Each kernel consists of:

1. **Worker Implementation** - A Web Worker that handles code execution and geometry generation
2. **Type Definitions** - TypeScript interfaces and types
3. **UI Integration** - User interface components and configuration
4. **Chat Integration** - AI assistant prompts and configuration

## Step-by-Step Implementation Guide

### 1. Create the Worker Implementation

**Location**: `apps/ui/app/components/geometry/kernel/{KERNEL_NAME}/{KERNEL_NAME}.worker.ts`

The worker must implement the following interface:

```typescript
interface KernelWorkerInterface {
  // Initialize the kernel (setup SDK, load dependencies)
  initialize(): Promise<void>;
  
  // Check if the kernel is ready
  ready(): Promise<boolean>;
  
  // Build 3D shapes from source code
  buildShapesFromCode(
    code: string, 
    parameters?: Record<string, unknown>, 
    shapeId?: string
  ): Promise<BuildShapesResult>;
  
  // Extract parameters from source code for the parameter panel
  extractParametersFromCode(code: string): Promise<ExtractParametersResult>;
  
  // Export shapes to various formats (STL, STEP, etc.)
  exportShape(
    fileType: 'stl' | 'stl-binary' | 'step' | 'step-assembly',
    shapeId?: string
  ): Promise<ExportGeometryResult>;
  
  // Exception handling (may not be applicable to all kernels)
  toggleExceptions(): Promise<'single' | 'withExceptions'>;
  isExceptionsEnabled(): boolean;
}
```

**Key Requirements:**
- Use `expose(service)` from Comlink to expose the worker
- Return results using `createKernelSuccess(data)` or `createKernelError(error)`
- Handle empty code gracefully (return empty shapes)
- Store geometry data for export functionality
- Implement proper error handling and logging

### 2. Update Type Definitions

#### 2.1 Add Kernel to Provider Types

**Files to Update:**
- `apps/ui/app/types/kernel.types.ts`
- `apps/api/app/types/kernel.types.ts`

```typescript
// Add your kernel to the kernelProviders array
export const kernelProviders = ['replicad', 'openscad', 'your-kernel'] as const;
export type KernelProvider = (typeof kernelProviders)[number];
```

### 3. Update Kernel Machine

**File**: `apps/ui/app/machines/kernel.machine.ts`

#### 3.1 Import Worker
```typescript
import type { YourKernelInterface as YourWorker } from '~/components/geometry/kernel/your-kernel/your-kernel.worker.js';
import YourKernelWorker from '~/components/geometry/kernel/your-kernel/your-kernel.worker.js?worker';
```

#### 3.2 Add to Workers Object
```typescript
const workers = {
  replicad: ReplicadBuilderWorker,
  openscad: OpenSCADBuilderWorker,
  'your-kernel': YourKernelWorker,
} as const satisfies Partial<Record<KernelProvider, new () => Worker>>;
```

#### 3.3 Update Worker Creation and Cleanup
Add your worker to:
- Worker initialization in `createWorkersActor`
- Worker cleanup in `destroyWorkers` action
- Context initialization
- Type definitions for `KernelContext`

### 4. Update Kernel Constants

**File**: `apps/ui/app/constants/kernel.constants.ts`

Add your kernel to the `kernelOptions` array:

```typescript
{
  id: 'your-kernel',
  name: 'Your Kernel Name',
  description: 'Brief description of your kernel',
  mainFile: 'main.ext', // File extension for your language
  longDescription: 'Detailed description of capabilities...',
  emptyCode: `// Example empty code template
const example = "hello world"
`,
  recommended: 'Your use case recommendation',
  tags: ['tag1', 'tag2', 'tag3'],
  features: ['Feature 1', 'Feature 2', 'Feature 3'],
  examples: [
    { name: 'Example 1', description: 'Description of example 1' },
    { name: 'Example 2', description: 'Description of example 2' },
  ],
}
```

### 5. Configure Chat Integration

**File**: `apps/api/app/api/chat/prompts/chat-prompt-cad.ts`

Add your kernel configuration to the `cadKernelConfigs` object:

```typescript
'your-kernel': {
  fileExtension: '.ext',
  languageName: 'Your Language Name',
  roleDescription: 'Description of what your language does...',
  technicalContext: `
<technical_context>
## Understanding Your Kernel's Strengths
Detailed explanation of your kernel's capabilities...
</technical_context>`,
  codeStandards: `
<code_standards>
## Code Output Requirements
Guidelines for generating code in your language...
</code_standards>`,
  modelingStrategy: `
<modeling_strategy>
## Design Philosophy
Your kernel's modeling approach...
</modeling_strategy>`,
  technicalResources: `
<technical_resources>
Available APIs, documentation, examples...
</technical_resources>`,
  codeErrorDescription: 'Description of compilation errors...',
  kernelErrorDescription: 'Description of runtime errors...',
  commonErrorPatterns: `Common error patterns and solutions...`,
  parameterNamingConvention: 'camelCase', // or 'snake_case'
  parameterNamingExample: '`parameterName` rather than `param`',
  implementationApproach: 'How to approach implementing models...',
  mainFunctionDescription: 'How the main function should be structured...',
}
```

### 6. Update Documentation

#### 6.1 Update Kernel Overview
**File**: `docs/kernel.md`

Add your kernel to the kernels table and create a usage section.

#### 6.2 Add Dependencies (if applicable)
If your kernel requires external dependencies, document them in:
- Installation instructions
- Package.json dependencies (if needed)
- Environment setup requirements

### 7. Testing and Validation

#### 7.1 Required Tests
- Worker initialization
- Code execution with valid input
- Parameter extraction
- Error handling for invalid code
- Export functionality (STL/STEP)
- Empty code handling

#### 7.2 Integration Testing
- Kernel selection in UI
- Parameter panel functionality
- 3D viewer rendering
- Export operations
- Chat integration

### 8. Additional Considerations

#### 8.1 Performance
- Implement lazy loading for large SDKs
- Use Web Workers to avoid blocking the main thread
- Cache compiled results when possible
- Optimize geometry data structures

#### 8.2 Error Handling
- Provide clear, actionable error messages
- Include line/column information when possible
- Handle network failures gracefully (for cloud-based kernels)
- Implement proper fallbacks

#### 8.3 Security
- Validate all user input
- Sanitize code before execution
- Implement timeouts for long-running operations
- Use CSP-compliant code loading

## Example: Zoo Kernel Implementation

The Zoo kernel serves as a complete reference implementation. Key files to examine:

- **Worker**: `apps/ui/app/components/geometry/kernel/zoo/zoo.worker.ts`
- **Type updates**: Search for 'zoo' in kernel.types.ts files
- **Machine integration**: Updates to kernel.machine.ts
- **UI configuration**: Updates to kernel.constants.ts
- **Chat prompts**: Zoo configuration in chat-prompt-cad.ts

## Dependencies and Setup

### Required Dependencies
Most kernels will require their respective SDKs or libraries:

```bash
# Example for Zoo kernel
pnpm install @kittycad/lib

# Example for other kernels
# pnpm install your-kernel-sdk
```

### Environment Variables
Some kernels may require API keys or configuration:

```env
# Example environment variables
YOUR_KERNEL_API_KEY=your_api_key_here
YOUR_KERNEL_ENDPOINT=https://api.yourkernel.com
```

## Troubleshooting Common Issues

### Worker Import Errors
- Ensure the worker file is properly exposed with Comlink
- Check that all imports use the correct file extensions
- Verify that the worker constructor is properly typed

### Type Errors
- Ensure all kernel provider arrays are updated consistently
- Check that the worker interface matches the expected signature
- Verify that union types include your new kernel

### Runtime Errors
- Check worker initialization order
- Verify that dependencies are properly loaded
- Ensure error handling covers all edge cases

### Integration Issues
- Verify that the kernel is properly registered in all machines
- Check that UI components can handle the new kernel type
- Test the complete user workflow end-to-end

## Best Practices

1. **Follow Existing Patterns**: Study the OpenSCAD and Replicad implementations
2. **Implement Incrementally**: Start with basic functionality, then add features
3. **Test Early and Often**: Test each component as you build it
4. **Document Thoroughly**: Include examples and common use cases
5. **Handle Errors Gracefully**: Provide helpful feedback to users
6. **Optimize for Performance**: Consider lazy loading and caching strategies
7. **Maintain Consistency**: Follow the established code style and patterns

## Contributing

When contributing a new kernel:

1. Follow this implementation guide
2. Include comprehensive tests
3. Update all relevant documentation
4. Provide example code and use cases
5. Consider backward compatibility
6. Submit a PR with detailed description of the kernel's capabilities

For questions or support, please refer to the main project documentation or open an issue in the repository.