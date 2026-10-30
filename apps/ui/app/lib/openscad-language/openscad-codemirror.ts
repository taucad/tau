import { definitionProvider } from '#components/code/editor-definition.js';
import { editorCompletionInfo, renderEditorDocumentation } from '#components/code/editor-documentation.js';
import type { Extension } from '@codemirror/state';
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import { hoverTooltip, keymap, showDialog } from '@codemirror/view';
import { URI } from 'vscode-uri';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { workspacePathFromFileUri } from '#lib/editor-workspace-fs/editor-workspace-fs.js';
import { parseOpenScad } from '#lib/openscad-language/openscad-pseudoparser.js';
import type { ParsedFile } from '#lib/openscad-language/openscad-pseudoparser.js';
import { openscadAnglePathToFileUri } from '#lib/openscad-language/openscad-include-uri.js';
import { openscadSymbols, openscadFunctions, openscadConstants } from '#lib/openscad-language/openscad-symbols.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

type Word = Readonly<{ text: string; from: number; to: number }>;
type Definition = Readonly<{ uri: string; line: number; column: number }>;
type CallContext = Readonly<{ name: string; argument: number; used: readonly string[] }>;

function topLevelArguments(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== '\\') {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      continue;
    }
    if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

export function callContext(text: string, offset: number): CallContext | undefined {
  let depth = 0;
  for (let index = offset - 1; index >= 0; index--) {
    const character = text[index];
    if (character === ')') {
      depth += 1;
    }
    if (character !== '(') {
      continue;
    }
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    const name = /([\w$]+)\s*$/.exec(text.slice(0, index))?.[1];
    if (!name) {
      return undefined;
    }
    const argumentsText = text.slice(index + 1, offset);
    const parts = topLevelArguments(argumentsText);
    return {
      name,
      argument: parts.length - 1,
      used: parts.flatMap((part) => /^\s*([\w$]+)\s*=/.exec(part)?.[1] ?? []),
    };
  }
  return undefined;
}

function callSignature(context: CallContext, parsed: ParsedFile): string | undefined {
  const builtIn = [...openscadSymbols, ...openscadFunctions].find((symbol) => symbol.name === context.name);
  if (builtIn) {
    return `${builtIn.name}(${builtIn.parameters?.map((parameter, index) => (index === context.argument ? `[${parameter.name}]` : parameter.name)).join(', ') ?? ''})`;
  }
  return parsed.modules[context.name]?.signature ?? parsed.functions[context.name]?.signature;
}

export function parameterCompletions(context: CallContext, parsed: ParsedFile): Completion[] {
  const builtIn = [...openscadSymbols, ...openscadFunctions].find((symbol) => symbol.name === context.name);
  const names =
    builtIn?.parameters?.map((parameter) => parameter.name) ??
    (parsed.modules[context.name] ?? parsed.functions[context.name])?.params?.map((parameter) => parameter.name) ??
    [];
  return names
    .filter((name) => !context.used.includes(name))
    .map((name) => ({ label: `${name}=`, type: 'property', apply: `${name}=` }));
}

function wordAt(text: string, offset: number): Word | undefined {
  let from = offset;
  let to = offset;
  while (from > 0 && /[\w$]/.test(text[from - 1]!)) {
    from -= 1;
  }
  while (to < text.length && /[\w$]/.test(text[to]!)) {
    to += 1;
  }
  return to > from ? { text: text.slice(from, to), from, to } : undefined;
}

function isCommentAt(text: string, offset: number): boolean {
  const prior = text.slice(0, offset);
  const line = prior.slice(prior.lastIndexOf('\n') + 1);
  if (line.includes('//')) {
    return true;
  }
  return prior.lastIndexOf('/*') > prior.lastIndexOf('*/');
}

