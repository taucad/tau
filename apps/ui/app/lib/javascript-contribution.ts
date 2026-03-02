/**
 * JavaScript/TypeScript Language Contribution
 *
 * Conforms to the LanguageContribution interface for uniform lifecycle management.
 * Handles TypeScript compiler options, the custom JS definition provider
 * for Cmd+Click navigation on imports, and Automatic Type Acquisition (ATA)
 * for IntelliSense on external package imports.
 */

import type * as Monaco from 'monaco-editor';
import { replicadTypesOriginal, jscadModelingTypes, manifoldTypes } from '@taucad/api-extractor';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';
import { createJsDefinitionProvider } from '#lib/javascript-definition-provider.js';
import { ModuleResolver } from '#lib/javascript-module-resolver.js';
import { TypeAcquisitionService } from '#lib/type-acquisition-service.js';
import { monacoLanguages } from '#lib/monaco.constants.js';

/**
 * Check if a path is in node_modules (and should be read-only).
 */
function isNodeModulesPath(path: string): boolean {
  return path.includes('/node_modules/') || path.startsWith('node_modules/');
}

/** File extensions for JavaScript/TypeScript files */
const jsExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Check if a path is a JavaScript/TypeScript file.
 */
function isJsFile(path: string): boolean {
  return jsExtensions.some((extension) => path.endsWith(extension));
}

/** Module-level ATA instance for cross-method access */
let ataInstance: TypeAcquisitionService | undefined;

export const jsTsContribution: LanguageContribution = {
  languageId: 'typescript', // Primary language ID (covers JS/TS family)

  register(_monaco: typeof Monaco): void {
    // No-op: Monaco's built-in TS/JS support is always available
  },

  activate(context: ActivationContext): ActivationResult {
    const { monaco } = context;
    const disposables: Monaco.IDisposable[] = [];

    // Configure TypeScript compiler options
    monaco.typescript.typescriptDefaults.setCompilerOptions({
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      allowImportingTsExtensions: true,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.typescript.ScriptTarget.ESNext,
      module: monaco.typescript.ModuleKind.ESNext,
      noLib: false,
      allowNonTsExtensions: true,
      noEmit: true,
      esModuleInterop: true,
      baseUrl: '.',
    });

    monaco.typescript.typescriptDefaults.setEagerModelSync(true);

    // Also configure JavaScript defaults
    monaco.typescript.javascriptDefaults.setCompilerOptions({
      allowSyntheticDefaultImports: true,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.typescript.ScriptTarget.ESNext,
      module: monaco.typescript.ModuleKind.ESNext,
      allowJs: true,
      checkJs: true,
      esModuleInterop: true,
    });
    monaco.typescript.javascriptDefaults.setEagerModelSync(true);

    // Create module resolver and definition provider
    const resolver = new ModuleResolver({ exists: async (path: string) => context.fileManager.exists(path) });
    const provider = createJsDefinitionProvider(monaco, { resolver });

    // Register for all JS/TS languages
    disposables.push(
      monaco.languages.registerDefinitionProvider(monacoLanguages.typescript, provider),
      monaco.languages.registerDefinitionProvider(monacoLanguages.javascript, provider),
      monaco.languages.registerDefinitionProvider(monacoLanguages.typescriptreact, provider),
      monaco.languages.registerDefinitionProvider(monacoLanguages.javascriptreact, provider),
    );

    // Initialize Automatic Type Acquisition
    ataInstance = new TypeAcquisitionService();
    ataInstance.initialize(monaco, {
      staticTypes: [
        { packageName: 'replicad', content: replicadTypesOriginal, prewrapped: true },
        { packageName: '@jscad/modeling', content: jscadModelingTypes, prewrapped: true },
        { packageName: 'manifold-3d', content: manifoldTypes, prewrapped: true },
      ],
    });
    ataInstance.startWatching();

    disposables.push({
      dispose(): void {
        ataInstance?.dispose();
        ataInstance = undefined;
      },
    });

    // Navigation handler for JS/TS files
    const navigationHandler = {
      canHandle(path: string): boolean {
        return isJsFile(path);
      },
      isReadOnly(path: string): boolean {
        return isNodeModulesPath(path);
      },
    };

    return {
      disposables,
      navigationHandler,
    };
  },

  onBuildSessionChange(_buildId: string): void {
    ataInstance?.onBuildSessionChange();
  },

  dispose(): void {
    // ATA disposal is handled by the disposable in activate()
  },
};
