JSCAD kernel integration (initial wiring)
========================================

This document explains how to add a new CAD kernel to the Tau UI. It documents the steps taken to integrate the JSCAD kernel and can be used as a template for future kernels.

What we added
-------------
- New worker: `apps/ui/app/components/geometry/kernel/jscad/jscad.worker.ts`
- Type re-export to prevent double bundling: `apps/ui/app/components/geometry/kernel/jscad/jscad.worker.types.ts`
- Kernel registry update: `libs/types/src/constants/kernel.constants.ts` (added `jscad` entry)
- Kernel machine wiring: `apps/ui/app/machines/kernel.machine.ts` (spawning/teardown/priority)
- Examples:
  - Library: `libs/tau-examples/src/build.examples.ts` → exported `jscadExamples`
  - Index export: `libs/tau-examples/src/index.ts`
  - UI sample builds: `apps/ui/app/constants/build-examples.ts` → added `jscad` builds

How to add a new kernel (repeatable recipe)
------------------------------------------
1) Create a worker
   - Location: `apps/ui/app/components/geometry/kernel/<kernel>/<kernel>.worker.ts`
   - Extend `KernelWorker` and implement:
     - `canHandle(file)` → quick gate to detect supported files
     - `extractParameters(file)` → return `{ defaultParameters, jsonSchema }`
     - `computeGeometry(file, parameters)` → return `Geometry[]` (e.g. GLTF blob)
     - `exportGeometry(format, geometryId?)` → return blobs for requested format(s)
   - Expose the worker via `comlink`:
     ```
     const service = new MyWorker();
     expose(service);
     export type MyWorkerInterface = typeof service;
     ```
   - Add a `.types.ts` sibling that re-exports the worker interface type to avoid Vite bundling the worker twice:
     ```
     // eslint-disable-next-line no-barrel-files/no-barrel-files
     export type { MyWorkerInterface } from '#components/geometry/kernel/<kernel>/<kernel>.worker.js';
     ```

2) Register in the kernel machine
   - File: `apps/ui/app/machines/kernel.machine.ts`
   - Extend the local `KernelProvider` union with your id (e.g. `'jscad'`).
   - Import the worker:
     ```
     import type { MyWorkerInterface as MyWorker } from '#components/geometry/kernel/<kernel>/<kernel>.worker.types.js';
     import MyBuilderWorker from '#components/geometry/kernel/<kernel>/<kernel>.worker.js?worker';
     ```
   - Add to `workers` map and `workerPriority`.
   - Create, wrap, and initialize the worker in `createWorkersActor`.
   - Store references in `context.workers` and `context.wrappedWorkers`.
   - Add cleanup in `destroyWorkers` action.

3) Add a kernel entry to the catalog
   - File: `libs/types/src/constants/kernel.constants.ts`
   - Append a `KernelConfiguration` record with:
     - `id`, `name`, `language`, `dimensions`, `mainFile`, `backendProvider`
     - `emptyCode` starter (what gets created when the user starts a new build)
   - All UI selectors and helpers (`getMainFile`, `getEmptyCode`) use this registry.

4) Provide examples (optional but recommended)
   - Library: `libs/tau-examples/src/build.examples.ts`
     - Export a list of `{ id, name, code, thumbnail }` models.
   - Re-export from `libs/tau-examples/src/index.ts`.
   - UI: `apps/ui/app/constants/build-examples.ts`
     - Map examples to `Build` objects and add to `sampleBuilds`.

5) Verify Nx tasks
   - Typecheck UI: `pnpm nx typecheck ui`
   - Lint UI: `pnpm nx lint ui`
   - Test UI: `pnpm nx test ui --watch=false`

About the JSCAD worker (fully implemented)
-------------------------------------------
- `canHandle` detects TS/JS code importing or requiring `@jscad/modeling`.
- `extractParameters` supports both:
  - **ES Modules**: `export const defaultParams = { ... }` → Converts to JSON Schema
  - **CommonJS**: `getParameterDefinitions()` → Converts parameter definitions to JSON Schema with proper type mapping
- `computeGeometry` executes user code in a sandboxed VM and converts JSCAD geometry to GLTF for rendering.
- `exportGeometry` supports STL export format.

Key implementation details:
- Uses the shared VM (`replicad/vm.ts`) with `@jscad/modeling` injected into `globalThis.jscadModeling`.
- Parameter schema generation handled by `jscad.schema.ts` with comprehensive type mapping:
  - `caption` → `description`
  - `initial`/`default` → `default`
  - `min` → `minimum`
  - `max` → `maximum`
  - `step` → `multipleOf`
  - JSCAD types (`int`, `float`, `text`, `checkbox`, `choice`, `slider`) → JSON Schema types
- GLTF conversion uses `gltf-transform` library for robust scene construction with proper normals.
- Supports both ES module (`export default function main`) and CommonJS (`module.exports = { main }`) patterns.

6) Add AI chat prompt configuration (for AI-assisted modeling)
   - File: `apps/api/app/api/chat/prompts/chat-prompt-cad.ts`
   - Import examples if available: `import { yourKernelExamples } from '@taucad/tau-examples';`
   - Create examples string: `const yourExamplesString = yourKernelExamples.map(...).join('\\n\\n');`
   - Add a `KernelConfig` entry to `cadKernelConfigs` with:
     - `fileExtension`: File extension for this kernel (e.g., `.js`, `.scad`, `.ts`)
     - `languageName`: Human-readable name (e.g., "JSCAD (JavaScript)")
     - `roleDescription`: Brief description of the kernel's purpose
     - `technicalContext`: Detailed explanation of the kernel's strengths and use cases
     - `codeStandards`: Code output requirements, syntax examples, and formatting rules
     - `modelingStrategy`: Design philosophy and modeling approach
     - `technicalResources`: Available APIs, modules, and example code
     - `codeErrorDescription`: Description of compilation/syntax errors
     - `kernelErrorDescription`: Description of runtime/geometric errors
     - `commonErrorPatterns`: List of common issues and solutions
     - `parameterNamingConvention`: Naming style (camelCase, snake_case, etc.)
     - `parameterNamingExample`: Example of good parameter naming
     - `implementationApproach`: Guidance for planning model implementation
     - `mainFunctionDescription`: Description of how the main function should work

Gotchas and conventions
-----------------------
- Always return result-pattern objects (`createKernelSuccess` / `createKernelError`).
- Add supported export formats via the `supportedExportFormats` static property.
- Keep worker initialization lightweight; `canHandle` must be fast and not initialize heavy runtimes.
- Follow eslint/type rules (explicit return types, `import type`, etc.).
- For parameter extraction, prefer creating dedicated schema utilities (e.g., `jscad.schema.ts`) for complex transformations.
- When converting geometry to GLTF, use `gltf-transform` for robust scene construction with proper normals.
- Test both ES module and CommonJS patterns if your kernel supports JavaScript/TypeScript.


