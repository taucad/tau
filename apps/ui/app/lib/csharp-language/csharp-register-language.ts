// oxlint-disable-next-line import/no-unassigned-import -- Monaco registers C# metadata and lazy tokenizer by side effect.
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js';

import { codeLanguages } from '@taucad/types/constants';
import type { LanguageContribution } from '#lib/monaco-language-registry.js';

/** Monaco's installed C# contribution owns syntax and language configuration. */
export const csharpContribution: LanguageContribution = {
  languageId: codeLanguages.csharp,
  activationLanguageIds: [codeLanguages.csharp],
  register: () => undefined,
  activate: () => ({ disposables: [] }),
  dispose: () => undefined,
};
