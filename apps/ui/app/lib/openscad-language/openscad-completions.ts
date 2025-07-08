// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { parseOpenScad, stripComments } from '~/lib/openscad-language/openscad-pseudoparser.js';
import { openscadBuiltins } from '~/lib/openscad-language/openscad-builtins.js';
import { openscadLanguageKeywords } from '~/lib/openscad-language/openscad-language.js';
import type { ParsedFunctionoidDef } from '~/lib/openscad-language/openscad-pseudoparser.js';

function makeFunctionoidSuggestion(name: string, mod: ParsedFunctionoidDef, monacoInstance: typeof monaco) {
  const argSnippets: string[] = [];
  const namedArgs: string[] = [];
  let collectingPosArgs = true;
  let i = 0;

  for (const parameter of mod.params ?? []) {
    if (collectingPosArgs) {
      if (parameter.defaultValue === null) {
        argSnippets.push(
          `${parameter.name.replaceAll('$', String.raw`\$`)}=${'${' + ++i + ':' + parameter.name + '}'}`,
        );
        continue;
      } else {
        collectingPosArgs = false;
      }
    }

    namedArgs.push(parameter.name);
  }

  if (namedArgs.length > 0) {
    argSnippets.push(`${'${' + ++i + ':' + namedArgs.join('|') + '=}'}`);
  }

  let insertText = `${name.replaceAll('$', String.raw`\$`)}(${argSnippets.join(', ')})`;
  if (mod.referencesChildren !== null) {
    insertText += mod.referencesChildren ? ' ${' + ++i + ':children}' : ';';
  }

  return {
    label: mod.signature,
    kind: monacoInstance.languages.CompletionItemKind.Function,
    insertText,
    insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  };
}

function createBuiltinCompletions(monacoInstance: typeof monaco) {
  return [
    ...[true, false].map((v) => ({
      label: `${v}`,
      kind: monacoInstance.languages.CompletionItemKind.Value,
      insertText: `${v}`,
      insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    })),
    ...openscadLanguageKeywords.map((v: string) => ({
      label: v,
      kind: monacoInstance.languages.CompletionItemKind.Function,
      insertText: v,
      insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    })),
  ];
}

const keywordSnippets = [
  // eslint-disable-next-line no-template-curly-in-string -- This is a valid template
  'for(${1:variable}=[${2:start}:${3:end}) ${4:body}',
  // eslint-disable-next-line no-template-curly-in-string -- This is a valid template
  'for(${1:variable}=[${2:start}:${3:increment}:${4:end}) ${5:body}',
  // eslint-disable-next-line no-template-curly-in-string -- This is a valid template
  'if (${1:condition}) {\n\t$0\n} else {\n\t\n}',
];

function cleanupVariables(snippet: string) {
  return snippet
    .replaceAll(/\${\d+:([$\w]+)}/g, '$1')
    .replaceAll(/\$\d+/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function mapObject<T, U>(
  object: Record<string, T>,
  mapper: (name: string, value: T) => U,
  filter?: (name: string) => boolean,
): U[] {
  const results: U[] = [];
  for (const [name, value] of Object.entries(object)) {
    if (!filter || filter(name)) {
      results.push(mapper(name, value));
    }
  }

  return results;
}

// Parse built-in functions once
const builtinsDefs = parseOpenScad('<builtins>', openscadBuiltins, false);

export function buildOpenScadCompletionItemProvider(
  monacoInstance: typeof monaco,
): monaco.languages.CompletionItemProvider {
  const builtinCompletions = createBuiltinCompletions(monacoInstance);

  return {
    triggerCharacters: [],
    provideCompletionItems(model, position, context, token) {
      try {
        const { word } = model.getWordUntilPosition(position);
        const offset = model.getOffsetAt(position);
        const text = model.getValue();
        const previous = text.slice(0, Math.max(0, offset));

        // Parse the current document to get user-defined functions, modules, and variables
        const parsed = parseOpenScad('<current>', text, false);

        // Merge built-ins with current document definitions
        const allFunctions = { ...builtinsDefs.functions, ...parsed.functions };
        const allModules = { ...builtinsDefs.modules, ...parsed.modules };
        const allVars = [...(builtinsDefs.vars ?? []), ...(parsed.vars ?? [])];

        const previousWithoutComments = stripComments(previous);
        const statementMatch = /(^|.*?[{});]|>\s*\n)\s*([$\w]*)$/m.exec(previousWithoutComments);

        if (statementMatch) {
          const start = statementMatch[1];
          const suggestions = [
            ...builtinCompletions,
            ...mapObject(
              allModules ?? {},
              (name, mod) => makeFunctionoidSuggestion(name, mod, monacoInstance),
              (name) => name.includes(word),
            ),
            ...allVars
              .filter((name) => name.includes(word))
              .map((name) => ({
                label: name,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                insertText: name.replaceAll('$', String.raw`\$`),
                insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              })),
            ...keywordSnippets.map((snippet) => ({
              label: cleanupVariables(snippet).replaceAll(' body', ''),
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: snippet,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            })),
          ];

          suggestions.sort((a, b) => a.insertText.indexOf(start) - b.insertText.indexOf(start));
          const result: monaco.languages.CompletionList = { suggestions };
          return result;
        }

        // Function completions
        const functionSuggestions = mapObject(
          allFunctions ?? {},
          (name, mod) => makeFunctionoidSuggestion(name, mod, monacoInstance),
          (name) => name.includes(word),
        ) as monaco.languages.CompletionItem[];

        functionSuggestions.sort((a, b) => a.insertText.indexOf(word) - b.insertText.indexOf(word));
        const result: monaco.languages.CompletionList = { suggestions: functionSuggestions };
        return result;
      } catch (error) {
        console.error('OpenSCAD completion error:', error);
        const result: monaco.languages.CompletionList = { suggestions: [] };
        return result;
      }
    },
  };
}
