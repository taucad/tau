/**
 * TypeScript / TSX language contribution (Monaco `typescript`, `typescriptreact`).
 *
 * Activation is family-aligned with Monaco's TypeScript worker so
 * {@link registerMaterializingTsProviders} never races `"TypeScript not registered!"`.
 *
 * Shared ATA + kernel typings live in `typescript-family-shared.ts`.
 */

import type * as Monaco from 'monaco-editor';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';
import { registerMaterializingTsProviders } from '#lib/monaco-typescript-extras/register-materializing-typescript-providers.client.js';
import { ensureAtaBoot, forwardAtaProjectSessionChange, setTsCompilerOptions } from '#lib/typescript-family-shared.js';

export const tsContribution: LanguageContribution = {
  languageId: 'typescript',
  activationLanguageIds: ['typescript', 'typescriptreact'],

  register(_monaco: typeof Monaco): void {
    // No-op: Monaco's built-in TS support is always available
  },

  activate(context: ActivationContext): ActivationResult {
    const { monaco, workspaceFs } = context;
    const disposables: Monaco.IDisposable[] = [];

    setTsCompilerOptions(monaco);
    disposables.push(ensureAtaBoot(monaco, context.fileManagerRef));
    disposables.push(registerMaterializingTsProviders({ monaco, workspaceFs }));

    return { disposables };
  },

  onProjectSessionChange(projectId: string): void {
    forwardAtaProjectSessionChange(projectId);
  },

  dispose(): void {
    // ATA + provider disposal owned by activate() disposables
  },
};