function builtInCompletions(): Completion[] {
  const modules = openscadSymbols.map((symbol) => {
    const template = `${symbol.name}(${symbol.parameters?.map((parameter, index) => `\${${index + 1}:${parameter.name}}`).join(', ') ?? ''})`;
    return snippetCompletion(template, {
      label: symbol.name,
      type: 'function',
      detail: 'module',
      info: editorCompletionInfo(symbol.description),
    });
  });
  const functions = openscadFunctions.map((symbol) => {
    const template = `${symbol.name}(${symbol.parameters?.map((parameter, index) => `\${${index + 1}:${parameter.name}}`).join(', ') ?? ''})`;
    return snippetCompletion(template, {
      label: symbol.name,
      type: 'function',
      detail: symbol.returnType,
      info: editorCompletionInfo(symbol.description),
    });
  });
  const constants = openscadConstants.map((symbol) => ({
    label: symbol.name,
    type: 'variable',
    info: editorCompletionInfo(symbol.description),
  }));
  return [...modules, ...functions, ...constants];
}

const builtins = builtInCompletions();

function localCompletions(parsed: ParsedFile): Completion[] {
  return [
    ...Object.values(parsed.modules).map((definition) =>
      snippetCompletion(`${definition.name}()`, { label: definition.name, type: 'function', detail: 'module' }),
    ),
    ...Object.values(parsed.functions).map((definition) =>
      snippetCompletion(`${definition.name}()`, { label: definition.name, type: 'function', detail: 'function' }),
    ),
    ...parsed.vars.map((name) => ({ label: name, type: 'variable' })),
  ];
}

