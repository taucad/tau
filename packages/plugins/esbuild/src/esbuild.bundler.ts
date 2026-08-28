/**
 * ESBuild Bundler Definition
 *
 * Provides the `defineBundler` plugin interface for the kernel framework:
 * - detectImports: lightweight pass that discovers bare-specifier imports
 *   transitively using esbuild externals mode (no modules need to be registered)
 * - bundle: full production bundle with all registered modules resolved
 * - execute: run bundled JS/TS code via dynamic import (Blob URL or data URL)
 * - registerModule: register/update builtin modules for bundle resolution
 */

import { isKernelIssueCode } from '@taucad/runtime/types';
import type { KernelIssueCode, KernelIssue, KernelIssueType } from '@taucad/runtime/types';

import { defineBundler } from '@taucad/runtime/bundler';
import type { BundleResult, ExecuteResult } from '@taucad/runtime/bundler';

import { createEsbuildModuleVm } from '#vm/module-vm.js';
import type { BundleResult as VmBundleResult } from '#vm/esbuild-core.js';
import type { VmExecuteResult, VmIssue } from '#vm/types.js';

import { z } from 'zod';

const autoExportNames = ['main', 'defaultParams', 'getParameterDefinitions'];

/** @public */
export const esbuildOptionsSchema = z.object({
  extensions: z.array(z.string()).optional(),
});

/** Public esbuild plugin options. @public */
export type EsbuildOptions = z.input<typeof esbuildOptionsSchema>;

const kernelIssueTypes = new Set<KernelIssueType>(['compilation', 'runtime', 'kernel', 'connection', 'unknown']);

const toKernelIssueCode = (code: string): KernelIssueCode => {
  if (isKernelIssueCode(code)) {
    return code;
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
export const esbuildBundler = defineBundler({
  id: 'esbuild',
  name: 'EsbuildBundler',
  version: '1.0.0',
  optionsSchema: esbuildOptionsSchema,
  extensions: (options) => options?.extensions ?? ['ts', 'js', 'tsx', 'jsx'],

  async initialize(_options, { filesystem }) {
    const vm = await createEsbuildModuleVm({
      filesystem,
      autoExportNames,
      cacheExecution: true,
    });
    return { vm };
  },

  async detectImports({ entryPath }, { signal }, context) {
    return context.vm.detectImports(entryPath, signal);
  },

  async bundle({ entryPath }, { signal }, context) {
    return toBundleResult(await context.vm.bundle(entryPath, signal));
  },

  async execute({ code }, { signal }, context) {
    return toExecuteResult(await context.vm.execute(code, signal));
  },

  registerModule({ name, module: builtinModule }, context) {
    context.vm.registerModule(name, {
      code: builtinModule.code,
      version: builtinModule.version,
      globalName: builtinModule.globalName,
    });
  },

  clearExecutionCache(code, context) {
    context.vm.clearExecutionCache(code);
  },

  async cleanup(context) {
    context.vm.dispose();
  },
});
