# VSCode TypeScript Language Features Research

This document provides a comprehensive analysis of how VSCode implements TypeScript language features, with the goal of implementing similar capabilities in Tau's Monaco-based editor.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Language Features Catalog](#language-features-catalog)
3. [Monaco Editor APIs](#monaco-editor-apis)
4. [Type Resolution Mechanisms](#type-resolution-mechanisms)
5. [Virtual Filesystem Handling](#virtual-filesystem-handling)
6. [Auto Type Acquisition (ATA)](#auto-type-acquisition-ata)
7. [Current Tau Implementation Gap Analysis](#current-tau-implementation-gap-analysis)
8. [Recommended Implementation Approach](#recommended-implementation-approach)

---

## Architecture Overview

VSCode's TypeScript support is split across two layers:

### 1. Monaco Editor's Built-in TypeScript Support

Monaco Editor bundles a TypeScript language worker that provides:
- Syntax highlighting (tokenization)
- Basic diagnostics
- Completions
- Hover information
- Go-to-definition (within synced files)
- Signature help

This is accessed via `monaco.languages.typescript.typescriptDefaults` API.

### 2. VSCode TypeScript Extension

Located in `extensions/typescript-language-features/`, this extension provides full IDE features by:
- Spawning a `tsserver` process (TypeScript's language server)
- Communicating via JSON-RPC protocol
- Registering VSCode language providers that delegate to tsserver

**Key Components:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VSCode TypeScript Extension                  │
├─────────────────────────────────────────────────────────────────────┤
│  extension.ts                    Entry point, activation            │
│  ├── typeScriptServiceClientHost.ts  Orchestrates language features│
│  │   ├── typescriptServiceClient.ts  Main tsserver client          │
│  │   │   ├── tsServer/spawner.ts     Spawns tsserver process       │
│  │   │   ├── tsServer/bufferSyncSupport.ts  File synchronization   │
│  │   │   └── tsServer/requestQueue.ts  Request management          │
│  │   └── languageProvider.ts     Registers all language providers  │
│  │       └── languageFeatures/*  Individual feature implementations│
│  └── commands/index.ts           Command registrations             │
└─────────────────────────────────────────────────────────────────────┘
```

**Request/Response Flow:**

```
Monaco Editor → Language Provider → TypeScriptServiceClient →
Request Queue → tsserver Process → Response → Callback → Provider → Editor
```

---

## Language Features Catalog

### Navigation Features

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Go to Definition | `definitions.ts` | `definitionAndBoundSpan` | `registerDefinitionProvider` |
| Go to Type Definition | `typeDefinitions.ts` | `typeDefinition` | `registerTypeDefinitionProvider` |
| Go to Implementation | `implementations.ts` | `implementation` | `registerImplementationProvider` |
| Go to Source Definition | `sourceDefinition.ts` | `findSourceDefinition` | Command-based |
| Find All References | `references.ts` | `references` | `registerReferenceProvider` |
| File References | `fileReferences.ts` | N/A | Command-based |

### Hover and Information

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Hover Information | `hover.ts` | `quickinfo` | `registerHoverProvider` |
| Signature Help | `signatureHelp.ts` | `signatureHelp` | `registerSignatureHelpProvider` |

### Completions

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Auto-completion | `completions.ts` | `completionInfo`, `completionDetails` | `registerCompletionItemProvider` |
| JSDoc Completions | `jsDocCompletions.ts` | N/A | `registerCompletionItemProvider` |
| Directive Comments | `directiveCommentCompletions.ts` | N/A | `registerCompletionItemProvider` |

### Refactoring and Code Actions

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Quick Fixes | `quickFix.ts` | `getCodeFixes` | `registerCodeActionProvider` |
| Refactor Actions | `refactor.ts` | `getApplicableRefactors`, `getEditsForRefactor` | `registerCodeActionProvider` |
| Organize Imports | `organizeImports.ts` | `organizeImports` | `registerCodeActionProvider` |
| Fix All | `fixAll.ts` | `getCombinedCodeFix` | `registerCodeActionProvider` |

### Rename

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Rename Symbol | `rename.ts` | `rename`, `getEditsForFileRename` | `registerRenameProvider` |
| Update Paths on File Rename | `updatePathsOnRename.ts` | `getEditsForFileRename` | N/A |

### Diagnostics

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Syntax Diagnostics | `diagnostics.ts` | `syntaxDiag` | Diagnostic markers |
| Semantic Diagnostics | `diagnostics.ts` | `semanticDiag` | Diagnostic markers |
| Suggestion Diagnostics | `diagnostics.ts` | `suggestionDiag` | Diagnostic markers |

### Code Lens

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| References Count | `codeLens/referencesCodeLens.ts` | `references` | `registerCodeLensProvider` |
| Implementations Count | `codeLens/implementationsCodeLens.ts` | `implementation` | `registerCodeLensProvider` |

### Formatting

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Document Formatting | `formatting.ts` | `format` | `registerDocumentFormattingEditProvider` |
| Range Formatting | `formatting.ts` | `format` | `registerDocumentRangeFormattingEditProvider` |
| On-Type Formatting | `formatting.ts` | `formatonkey` | `registerOnTypeFormattingEditProvider` |

### Semantic Highlighting

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Semantic Tokens | `semanticTokens.ts` | `encodedSemanticClassifications-full` | `registerDocumentSemanticTokensProvider` |

**Token Types:** class, enum, interface, namespace, typeParameter, type, parameter, variable, enumMember, property, function, method

**Token Modifiers:** async, declaration, readonly, static, local, defaultLibrary

### Document Structure

| Feature | VSCode File | tsserver Command | Monaco API |
|---------|-------------|------------------|------------|
| Document Symbols (Outline) | `documentSymbol.ts` | `navtree` | `registerDocumentSymbolProvider` |
| Workspace Symbols | `workspaceSymbols.ts` | `navto` | `registerWorkspaceSymbolProvider` |
| Folding Ranges | `folding.ts` | `getOutliningSpans` | `registerFoldingRangeProvider` |
| Document Highlight | `documentHighlight.ts` | `documentHighlights` | `registerDocumentHighlightProvider` |

### Advanced Features

| Feature | VSCode File | tsserver Command | Monaco API | Min TS Version |
|---------|-------------|------------------|------------|----------------|
| Call Hierarchy | `callHierarchy.ts` | `prepareCallHierarchy`, `provideCallHierarchy*` | `registerCallHierarchyProvider` | 3.8+ |
| Inlay Hints | `inlayHints.ts` | `provideInlayHints` | `registerInlayHintsProvider` | 4.4+ |
| Linked Editing (JSX tags) | `linkedEditing.ts` | `linkedEditingRange` | `registerLinkedEditingRangeProvider` | 5.1+ |
| Smart Selection | `smartSelect.ts` | `selectionRange` | `registerSelectionRangeProvider` |
| Tag Closing | `tagClosing.ts` | `jsxClosingTag` | N/A |

---

## Monaco Editor APIs

### Language Registration

```typescript
// Register a language
monaco.languages.register({
  id: 'typescript',
  extensions: ['.ts', '.tsx'],
  aliases: ['TypeScript'],
  mimetypes: ['text/typescript']
});

// Set language configuration (brackets, comments, etc.)
monaco.languages.setLanguageConfiguration('typescript', {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' }
  ]
});
```

### Provider Registration Pattern

All providers follow this pattern:

```typescript
monaco.languages.register<ProviderType>Provider(
  languageSelector: string | DocumentFilter | Array<...>,
  provider: ProviderType
): IDisposable
```

### TypeScript Defaults API

```typescript
// Get TypeScript defaults
const tsDefaults = monaco.languages.typescript.typescriptDefaults;

// Set compiler options
tsDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  strict: true,
  esModuleInterop: true,
  baseUrl: '.',
  paths: { ... }
});

// Add extra library (type definitions)
tsDefaults.addExtraLib(
  'declare module "replicad" { export function makeBaseBox(...): Shape; }',
  'file:///node_modules/replicad/index.d.ts'
);

// Set all extra libs at once (replaces existing)
tsDefaults.setExtraLibs([
  { content: '...', filePath: 'file:///node_modules/pkg/index.d.ts' }
]);

// Enable eager model sync (sync all models to worker)
tsDefaults.setEagerModelSync(true);

// Set diagnostics options
tsDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false
});
```

### Model Management

```typescript
// Create a model (represents a file)
const model = monaco.editor.createModel(
  content,      // File content
  'typescript', // Language ID
  monaco.Uri.file('/main.ts')  // File URI
);

// Get existing model
const model = monaco.editor.getModel(uri);

// Get all models
const models = monaco.editor.getModels();

// Listen for model changes
model.onDidChangeContent((event) => {
  // event.changes contains the edits
});

// Dispose model
model.dispose();
```

### Position and Range

```typescript
// Create position (1-indexed)
const position = new monaco.Position(lineNumber, column);

// Create range
const range = new monaco.Range(startLine, startCol, endLine, endCol);

// Get word at position
const word = model.getWordAtPosition(position);

// Convert offset to position
const pos = model.getPositionAt(offset);
const offset = model.getOffsetAt(position);
```

---

## Type Resolution Mechanisms

### How VSCode Resolves Types

VSCode's TypeScript extension delegates type resolution to `tsserver`, which uses TypeScript's standard module resolution:

1. **tsconfig.json Discovery**
   - Searches for `tsconfig.json` in directory hierarchy
   - Uses `compilerOptionsForInferredProjects` for files without tsconfig

2. **Module Resolution**
   - `moduleResolution: "Node"` or `"Bundler"` (TS 5.4+)
   - Resolves `node_modules` packages
   - Follows `package.json` `types`/`typings` field
   - Checks `@types/*` packages

3. **Type Roots**
   - Default: `node_modules/@types`
   - Can be overridden via `typeRoots` in tsconfig

### Inferred Project Compiler Options

For files without `tsconfig.json`, VSCode sets defaults:

```typescript
// From tsconfig.ts
{
  module: 'Preserve',          // TS 5.4+, else 'ESNext'
  moduleResolution: 'Bundler', // TS 5.4+, else 'Node'
  target: 'ES2022',
  jsx: 'react-jsx',
  allowJs: true,
  allowSyntheticDefaultImports: true,
  allowNonTsExtensions: true
}
```

### Monaco's Type Resolution (Standalone)

Monaco's built-in TypeScript worker has limited type resolution:

1. **No filesystem access** - Cannot read `node_modules` directly
2. **Extra libs only** - Types must be registered via `addExtraLib()`
3. **No tsconfig.json support** - Uses `setCompilerOptions()` instead
4. **Synced models** - Only sees files registered as Monaco models

---

## Virtual Filesystem Handling

### VSCode's Approach

VSCode uses `BufferSyncSupport` to synchronize editor content with `tsserver`:

```typescript
// Buffer states
enum BufferState {
  Initial,  // Not yet opened
  Open,     // Content synced to tsserver
  Closed    // Removed from tsserver
}

// Sync operations (batched)
{
  openFiles: [{ file, content, scriptKind }],
  changedFiles: [{ file, textChanges }],
  closedFiles: [file1, file2]
}
```

**URI Scheme Handling:**
- `file://` - Direct filesystem path
- `untitled://` - Unsaved files
- `vscode-notebook-cell://` - Notebook cells
- Virtual schemes use in-memory prefix: `^/scheme/authority/path`

### Monaco Model Sync Pattern

```typescript
// Create models for all project files
for (const file of projectFiles) {
  monaco.editor.createModel(content, 'typescript', uri);
}

// Models are automatically synced to TypeScript worker
// when setEagerModelSync(true) is enabled
```

---

## Auto Type Acquisition (ATA)

### How VSCode Handles ATA

1. **Types Registry**
   - Loads `types-registry` package (npm registry of `@types/*` packages)
   - Maps package names to their `@types/*` equivalents

2. **Automatic Discovery**
   - When tsserver reports unresolved imports
   - Checks if `@types/*` package exists
   - Installs to a global typings cache

3. **Web Implementation**
   - Uses in-memory `MemFs` filesystem
   - Scheme: `vscode-global-typings`
   - Installs packages on-demand via `PackageManager` (nassun/node-maintainer)

4. **AutoInstallerFs**
   - Intercepts `node_modules` reads
   - Automatically installs missing packages
   - Caches to prevent duplicate installs

---

## Current Tau Implementation Gap Analysis

### What Tau Currently Has

| Feature | Implementation | Status |
|---------|---------------|--------|
| Syntax Highlighting | Monaco built-in | ✅ Working |
| Basic Completions | Monaco built-in | ✅ Working |
| Hover Information | Monaco built-in | ⚠️ Limited (no node_modules types) |
| Go to Definition | `javascript-definition-provider.ts` | ⚠️ Custom, limited |
| Diagnostics | Monaco built-in | ⚠️ Missing types show errors |
| Project File Sync | `monaco-project-sync.ts` | ✅ Working |
| Type Registration | `monaco.ts` + `addExtraLib` | ❌ Hardcoded, wrong types |

### Key Issues

1. **Wrong types for @jscad/modeling**
   - Currently uses `replicadTypesOriginal` (line 106 in `monaco.ts`)
   - Should use actual `@jscad/modeling` types

2. **No proper node_modules type discovery**
   - Types hardcoded in `registerMonaco()`
   - No dynamic loading from filesystem

3. **Limited Go to Definition**
   - Custom provider only handles relative imports
   - No support for node_modules

4. **No Auto Type Acquisition**
   - Can't discover `@types/*` packages
   - No CDN type fetching

---

## Recommended Implementation Approach

### Phase 1: Fix Type Registration

**Goal:** Properly resolve types from node_modules

1. **Write types to virtual node_modules**
   - When writing builtin modules, also write their `.d.ts` files
   - Use `writeBuiltinModule()` which already supports `types` field

2. **Sync node_modules types to Monaco**
   - Extend `monaco-project-sync.ts` to include `node_modules/**/*.d.ts`
   - Or use `addExtraLib()` with content from filesystem

3. **For @jscad/modeling specifically:**
   - Bundle types using `dts-bundle-generator`
   - Write bundled types to `node_modules/@jscad/modeling/index.d.ts`

### Phase 2: Enhanced Module Resolution

**Goal:** Enable Go to Definition for node_modules

1. **Extend `javascript-definition-provider.ts`**
   - Handle bare module specifiers (e.g., `replicad`)
   - Resolve to `node_modules/{pkg}/index.d.ts`

2. **Create Monaco models for type files**
   - Sync `.d.ts` files as Monaco models
   - Enable navigation within type definitions

### Phase 3: Full TypeScript Language Features

**Goal:** Match VSCode's TypeScript experience

1. **Consider using ts-morph or typescript directly**
   - Create a TypeScript program with virtual filesystem
   - Use TS Language Service API for advanced features

2. **Implement missing providers:**
   - Find All References
   - Rename Symbol
   - Code Actions (Quick Fixes)
   - Organize Imports

3. **Add semantic highlighting**
   - Register `DocumentSemanticTokensProvider`
   - Use TypeScript's semantic classification API

### Implementation Priority

1. **High Priority (Immediate)**
   - Fix `@jscad/modeling` types (bundle with `dts-bundle-generator`)
   - Write types to node_modules on builtin module registration

2. **Medium Priority**
   - Sync type files to Monaco models
   - Enhance Go to Definition for node_modules

3. **Lower Priority**
   - Auto Type Acquisition from CDN
   - Full tsserver integration (likely overkill for Tau's use case)

---

## Files to Modify

### Immediate Fixes

| File | Change |
|------|--------|
| `apps/ui/app/lib/monaco.ts` | Remove hardcoded type registration |
| `libs/api-extractor/src/index.ts` | Export bundled jscad types |
| `libs/api-extractor/src/extract-jscad-api.ts` | New: Bundle jscad types |

### Phase 1 Implementation

| File | Change |
|------|--------|
| `apps/ui/app/lib/monaco-types-service.ts` | Load types from filesystem |
| `apps/ui/app/components/geometry/kernel/utils/module-manager.ts` | Write types with builtin modules |
| `apps/ui/app/lib/monaco-project-sync.ts` | Sync node_modules types |

### Phase 2 Implementation

| File | Change |
|------|--------|
| `apps/ui/app/lib/javascript-definition-provider.ts` | Handle node_modules |
| `apps/ui/app/lib/javascript-module-resolver.ts` | Resolve types paths |

---

## References

- [VSCode TypeScript Extension](https://github.com/microsoft/vscode/tree/main/extensions/typescript-language-features)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/)
- [TypeScript Language Server Protocol](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29)
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator)