async function importedFiles(
  document: EditorDocument,
  environment: EditorLanguageEnvironment,
): Promise<Array<{ uri: string; text: string; mode: 'use' | 'include' }>> {
  const parsed = parseOpenScad(document.path, document.text, true);
  const imports: Array<{ path: string; mode: 'use' | 'include' }> = [
    ...parsed.uses.map((path): { path: string; mode: 'use' | 'include' } => ({ path, mode: 'use' })),
    ...parsed.includes.map((path): { path: string; mode: 'use' | 'include' } => ({ path, mode: 'include' })),
  ];
  const settled = await Promise.all(
    imports.map(async (entry) => {
      try {
        const uri = openscadAnglePathToFileUri(document.uri, entry.path);
        const path = workspacePathFromFileUri(URI.parse(uri));
        const result = await environment.contentService.resolve(path);
        return result.kind === 'text' ? { uri, text: decodeTextFile(result.content), mode: entry.mode } : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return settled.filter((entry) => entry !== undefined);
}

function declaration(
  text: string,
  name: string,
  kind: 'module' | 'function' | 'variable',
): { line: number; column: number } | undefined {
  const escaped = name.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  const pattern =
    kind === 'variable'
      ? new RegExp(`^\\s*(${escaped})\\s*=`, 'm')
      : new RegExp(`^\\s*${kind}\\s+(${escaped})\\s*\\(`, 'm');
  const match = pattern.exec(text);
  if (!match) {
    return undefined;
  }
  const target = match.index + match[0].indexOf(name);
  const prior = text.slice(0, target);
  return { line: prior.split('\n').length, column: target - prior.lastIndexOf('\n') };
}

export async function definitionFor(
  document: EditorDocument,
  environment: EditorLanguageEnvironment,
  word: string,
): Promise<Definition | undefined> {
  const local = parseOpenScad(document.path, document.text, false);
  for (const kind of ['variable', 'module', 'function'] as const) {
    const exists =
      kind === 'variable'
        ? local.vars.includes(word)
        : kind === 'module'
          ? word in local.modules
          : word in local.functions;
    if (!exists) {
      continue;
    }
    const found = declaration(document.text, word, kind);
    if (found) {
      return { uri: document.uri, ...found };
    }
  }
  for (const imported of await importedFiles(document, environment)) {
    for (const kind of (imported.mode === 'include'
      ? ['variable', 'module', 'function']
      : ['module', 'function']) as Array<'variable' | 'module' | 'function'>) {
      const parsed = parseOpenScad(imported.uri, imported.text, true);
      const exists =
        kind === 'variable'
          ? parsed.vars.includes(word)
          : kind === 'module'
            ? word in parsed.modules
            : word in parsed.functions;
      if (exists) {
        const found = declaration(imported.text, word, kind);
        if (found) {
          return { uri: imported.uri, ...found };
        }
      }
    }
  }
  return undefined;
}

type HoverContent = Readonly<{ text: string; literal: boolean }>;

export function hoverTextFor(text: string, path: string, word: Word): HoverContent | undefined {
  const line = text.slice(text.lastIndexOf('\n', word.from - 1) + 1).split('\n', 1)[0] ?? '';
  const group = /\/\*\s*\[([^\]]+)]\s*\*\//.exec(line)?.[1];
  if (isCommentAt(text, word.from) && (!group || group !== word.text)) {
    return undefined;
  }
  const symbol = [...openscadSymbols, ...openscadFunctions, ...openscadConstants].find(
    (candidate) => candidate.name === word.text,
  );
  const parsed = parseOpenScad(path, text, false);
  const local = parsed.modules[word.text] ?? parsed.functions[word.text];
  if (group) {
    return { text: `Group — ${group}`, literal: true };
  }
  if (symbol?.description !== undefined) {
    return { text: symbol.description, literal: false };
  }
  return local ? { text: local.signature, literal: true } : undefined;
}

export async function importedHoverTextFor(
  document: EditorDocument,
  environment: EditorLanguageEnvironment,
  word: string,
): Promise<HoverContent | undefined> {
  for (const imported of await importedFiles(document, environment)) {
    const parsed = parseOpenScad(imported.uri, imported.text, true);
    const declaration = parsed.modules[word] ?? parsed.functions[word];
    if (declaration) {
      return { text: declaration.signature, literal: true };
    }
    if (imported.mode === 'include' && parsed.vars.includes(word)) {
      return { text: `Variable ${word}`, literal: true };
    }
  }
  return undefined;
}

export async function acquireOpenScadLanguage({
  document,
  environment,
  signal,
}: Readonly<{
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  signal: AbortSignal;
}>): Promise<{ extensions: Extension[]; dispose(): void }> {
  signal.throwIfAborted();
  let disposed = false;
  const dispose = (): void => {
    disposed = true;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  const extensions: Extension[] = [
    autocompletion({
      override: [
        async (context) => {
          if (disposed || isCommentAt(document.text, context.pos)) {
            return null;
          }
          const word = wordAt(document.text, context.pos);
          if (!word && !context.explicit) {
            return null;
          }
          const { version } = document;
          const parsed = parseOpenScad(document.path, document.text, false);
          const call = callContext(document.text, context.pos);
          const imports = await importedFiles(document, environment);
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- lease may be aborted during imported-file reads.
          if (disposed || document.version !== version) {
            return null;
          }
          const imported = imports.flatMap((file) => {
            const found = parseOpenScad(file.uri, file.text, true);
            return localCompletions(file.mode === 'use' ? { ...found, vars: [] } : found);
          });
          return {
            from: word?.from ?? context.pos,
            options: [
              ...(call ? parameterCompletions(call, parsed) : []),
              ...builtins,
              ...localCompletions(parsed),
              ...imported,
            ],
          };
        },
      ],
    }),
    hoverTooltip(async (_view, pos) => {
      const word = wordAt(document.text, pos);
      if (!word || disposed) {
        return null;
      }
      const { version } = document;
      const content =
        hoverTextFor(document.text, document.path, word) ??
        (await importedHoverTextFor(document, environment, word.text));
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the lease may dispose while the import hover awaits.
      if (disposed || document.version !== version) {
        return null;
      }
      if (!content) {
        return null;
      }
      return {
        pos: word.from,
        end: word.to,
        create() {
          const dom = renderEditorDocumentation(content.literal ? '' : content.text);
          if (content.literal) {
            const signature = dom.ownerDocument.createElement('pre');
            signature.textContent = content.text;
            dom.append(signature);
          }
          return { dom };
        },
      };
    }),
    keymap.of([
      {
        key: 'Ctrl-Shift-Space',
        run(view) {
          const context = callContext(document.text, view.state.selection.main.head);
          const signature = context && callSignature(context, parseOpenScad(document.path, document.text, false));
          if (!signature) {
            return false;
          }
          showDialog(view, { label: signature, submitLabel: 'Close' });
          return true;
        },
      },
    ]),
    definitionProvider.of(async (_view, position) => {
      const word = wordAt(document.text, position);
      if (!word || disposed) {
        return;
      }
      const { version } = document;
      const target = await definitionFor(document, environment, word.text);
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- lease may be aborted during definition lookup.
      if (target && !disposed && document.version === version) {
        await environment.navigate(target);
      }
    }),
  ];
  return { extensions, dispose };
}
