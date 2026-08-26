/**
 * Validates JSDoc fenced codeblock formatting and compiles `@public` TypeScript
 * codeblocks via tsgolint (typescript-go) inline. Diagnostics flow through
 * oxlint's native pipeline so they appear in the IDE.
 *
 * Checks performed:
 * - Requires all fenced codeblocks to specify a language tag
 * - Enforces full language names (`typescript` over `ts`, `javascript` over `js`)
 * - Rejects duplicate same-kind imports from one module
 * - Type-checks `typescript` codeblocks in `@public` JSDoc via tsgolint
 *
 * Note: tsgolint utilities are inlined here rather than imported from a shared
 * module because oxlint's JS plugin runtime cannot resolve secondary imports
 * beyond the rule files referenced by the plugin entry point.
 *
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {{ kind: number; range?: { pos: number; end: number }; message: { id: string; description: string }; file_path?: string; rule?: string }} TsgolintDiagnostic
 * @typedef {{ virtualPath: string; strippedCode: string; codeStartIndex: number; mapToRaw: (offset: number) => number }} CodeblockEntry
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

// oxlint-disable-next-line unicorn-js/better-regex -- named capture groups should not be reordered
const CODEBLOCK_REGEX = /(?<openingFence>```(?<lang>[a-zA-Z]*)\n)(?<code>[\s\S]*?)```/g;
const TS_LANGS = new Set(['ts', 'typescript']);
const PUBLIC_TAG_REGEX = /@public(?:\s|$|\*)/;
/** @type {Record<string, { full: string; messageId: string }>} */
const SHORTHAND_LANGS = {
  ts: { full: 'typescript', messageId: 'preferTypescriptTag' },
  js: { full: 'javascript', messageId: 'preferJavascriptTag' },
};
const SYNTAX_LINT_RULES = {
  'import/no-duplicates': ['error', { 'prefer-inline': false }],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
  ],
  'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
  'import/first': 'error',
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  curly: ['error', 'all'],
  eqeqeq: 'error',
  '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true, ignoreRestArgs: true }],
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
  ],
  'unicorn/prefer-node-protocol': 'error',
};
const TYPE_AWARE_LINT_RULES = [
  {
    name: 'no-floating-promises',
    options: { checkThenables: true, ignoreVoid: true, ignoreIIFE: true },
  },
  {
    name: 'no-misused-promises',
    options: { checksConditionals: true, checksVoidReturn: false },
  },
  {
    name: 'only-throw-error',
    options: { allowThrowingUnknown: true, allowThrowingAny: false },
  },
  { name: 'no-deprecated' },
];

// ---------------------------------------------------------------------------
// Star-prefix stripping
// ---------------------------------------------------------------------------

/**
 * @param {string} rawCode
 */
function stripStarPrefixes(rawCode) {
  const lines = rawCode.split('\n');
  /** @type {string[]} */
  const strippedLines = [];
  /** @type {number[]} */
  const prefixLengths = [];

  for (const line of lines) {
    const starMatch = /^(\s*\*\s?)/.exec(line);
    const prefixLength = starMatch ? starMatch[1].length : 0;
    prefixLengths.push(prefixLength);
    strippedLines.push(line.slice(prefixLength));
  }

  return {
    code: strippedLines.join('\n'),
    /**
     * @param {number} strippedOffset
     * @returns {number}
     */
    mapToRaw(strippedOffset) {
      let pos = 0;
      for (let index = 0; index < strippedLines.length; index++) {
        const lineLength = strippedLines[index].length;
        if (pos + lineLength >= strippedOffset || index === strippedLines.length - 1) {
          const col = strippedOffset - pos;
          let rawPos = 0;
          for (let j = 0; j < index; j++) {
            rawPos += prefixLengths[j] + strippedLines[j].length + 1;
          }
          rawPos += prefixLengths[index] + col;
          return rawPos;
        }
        pos += lineLength + 1;
      }
      return strippedOffset;
    },
  };
}

// ---------------------------------------------------------------------------
// tsgolint integration (inlined — see file header for rationale)
// ---------------------------------------------------------------------------

/** @type {string | undefined} */
let cachedTsgolintBinary;
let tsgolintResolved = false;
/** @type {{ linter: import('eslint').Linter; config: import('eslint').Linter.Config[] } | undefined} */
let cachedSyntaxLinter;

