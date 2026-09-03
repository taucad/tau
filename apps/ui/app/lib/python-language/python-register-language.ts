// oxlint-disable-next-line import/no-unassigned-import -- Monaco registers the installed Python language by side effect.
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';

import { codeLanguages } from '@taucad/types/constants';
import type * as Monaco from 'monaco-editor';
import type { ActivationResult, LanguageContribution } from '#lib/monaco-language-registry.js';

const build123dAuthoringStubs = [
  ['Shape', 'Base Build123d topology shape'],
  ['Solid', 'Build and inspect solid BRep geometry'],
  ['Compound', 'Group child shapes into an assembly'],
  ['Part', 'Build123d part container'],
  ['Box', 'Create a parametric box'],
  ['Cylinder', 'Create a parametric cylinder'],
  ['Sphere', 'Create a parametric sphere'],
  ['Plane', 'Construction plane and local coordinate system'],
  ['Sketch', 'Two-dimensional sketch geometry'],
  ['BuildPart', 'Context builder for parts'],
  ['BuildSketch', 'Context builder for sketches'],
  ['Location', 'Rigid placement transform'],
  ['Color', 'Shape display color'],
  ['export_step', 'Export retained BRep geometry to STEP'],
] as const;

const createBuild123dCompletionProvider = (monaco: typeof Monaco): Monaco.languages.CompletionItemProvider => ({
  provideCompletionItems(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    if (!/(?:\bfrom\s+build123d\s+import\s+[\w, ]*|\bbuild123d\.[\w]*)$/u.test(line)) {
      return { suggestions: [] };
    }
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    return {
      suggestions: build123dAuthoringStubs.map(([label, documentation]) => ({
        label,
        insertText: label,
        detail: `build123d.${label}`,
        documentation,
        kind:
          label === 'export_step'
            ? monaco.languages.CompletionItemKind.Function
            : monaco.languages.CompletionItemKind.Class,
        range,
      })),
    };
  },
});

/** Monaco's installed Python contribution owns syntax and language configuration. */
export const pythonContribution: LanguageContribution = {
  languageId: codeLanguages.python,
  activationLanguageIds: [codeLanguages.python],
  register: () => undefined,
  activate: ({ monaco }): ActivationResult => ({
    disposables: [
      monaco.languages.registerCompletionItemProvider(codeLanguages.python, createBuild123dCompletionProvider(monaco)),
    ],
  }),
  dispose: () => undefined,
};
