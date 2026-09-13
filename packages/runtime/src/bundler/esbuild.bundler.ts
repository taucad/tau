/**
 * ESBuild Bundler Definition
 *
 * Provides the `defineBundler` plugin interface for the kernel framework:
 * - detectImports: lightweight pass that discovers bare-specifier imports
 *   transitively using esbuild externals mode (no modules need to be registered)
 * - bundle: full production bundle with all registered modules resolved
 * - execute: run bundled JS/TS code via dynamic import (Blob URL or data URL)
 * - registerModule: register/update builtin modules for bundle resolution
 * - resolveDependencies: fast-path dependency resolution via metafile
 */

import type { KernelIssue, KernelIssueCode, KernelIssueType } from '#types/runtime.types.js';
import type { BundleResult, ExecuteResult } from '#types/runtime-bundler.types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { createEsbuildModuleVm } from '@taucad/vm';
import type { BundleResult as VmBundleResult, ModuleVm, VmExecuteResult, VmIssue } from '@taucad/vm';

const autoExportNames = ['main', 'defaultParams', 'getParameterDefinitions'];

const kernelIssueCodes = new Set<KernelIssueCode>([
  'RENDER_TIMEOUT',
  'RENDER_ABORTED',
  'KERNEL_BINDING_FAILED',
  'KERNEL_CAPABILITY_MISSING',
  'BUNDLER_FAILED',
  'MIDDLEWARE_FAILED',
  'RUNTIME',
  'UNKNOWN',
]);

const kernelIssueTypes = new Set<KernelIssueType>(['compilation', 'runtime', 'kernel', 'connection', 'unknown']);

const toKernelIssueCode = (code: string): KernelIssueCode => {
  if (kernelIssueCodes.has(code as KernelIssueCode)) {
    return code as KernelIssueCode;
  }

  return 'UNKNOWN';
};

const toKernelIssueType = (type: string): KernelIssueType => {
  if (kernelIssueTypes.has(type as KernelIssueType)) {
    return type as KernelIssueType;
  }

  return 'unknown';
};

const toKernelIssue = (issue: VmIssue): KernelIssue => ({
  message: issue.message,
  code: toKernelIssueCode(issue.code),
  location: issue.location?.fileName
    ? {
        fileName: issue.location.fileName,
        startLineNumber: issue.location.startLineNumber ?? 1,
        startColumn: issue.location.startColumn ?? 1,
        endLineNumber: issue.location.endLineNumber,
        endColumn: issue.location.endColumn,
      }
    : undefined,
  type: toKernelIssueType(issue.type),
  severity: issue.severity,
});

const toBundleResult = (result: VmBundleResult): BundleResult => ({
  ...result,
  issues: result.issues.map(toKernelIssue),
});

const toExecuteResult = (result: VmExecuteResult): ExecuteResult => {
  if (result.success) {
    return result;
  }

  return {
    success: false,
    issues: result.issues.map(toKernelIssue),
  };
};

/** @public */
export default defineBundler<{ vm: ModuleVm }>({
  name: 'EsbuildBundler',
  version: '1.0.0',
  extensions: ['ts', 'js', 'tsx', 'jsx'],

  async initialize({ filesystem, projectPath }, _options) {
    const vm = await createEsbuildModuleVm({
      filesystem,
      projectPath,
      autoExportNames,
      cacheExecution: true,
    });
    return { vm };
  },

  async detectImports({ entryPath }, context) {
    return context.vm.detectImports(entryPath);
  },

  async bundle({ entryPath }, context) {
    return toBundleResult(await context.vm.bundle(entryPath));
  },

  async execute(code, context) {
    return toExecuteResult(await context.vm.execute(code));
  },

  registerModule(name, builtinModule, context) {
    context.vm.registerModule(name, {
      code: builtinModule.code,
      version: builtinModule.version,
      globalName: builtinModule.globalName,
    });
  },

  async resolveDependencies({ entryPath }, context) {
    return context.vm.resolveDependencies(entryPath);
  },

  async cleanup(context) {
    context.vm.dispose();
  },
});