function resolveTsgolintBinary() {
  if (tsgolintResolved) {
    return cachedTsgolintBinary;
  }
  tsgolintResolved = true;

  const workspaceRoot = process.env.NX_WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, '..', '..', '..', '..');
  const rootRequire = createRequire(path.join(workspaceRoot, 'node_modules', '_placeholder.js'));
  try {
    const wrapperPath = rootRequire.resolve('oxlint-tsgolint/bin/tsgolint.js');
    const wrapperRequire = createRequire(wrapperPath);
    const suffix = process.platform === 'win32' ? '.exe' : '';
    cachedTsgolintBinary = wrapperRequire.resolve(
      `@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${suffix}`,
    );
  } catch {
    cachedTsgolintBinary = undefined;
  }
  return cachedTsgolintBinary;
}

/**
 * @param {Buffer} buffer
 * @returns {TsgolintDiagnostic[]}
 */
function parseDiagnostics(buffer) {
  /** @type {TsgolintDiagnostic[]} */
  const diagnostics = [];
  let offset = 0;

  while (offset + 5 <= buffer.length) {
    const payloadSize = buffer.readUInt32LE(offset);
    const messageType = buffer[offset + 4];
    offset += 5;

    if (offset + payloadSize > buffer.length) {
      break;
    }

    const payload = buffer.subarray(offset, offset + payloadSize).toString('utf8');
    offset += payloadSize;

    if (messageType === 1) {
      try {
        diagnostics.push(JSON.parse(payload));
      } catch {
        // Malformed payload -- skip silently
      }
    }
  }

  return diagnostics;
}

/**
 * @param {string} binary
 * @param {CodeblockEntry[]} blocks
 * @returns {TsgolintDiagnostic[]}
 */
function runTsgolint(binary, blocks) {
  /** @type {Record<string, string>} */
  const sourceOverrides = {};
  const filePaths = [];

  for (const block of blocks) {
    sourceOverrides[block.virtualPath] = block.strippedCode;
    filePaths.push(block.virtualPath);
  }

  const result = spawnSync(binary, ['headless'], {
    input: JSON.stringify({
      version: 2,
      configs: [{ file_paths: filePaths, rules: TYPE_AWARE_LINT_RULES }],
      source_overrides: sourceOverrides,
      report_syntactic: true,
      report_semantic: true,
    }),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    return [];
  }

  if (!result.stdout || result.stdout.length === 0) {
    return [];
  }

  return parseDiagnostics(result.stdout);
}

/**
 * @returns {{ linter: import('eslint').Linter; config: import('eslint').Linter.Config[] }}
 */
function getSyntaxLinter() {
  if (!cachedSyntaxLinter) {
    const require = createRequire(import.meta.url);
    const { Linter } = require('eslint');
    const tseslint = require('typescript-eslint');
    const importPlugin = require('eslint-plugin-import-x').default;
    const unicornPlugin = require('eslint-plugin-unicorn').default;

    cachedSyntaxLinter = {
      linter: new Linter(),
      config: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tseslint.parser,
            sourceType: 'module',
          },
          plugins: {
            '@typescript-eslint': tseslint.plugin,
            import: importPlugin,
            unicorn: unicornPlugin,
          },
          rules: SYNTAX_LINT_RULES,
        },
      ],
    };
  }
  return cachedSyntaxLinter;
}

/**
 * @param {string} code
 * @param {number} line
 * @param {number} column
 */
function lineColumnToOffset(code, line, column) {
  const lines = code.split('\n');
  let offset = 0;
  for (let index = 0; index < line - 1; index++) {
    offset += lines[index].length + 1;
  }
  return offset + column - 1;
}

/**
 * @param {import('eslint').Linter.LintMessage} message
 * @param {string} code
 */
function formatSyntaxLintMessage(message, code) {
  if (message.ruleId !== 'import/no-duplicates' || !message.endLine || !message.endColumn) {
    return message.message;
  }

  const start = lineColumnToOffset(code, message.line, message.column);
  const end = lineColumnToOffset(code, message.endLine, message.endColumn);
  return `${code.slice(start, end)} imported multiple times.`;
}

/**
 * @param {RuleContext} context
 * @param {CodeblockEntry[]} codeblocks
 */
function lintCodeblocks(context, codeblocks) {
  const { linter, config } = getSyntaxLinter();

  for (const block of codeblocks) {
    const messages = linter.verify(block.strippedCode, config, { filename: block.virtualPath });
    for (const message of messages) {
      if (!message.ruleId) {
        continue;
      }

      const strippedStart = lineColumnToOffset(block.strippedCode, message.line, message.column);
      const strippedEnd =
        message.endLine && message.endColumn
          ? lineColumnToOffset(block.strippedCode, message.endLine, message.endColumn)
          : strippedStart;

      context.report({
        loc: {
          start: context.sourceCode.getLocFromIndex(block.codeStartIndex + block.mapToRaw(strippedStart)),
          end: context.sourceCode.getLocFromIndex(block.codeStartIndex + block.mapToRaw(strippedEnd)),
        },
        messageId: 'invalidCodeblock',
        data: {
          errorMessage: `${message.ruleId}: ${formatSyntaxLintMessage(message, block.strippedCode)}`,
        },
      });
    }
  }
}

