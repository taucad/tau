import { StreamLanguage } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { HighlighterCore, LanguageInput } from 'shiki/core';

const grammarLoaders = {
  kcl: async () => import('@taucad/grammars/kcl'),
  openscad: async () => import('@taucad/grammars/openscad'),
  stepfile: async () => import('@taucad/grammars/stepfile'),
  stl: async () => import('@taucad/grammars/stl'),
  usd: async () => import('@taucad/grammars/usd'),
  sysml: async () => import('@taucad/grammars/sysml'),
  jsonc: async () => import('@shikijs/langs-precompiled/jsonc'),
  jsonl: async () => import('@shikijs/langs-precompiled/jsonl'),
};

type GrammarLanguage = keyof typeof grammarLoaders;
type Token = Readonly<{ end: number; style: string | undefined }>;
type Grammar = ReturnType<HighlighterCore['getLanguage']>;
type LineState = {
  grammar: Parameters<Grammar['tokenizeLine']>[1];
  tokens: readonly Token[];
  index: number;
  braceDepth: number;
};

const categories: ReadonlyArray<[RegExp, string]> = [
  [/^comment/u, 'comment'],
  [/^string/u, 'string'],
  [/^constant.numeric/u, 'number'],
  [/^constant.language/u, 'atom'],
  [/^(keyword|storage)/u, 'keyword'],
  [/^(entity.name.function|support.function)/u, 'variableName.function'],
  [/^(entity.name.type|support.type)/u, 'typeName'],
  [/^(variable|entity.name)/u, 'variableName'],
  [/^(support.constant|constant)/u, 'atom'],
  [/^punctuation/u, 'punctuation'],
];

const scopeStyle = (scopes: readonly string[]): string | undefined => {
  for (const scope of scopes.toReversed()) {
    const category = categories.find(([pattern]) => pattern.test(scope));
    if (category) {
      return category[1];
    }
  }
  return undefined;
};

/** Adapt the canonical grammar one line at a time, retaining its immutable multiline state. */
export const createTextMateParser = (highlighter: HighlighterCore, languageId: string): StreamParser<LineState> => {
  const grammar = highlighter.getLanguage(languageId);
  const tokenize = (line: string, state: LineState): void => {
    // One scope pass avoids mismatched timeouts in separate color/scope passes.
    const result = grammar.tokenizeLine(line, state.grammar, 10);
    state.grammar = result.ruleStack;
    if (languageId === 'sysml') {
      for (const token of result.tokens) {
        const style = scopeStyle(token.scopes);
        if (style === 'string' || style === 'comment') {
          continue;
        }
        for (const character of line.slice(token.startIndex, token.endIndex)) {
          if (character === '{') {
            state.braceDepth += 1;
          }
          if (character === '}') {
            state.braceDepth = Math.max(0, state.braceDepth - 1);
          }
        }
      }
    }
    state.tokens = result.tokens.map((token) => ({
      end: Math.min(line.length, token.endIndex),
      style: scopeStyle(token.scopes),
    }));
    state.index = 0;
  };
  return {
    name: languageId,
    startState: () => ({ grammar: null, tokens: [], index: 0, braceDepth: 0 }),
    indent:
      languageId === 'sysml'
        ? (state, textAfter, context) =>
            Math.max(0, state.braceDepth - (textAfter.trimStart().startsWith('}') ? 1 : 0)) * context.unit
        : undefined,
    copyState: (state) => ({ ...state }),
    blankLine: (state) => {
      tokenize('', state);
    },
    token: (stream, state) => {
      if (stream.sol()) {
        tokenize(stream.string, state);
      }
      while (state.tokens[state.index] && state.tokens[state.index]!.end <= stream.pos) {
        state.index++;
      }
      const token = state.tokens[state.index];
      if (!token) {
        stream.skipToEnd();
        return null;
      }
      stream.pos = token.end;
      state.index++;
      return token.style ?? null;
    },
    languageData: languageCommands(languageId),
  };
};

type LanguageCommands = {
  commentTokens?: { line?: string; block?: { open: string; close: string } };
  closeBrackets: { brackets: string[] };
  indentOnInput?: RegExp;
};

function languageCommands(languageId: string): LanguageCommands {
  const block = { open: '/*', close: '*/' };
  const brackets = ['(', '[', '{', "'", '"'];
  switch (languageId) {
    case 'stl': {
      return { closeBrackets: { brackets: [] } };
    }
    case 'jsonl': {
      return { closeBrackets: { brackets: ['{', '[', '"'] } };
    }
    case 'jsonc': {
      return { commentTokens: { line: '//', block }, closeBrackets: { brackets: ['{', '[', '"'] } };
    }
    case 'stepfile': {
      return { commentTokens: { block }, closeBrackets: { brackets: ['(', '[', '{', "'"] } };
    }
    case 'usd': {
      return { commentTokens: { line: '#', block }, closeBrackets: { brackets: [...brackets, '@', '<'] } };
    }
    case 'sysml': {
      return { commentTokens: { line: '//', block }, closeBrackets: { brackets }, indentOnInput: /^\s*\}/u };
    }
    default: {
      return { commentTokens: { line: '//', block }, closeBrackets: { brackets } };
    }
  }
}

/** Shared immutable grammar tables; each document keeps its own incremental parser state. */
const languages = new Map<GrammarLanguage, Promise<StreamLanguage<LineState>>>();
export const loadTextMateSyntax = async (languageId: GrammarLanguage): Promise<StreamLanguage<LineState>> => {
  const existing = languages.get(languageId);
  if (existing) {
    return existing;
  }
  const loading = (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRawEngine }, grammar] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      grammarLoaders[languageId](),
    ]);
    const highlighter = await createHighlighterCore({
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Precompiled raw-engine grammars carry RegExp patterns; Shiki types only describe the serialized TextMate form.
      langs: [grammar.default as unknown as LanguageInput],
      themes: [],
      engine: createJavaScriptRawEngine(),
    });
    return StreamLanguage.define(createTextMateParser(highlighter, languageId));
  })();
  languages.set(languageId, loading);
  try {
    return await loading;
  } catch (error) {
    languages.delete(languageId);
    throw error;
  }
};