/**
 * Run tsgolint on extracted codeblocks and report diagnostics via context.report().
 *
 * @param {RuleContext} context
 * @param {CodeblockEntry[]} codeblocks
 */
function typecheckCodeblocks(context, codeblocks) {
  const binary = resolveTsgolintBinary();
  if (!binary) {
    return;
  }

  const diagnostics = runTsgolint(binary, codeblocks);
  /** @type {Map<string, CodeblockEntry>} */
  const blockMap = new Map(codeblocks.map((block) => [block.virtualPath, block]));

  for (const diagnostic of diagnostics) {
    if ((diagnostic.kind !== 0 && diagnostic.kind !== 1) || !diagnostic.file_path) {
      continue;
    }

    const block = blockMap.get(diagnostic.file_path);
    if (!block) {
      continue;
    }

    const strippedPos = diagnostic.range?.pos ?? 0;
    const strippedEnd = diagnostic.range?.end ?? strippedPos;
    const rawStart = block.mapToRaw(strippedPos);
    const rawEnd = block.mapToRaw(strippedEnd);

    context.report({
      loc: {
        start: context.sourceCode.getLocFromIndex(block.codeStartIndex + rawStart),
        end: context.sourceCode.getLocFromIndex(block.codeStartIndex + rawEnd),
      },
      messageId: 'invalidCodeblock',
      data: {
        errorMessage: `${diagnostic.rule ?? diagnostic.message.id}: ${diagnostic.message.description}`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// @example <caption> enforcement
// ---------------------------------------------------------------------------

const CAPTION_REGEX = /^<caption>.*<\/caption>$/;
const EMPTY_CAPTION = '<caption></caption>';

/**
 * Validate @example caption usage per JSDoc spec (https://jsdoc.app/tags-example):
 * - Every @example must have a <caption>...</caption> on the same line
 * - Bare text (not wrapped in <caption>) → auto-fix wraps it
 * - No trailing text at all → auto-fix inserts empty <caption></caption>
 *
 * @param {RuleContext} context
 * @param {{ range: [number, number]; value: string }} comment
 */
function checkExampleCaptions(context, comment) {
  const commentStart = Number(comment.range[0]) + 2;
  const lines = String(comment.value).split('\n');
  let lineOffset = 0;

  for (const line of lines) {
    const lineString = String(line);
    const stripped = lineString.replace(/^\s*\*\s?/, '');

    // oxlint-disable-next-line unicorn-js/better-regex -- character class order is intentional
    const exampleMatch = /^@example([\t ]+\S.*)?$/.exec(stripped);

    if (exampleMatch) {
      const trailing = exampleMatch[1]?.trim() ?? '';
      const exampleIndex = lineString.indexOf('@example');
      const absStart = commentStart + lineOffset + exampleIndex;
      const absEnd = commentStart + lineOffset + lineString.length;

      if (trailing && !CAPTION_REGEX.test(trailing)) {
        reportBareTextOnExample(context, { absStart, absEnd, bareText: trailing });
      } else if (!trailing) {
        reportMissingCaption(context, absStart);
      } else if (trailing === EMPTY_CAPTION) {
        reportEmptyCaption(context, absStart, absEnd);
      } else if (/example/i.test(trailing.replaceAll(/<\/?caption>/g, ''))) {
        reportRedundantExampleWord(context, absStart, absEnd);
      }
    }

    lineOffset += lineString.length + 1;
  }
}

/**
 * @param {RuleContext} context
 * @param {{ absStart: number; absEnd: number; bareText: string }} options
 */
function reportBareTextOnExample(context, options) {
  const { absStart, absEnd, bareText } = options;
  context.report({
    loc: {
      start: context.sourceCode.getLocFromIndex(absStart),
      end: context.sourceCode.getLocFromIndex(absEnd),
    },
    messageId: 'exampleBareText',
    fix(fixer) {
      return fixer.replaceTextRange([absStart, absEnd], `@example <caption>${bareText}</caption>`);
    },
  });
}

/**
 * @param {RuleContext} context
 * @param {number} absStart
 */
function reportMissingCaption(context, absStart) {
  const tagEnd = absStart + '@example'.length;
  context.report({
    loc: {
      start: context.sourceCode.getLocFromIndex(absStart),
      end: context.sourceCode.getLocFromIndex(tagEnd),
    },
    messageId: 'exampleMissingCaption',
  });
}

/**
 * @param {RuleContext} context
 * @param {number} absStart
 * @param {number} absEnd
 */
function reportEmptyCaption(context, absStart, absEnd) {
  context.report({
    loc: {
      start: context.sourceCode.getLocFromIndex(absStart),
      end: context.sourceCode.getLocFromIndex(absEnd),
    },
    messageId: 'exampleEmptyCaption',
  });
}

/**
 * @param {RuleContext} context
 * @param {number} absStart
 * @param {number} absEnd
 */
function reportRedundantExampleWord(context, absStart, absEnd) {
  context.report({
    loc: {
      start: context.sourceCode.getLocFromIndex(absStart),
      end: context.sourceCode.getLocFromIndex(absEnd),
    },
    messageId: 'exampleRedundantWord',
  });
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

/** @type {RuleModule} */
export const validateJsdocCodeblocksRule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Validates JSDoc codeblock formatting, imports, and @public TypeScript examples via tsgolint',
    },
    messages: {
      invalidCodeblock: '{{errorMessage}}',
      missingLanguageTag: 'JSDoc fenced codeblock must specify a language tag (e.g., typescript, json, text)',
      preferTypescriptTag: 'Use ```typescript instead of ```ts for JSDoc fenced codeblocks',
      preferJavascriptTag: 'Use ```javascript instead of ```js for JSDoc fenced codeblocks',
      exampleBareText:
        'Wrap @example description in <caption></caption> tags per JSDoc spec (https://jsdoc.app/tags-example)',
      exampleMissingCaption:
        'Every @example tag must include a <caption>description</caption> per JSDoc spec (https://jsdoc.app/tags-example)',
      exampleEmptyCaption:
        'Empty <caption></caption> — describe the use-case (e.g., "Browser setup", "Custom WASM build", "With middleware")',
      exampleRedundantWord:
        'Avoid the word "example" in <caption> — it is redundant with the @example tag. Describe the use-case instead (e.g., "Browser setup", "Custom WASM build")',
    },
  },
  create(context) {
    return {
      Program() {
        /** @type {CodeblockEntry[]} */
        const codeblocks = [];

        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== 'Block' || !comment.value.startsWith('*')) {
            continue;
          }

          checkExampleCaptions(context, comment);

          const isPublic = PUBLIC_TAG_REGEX.test(comment.value);

          for (const match of comment.value.matchAll(CODEBLOCK_REGEX)) {
            const { code: rawCode, openingFence, lang } = match.groups ?? {};

            if (!openingFence) {
              continue;
            }

            if (!lang) {
              const fenceIndex = comment.range[0] + match.index + 2;
              context.report({
                loc: {
                  start: context.sourceCode.getLocFromIndex(fenceIndex),
                  end: context.sourceCode.getLocFromIndex(fenceIndex + openingFence.length),
                },
                messageId: 'missingLanguageTag',
              });
              continue;
            }

            if (lang in SHORTHAND_LANGS) {
              const { full, messageId } = SHORTHAND_LANGS[lang];
              const langStart = comment.range[0] + 2 + match.index + 3;
              const langEnd = langStart + lang.length;
              context.report({
                loc: {
                  start: context.sourceCode.getLocFromIndex(langStart),
                  end: context.sourceCode.getLocFromIndex(langEnd),
                },
                messageId,
                fix(fixer) {
                  return fixer.replaceTextRange([langStart, langEnd], full);
                },
              });
            }

            if (!isPublic || !TS_LANGS.has(lang) || !rawCode?.trim()) {
              continue;
            }

            const matchOffset = match.index + openingFence.length + 2;
            const codeStartIndex = comment.range[0] + matchOffset;
            const { code, mapToRaw } = stripStarPrefixes(rawCode);

            if (!code.trim()) {
              continue;
            }

            const sourceFilename = path.isAbsolute(context.filename)
              ? context.filename
              : path.resolve(context.cwd ?? process.cwd(), context.filename.replaceAll(/[<>]/g, '_'));
            const basename = path.basename(sourceFilename, path.extname(sourceFilename));
            const directory = path.dirname(sourceFilename);
            const virtualPath = path.join(directory, `__jsdoc_${basename}_${codeblocks.length}.ts`);

            codeblocks.push({ virtualPath, strippedCode: code, codeStartIndex, mapToRaw });
          }
        }

        if (codeblocks.length > 0) {
          lintCodeblocks(context, codeblocks);
          typecheckCodeblocks(context, codeblocks);
        }
      },
    };
  },
};
