/**
 * Validate a flake fix: reject the transformations that make a flaky test pass without fixing it, and classify the
 * rest so the fixing agent knows whether it may enable auto-merge (Brain research/ci-flake-quarantine-blueprint.md,
 * D7 "What a fix may not do", FQ-14, O4).
 *
 * Every changed path is classed first (the path guard):
 * - protected: a `quarantine.json`, the flake ledger and its jobs, the outcome reporter, the repro, burn-in and
 *   timing-budget jobs, the validators, `.github/` (workflows, actions, CODEOWNERS), policy and agent instructions. Agents do not mark their own work (invariant 5), so touching one is
 *   forbidden.
 * - test: a test file, or a file under a test, fixture or e2e directory. The rules below run on its code.
 * - snapshot: a changed or deleted stored snapshot or screenshot. Loosens an expectation; needs a review.
 * - config: a Vitest, Vite or Playwright config. Product-grade change; the retry and timeout rule runs on it.
 * - product: everything else.
 *
 * The rules compare each test file's code before and after, lexically (comments and string contents never match).
 * Counts compare per declaration path (`suite:A > test:works`) as well as in total, so a loss in one test is not
 * hidden by a gain in another. Values (timeouts, wait bounds, retries, `toBeCloseTo` digits) pair by structural
 * identity (the declaration path plus the callee, receiver or key and its first argument) before they compare; an
 * identity whose count differs between the sides fails closed (see `raised`):
 * - forbidden: an added skip, `only`, `todo`, `fails`, `skipIf` or `runIf` (and `xit`/`fit`, `{ skip: true }`,
 *   `ctx.skip()`, a `skip`/`only`/`todo`/`fails` key in a declaration's options); fewer test declarations, a deleted
 *   test file or one renamed to a path the runner does not collect; fewer assertions; an added assertion on a
 *   literal (`expect(true)`); a raised `retry` (an unevaluable new value counts); a raised test, hook or Playwright
 *   project timeout, each test compared with itself, without a `Timeout-budget:` line naming the measured p99 as a
 *   duration (`Timeout-budget: p99 21.4 s over 300 runs`, or `… 1200 ms (p99)`) in the pull-request body or a commit
 *   message; an added fixed sleep (`sleep`, `delay`, `setTimeout`, `waitForTimeout`, `wait(<n>)`).
 * - tolerance: a raised test timeout that carries its `Timeout-budget:` line; a raised bound on an existing
 *   condition wait (an added wait does not hide it); a raised timeout constant; a raised tolerance, epsilon or
 *   threshold; fewer digits on an existing `toBeCloseTo`; an added `setTimeout` inside a declaration that installs
 *   and advances a fake clock (whether the clock still governs it needs flow analysis, so it fails closed to
 *   review); strict matchers traded for loose ones (`toBe` for `toBeTruthy`, `toBeGreaterThan`, …).
 *
 * The classification is the most severe finding: forbidden, then tolerance, then product, else test-only. Only
 * test-only earns the `flake:test-only` label (the agent may auto-merge with its stress proof); every other class
 * earns `flake:needs-operator`. Only forbidden fails the check.
 *
 * Node built-ins only, so the workflow runs it without installing the workspace.
 *
 * Usage: node scripts/src/validate-flake-fix.ts --base <rev> --head <rev> [--message-file <path>]
 *   Diffs <head> against its merge base with <base>. `--message-file` holds the pull-request body; the commit
 *   messages between the merge base and <head> are read too. With `GITHUB_OUTPUT` set it writes `classification`
 *   and `label`; with `GITHUB_STEP_SUMMARY` set it appends a summary table.
 * Exit codes: 0 not forbidden; 1 forbidden; 2 usage or git error.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export type Classification = 'test-only' | 'product' | 'tolerance' | 'forbidden';
export type Severity = Exclude<Classification, 'test-only'>;
export type PathKind = 'protected' | 'test' | 'snapshot' | 'config' | 'product';

/** One changed path. `before` is absent for an added file, `after` for a deleted one. */
export type Change = {
  readonly path: string;
  readonly previousPath?: string;
  readonly before?: string;
  readonly after?: string;
};

export type Finding = {
  readonly rule: string;
  readonly severity: Severity;
  readonly path: string;
  readonly message: string;
};

export type Verdict = {
  readonly classification: Classification;
  readonly label: 'flake:test-only' | 'flake:needs-operator';
  readonly findings: readonly Finding[];
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly kind: PathKind;
  }>;
};

// --- Path guard ------------------------------------------------------------------------------------------------

/**
 * Paths a flake fix may not touch: the quarantine and the ledger, the jobs and validators that decide them, the
 * workflows and actions, and the policy and instructions agents work under. FQ-1's outcome reporter is
 * `@taucad/vitest-ci` under `tools/vitest-ci/`; the burn-in and timing-budget jobs decide what quarantines and what
 * a timeout may be raised to.
 */
const protectedPaths: readonly RegExp[] = [
  /quarantine/iu,
  /flake-(?:ledger|repro|fix)/iu,
  /^scripts\/src\/(?:ci-queue-health|validate-)/u,
  /outcomes?-reporter|test-outcomes/u,
  /^tools\/vitest-ci\//u,
  /(?:^|\/)burn-in/iu,
  /(?:^|\/)timing-budget/iu,
  /^\.github\//u,
  /^docs\/policy\//u,
  /^\.agents\//u,
  /^\.claude\//u,
  /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/u,
];

const configPath = /(?:^|\/)(?:vitest|vite|playwright)(?:\.[\w-]+)*\.(?:config|workspace)\.[cm]?[jt]s$/u;
const snapshotPath = /(?:^|\/)__(?:snapshots|screenshots)__\/|\.snap$/u;
const testFile = /(?:^|\/)[^/]+\.(?:test|spec|e2e|bench)\.[cm]?[jt]sx?$/u;
const testDirectory =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|fixtures|test|tests|testing|test-utils|e2e|spec)\/|^apps\/[^/]+-e2e\//u;
const codePath = /\.[cm]?[jt]sx?$/u;

export const pathKind = (path: string): PathKind => {
  if (protectedPaths.some((pattern) => pattern.test(path))) {
    return 'protected';
  }
  if (configPath.test(path)) {
    return 'config';
  }
  if (snapshotPath.test(path)) {
    return 'snapshot';
  }
  return testFile.test(path) || testDirectory.test(path) ? 'test' : 'product';
};

// --- Lexer -----------------------------------------------------------------------------------------------------

export type Token = {
  readonly type: 'ident' | 'number' | 'string' | 'regex' | 'punct';
  readonly value: string;
};

const punctuators = [
  '...',
  '===',
  '!==',
  '>>>',
  '**=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '**',
];

/**
 * Reserved words after which a `/` starts a regular expression rather than a division, unless the word is a property
 * name (`a.return / 2`). `of` is contextual and handled apart.
 */
const regexPrefixWords = new Set([
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'new',
  'delete',
  'void',
  'throw',
  'instanceof',
  'yield',
  'await',
]);

const identifierStart = /[A-Za-z_$#]/u;
const identifierPart = /[\w$]/u;
const numberPattern = /^(?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)n?/u;

/**
 * Tokens of a JavaScript or TypeScript source: identifiers, numbers, punctuators, and string, template and regular
 * expression literals as single tokens, with comments dropped. Template substitutions are tokenised as code.
 * ponytail: a lexer, not a parser. It is exact on the things the rules read (calls, member chains, property values)
 * and approximate on `/` after `}`; a misread there shifts one token, not the comparison.
 */
export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  const braces: Array<'brace' | 'template'> = [];
  let index = 0;

  const readTemplate = (): void => {
    // Called just after a backtick or a substitution's closing brace.
    let text = '';
    while (index < source.length) {
      const char = source[index];
      if (char === '\\') {
        text += source.slice(index, index + 2);
        index += 2;
      } else if (char === '`') {
        index += 1;
        tokens.push({ type: 'string', value: text });
        return;
      } else if (char === '$' && source[index + 1] === '{') {
        index += 2;
        tokens.push({ type: 'string', value: text });
        braces.push('template');
        return;
      } else {
        text += char;
        index += 1;
      }
    }
    tokens.push({ type: 'string', value: text });
  };

  const regexAllowed = (): boolean => {
    const previous = tokens.at(-1);
    if (previous === undefined) {
      return true;
    }
    if (previous.type === 'punct') {
      return ![')', ']', '}'].includes(previous.value);
    }
    if (previous.type !== 'ident') {
      return false;
    }
    const before = tokens.at(-2);
    if (before?.type === 'punct' && (before.value === '.' || before.value === '?.')) {
      return false;
    }
    if (previous.value === 'of') {
      // `of` is a keyword only after a for-of binding (`x of`, `] of`, `} of`); anywhere else it is an identifier.
      return (
        (before?.type === 'ident' && !regexPrefixWords.has(before.value)) ||
        (before?.type === 'punct' && (before.value === ']' || before.value === '}'))
      );
    }
    return regexPrefixWords.has(previous.value);
  };

  const punctuatorAt = (position: number): string =>
    punctuators.find((candidate) => source.startsWith(candidate, position)) ?? source[position]!;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (/\s/u.test(char)) {
      index += 1;
    } else if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < source.length && source[end] !== char && source[end] !== '\n') {
        end += source[end] === '\\' ? 2 : 1;
      }
      tokens.push({ type: 'string', value: source.slice(index + 1, end) });
      index = end + 1;
    } else if (char === '`') {
      index += 1;
      readTemplate();
    } else if (char === '/' && regexAllowed()) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && source[end] !== '\n' && (inClass || source[end] !== '/')) {
        switch (source[end]) {
          case '\\': {
            end += 1;
            break;
          }
          case '[': {
            inClass = true;
            break;
          }
          case ']': {
            inClass = false;
            break;
          }
          default:
        }
        end += 1;
      }
      end += 1;
      while (end < source.length && /[a-z]/u.test(source[end]!)) {
        end += 1;
      }
      tokens.push({ type: 'regex', value: source.slice(index, end) });
      index = end;
    } else if (/\d/u.test(char) || (char === '.' && next !== undefined && /\d/u.test(next))) {
      const match = numberPattern.exec(source.slice(index, index + 64));
      const value = match?.[0] ?? char;
      tokens.push({ type: 'number', value });
      index += value.length;
    } else if (identifierStart.test(char)) {
      let end = index + 1;
      while (end < source.length && identifierPart.test(source[end]!)) {
        end += 1;
      }
      tokens.push({ type: 'ident', value: source.slice(index, end) });
      index = end;
    } else if (char === '{') {
      braces.push('brace');
      tokens.push({ type: 'punct', value: '{' });
      index += 1;
    } else if (char === '}') {
      index += 1;
      if (braces.pop() === 'template') {
        readTemplate();
      } else {
        tokens.push({ type: 'punct', value: '}' });
      }
    } else {
      const value = punctuatorAt(index);
      tokens.push({ type: 'punct', value });
      index += value.length;
    }
  }

  return tokens;
};

// --- Facts -----------------------------------------------------------------------------------------------------

/** A call: its callee as a member chain (`vi.waitFor`, `<call>.toBe` for a call on a call's result) and its arguments. */
export type Call = {
  readonly callee: string;
  readonly args: ReadonlyArray<readonly Token[]>;
  /** For a call on a call's result (`it.each(table)(…)`), the inner call's callee. */
  readonly curriedFrom?: string;
  /** For a member chain on a call's result (`expect(volume).toBeCloseTo`), that call's text (`expect(volume)`). */
  readonly receiver?: string;
  /** The test, suite and hook declarations the call stands in, outermost first. */
  readonly blocks: readonly Block[];
};

/** A test, suite or hook declaration that encloses code: where it opens, and its string name if it has one. */
export type Block = {
  readonly start: number;
  readonly kind: 'suite' | 'test' | 'hook';
  readonly name: string | undefined;
  /** `suite:<name>`, `test:<name>` (`?` for a name that is not a string) or the hook's name. */
  readonly label: string;
};

/**
 * A numeric value bound to a name: `key: value` in an object, or `name = value`. `context` says where. A retry or
 * timeout key is kept whatever its value, so a change to a value the validator cannot evaluate still compares.
 */
export type Binding = {
  readonly key: string;
  readonly text: string;
  readonly value: number | undefined;
  /**
   * The callee the object is a direct argument of, `'<key>[]'` for an object that is an element of an array bound to
   * `<key>` (`projects: [{ … }]`), `''` for any other object, `'='` for an assignment.
   */
  readonly context: string;
  /** For an object argument that is not the first, the call's first argument's text (a wait's condition). */
  readonly firstArgument?: string;
  /** The declarations the binding stands in, as for a call. */
  readonly blocks?: readonly Block[];
  /** The identity the before and after values are paired by, when there is one (a test's name). */
  readonly id?: string;
};

export type Facts = {
  readonly calls: readonly Call[];
  readonly bindings: readonly Binding[];
};

const notCallees = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'typeof',
  'await',
  'yield',
  'in',
  'of',
  'case',
  'throw',
  'else',
  'do',
  'void',
  'delete',
]);

/** The value of a constant numeric expression (`30 * 1_000`, `-1`), or undefined for anything else. */
export const evaluate = (tokens: readonly Token[]): number | undefined => {
  let index = 0;
  const peek = (): string | undefined => tokens[index]?.value;
  const factor = (): number | undefined => {
    const token = tokens[index];
    index += 1;
    if (token?.type === 'number') {
      const text = token.value.replaceAll('_', '').replace(/n$/u, '');
      const radix = /^0[bB]/u.test(text) ? 2 : 8;
      return /^0[bBoO]/u.test(text) ? Number.parseInt(text.slice(2), radix) : Number(text);
    }
    if (token?.value === '-') {
      const value = factor();
      return value === undefined ? undefined : -value;
    }
    if (token?.value === '(') {
      const value = sum();
      index += 1;
      return tokens[index - 1]?.value === ')' ? value : undefined;
    }
    return undefined;
  };
  const product = (): number | undefined => {
    let value = factor();
    while (value !== undefined && (peek() === '*' || peek() === '/')) {
      const operator = peek();
      index += 1;
      const right = factor();
      value = right === undefined ? undefined : operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number | undefined => {
    let value = product();
    while (value !== undefined && (peek() === '+' || peek() === '-')) {
      const operator = peek();
      index += 1;
      const right = product();
      value = right === undefined ? undefined : operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  return index === tokens.length && value !== undefined && Number.isFinite(value) ? value : undefined;
};

type Frame =
  | {
      readonly kind: 'call';
      readonly callee: string;
      readonly curriedFrom: string | undefined;
      readonly receiver: string | undefined;
      readonly blocks: readonly Block[];
      readonly start: number;
      readonly commas: number[];
    }
  | {
      readonly kind: 'object';
      readonly argumentOf: string | undefined;
      readonly elementOf: string | undefined;
      readonly firstArgument: string | undefined;
    }
  | { readonly kind: 'group'; readonly key?: string };

/** Keys kept as bindings even when their value holds no number. */
const alwaysBound = /^(?:retry|retries|timeout|testTimeout|hookTimeout|teardownTimeout)$/u;
/** Type names, so `retry: number` in a type or a parameter is not read as a value. */
const typeNames = new Set(['number', 'string', 'boolean', 'unknown', 'any', 'never', 'object', 'undefined']);

const closers: Readonly<Record<string, string>> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

/** The calls and numeric bindings in a token stream. */
export const facts = (tokens: readonly Token[]): Facts => {
  const calls: Call[] = [];
  const bindings: Binding[] = [];
  const stack: Array<Frame & { readonly open: string }> = [];
  let lastCall: { readonly end: number; readonly callee: string } | undefined;
  /** Each closed call's text, by the index of its closing parenthesis. */
  const callTexts = new Map<number, string>();
  const text = (from: number, to: number): string =>
    tokens
      .slice(from, to)
      .map((token) => (token.type === 'string' ? JSON.stringify(token.value) : token.value))
      .join(' ');

  /** The test, suite and hook declarations open on the stack, outermost first. */
  const blocksOf = (): Block[] =>
    stack.flatMap((frame): Block[] => {
      if (frame.kind !== 'call') {
        return [];
      }
      const base = (frame.curriedFrom ?? frame.callee).split('.')[0]!;
      const declared = focusedOrSkipped.has(base) ? (base.endsWith('describe') ? 'describe' : 'it') : base;
      const kind = suites.has(declared)
        ? 'suite'
        : testFamily.has(declared)
          ? 'test'
          : hooks.has(declared)
            ? 'hook'
            : undefined;
      if (kind === undefined) {
        return [];
      }
      const first = frame.commas.length === 0 ? [] : tokens.slice(frame.start + 1, frame.commas[0]);
      const name = first.length === 1 && first[0]!.type === 'string' ? first[0]!.value : undefined;
      const label = kind === 'hook' ? base : `${kind}:${name ?? '?'}`;
      return [{ start: frame.start, kind, name, label }];
    });

  /** The call whose result a member chain ending before `index` starts from (`expect(volume)` in `expect(volume).toBe(`). */
  const receiverAt = (index: number): string | undefined => {
    let cursor = index - 1;
    while (tokens[cursor]?.type === 'ident' && ['.', '?.'].includes(tokens[cursor - 1]?.value ?? '')) {
      cursor -= 2;
    }
    return cursor < index - 1 ? callTexts.get(cursor) : undefined;
  };

  const calleeAt = (index: number): string | undefined => {
    // `index` is the `(`; read the member chain that ends just before it.
    const previous = tokens[index - 1];
    if (previous?.type === 'punct' && previous.value === ')') {
      return '<call>';
    }
    if (previous?.type !== 'ident' || notCallees.has(previous.value)) {
      return undefined;
    }
    if (tokens[index - 2]?.value === 'function') {
      return undefined;
    }
    const parts = [previous.value];
    let cursor = index - 2;
    while (tokens[cursor]?.type === 'punct' && (tokens[cursor]!.value === '.' || tokens[cursor]!.value === '?.')) {
      const object = tokens[cursor - 1];
      if (object?.type === 'ident') {
        parts.unshift(object.value);
        cursor -= 2;
      } else {
        parts.unshift('<call>');
        break;
      }
    }
    return parts.join('.');
  };

  const valueEnd = (from: number): number => {
    let depth = 0;
    let cursor = from;
    while (cursor < tokens.length) {
      const { type, value } = tokens[cursor]!;
      if (type === 'punct') {
        if (['(', '[', '{'].includes(value)) {
          depth += 1;
        } else if ([')', ']', '}'].includes(value)) {
          if (depth === 0) {
            return cursor;
          }
          depth -= 1;
        } else if (depth === 0 && [',', ';'].includes(value)) {
          return cursor;
        }
      }
      cursor += 1;
    }
    return cursor;
  };

  type Open = Frame & { readonly open: string };

  /** An object literal: which call it is an argument of (and that call's first argument), or which keyed array holds it. */
  const objectFrame = (index: number, top: Open | undefined): Open => {
    const previous = tokens[index - 1]?.value;
    const isArgument = top?.kind === 'call' && (previous === '(' || previous === ',');
    const argumentOf = isArgument ? top.callee : undefined;
    const first = isArgument && top.commas.length > 0 ? tokens.slice(top.start + 1, top.commas[0]) : [];
    const firstArgument = first.length > 0 ? first.map((token) => token.value).join(' ') : undefined;
    const elementOf =
      top?.kind === 'group' && top.open === '[' && top.key !== undefined && (previous === '[' || previous === ',')
        ? `${top.key}[]`
        : undefined;
    return { kind: 'object', argumentOf, elementOf, firstArgument, open: '{' };
  };

  /** An array literal, with the key it is bound to (`projects: [`). */
  const arrayFrame = (index: number): Open => {
    const key = tokens[index - 2];
    const bound = tokens[index - 1]?.value === ':' && (key?.type === 'ident' || key?.type === 'string');
    return bound ? { kind: 'group', key: key.value, open: '[' } : { kind: 'group', open: '[' };
  };

  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'punct') {
      continue;
    }
    const { value } = token;
    const top = stack.at(-1);
    if (value === '(') {
      const callee = calleeAt(index);
      const curriedFrom = callee === '<call>' && lastCall?.end === index - 1 ? lastCall.callee : undefined;
      const receiver = callee?.startsWith('<call>') ? receiverAt(index) : undefined;
      stack.push(
        callee === undefined
          ? { kind: 'group', open: '(' }
          : {
              kind: 'call',
              callee,
              curriedFrom,
              receiver,
              blocks: blocksOf(),
              start: index,
              commas: [],
              open: '(',
            },
      );
    } else if (value === '{' || value === '[') {
      stack.push(value === '{' ? objectFrame(index, top) : arrayFrame(index));
    } else if (value in closers) {
      // Unbalanced input (a lexer misread) pops until the matching opener rather than throwing.
      let frame = stack.pop();
      while (frame !== undefined && frame.open !== closers[value]) {
        frame = stack.pop();
      }
      if (frame?.kind === 'call') {
        const bounds = [frame.start, ...frame.commas, index];
        const args = bounds.slice(1).map((end, position) => tokens.slice(bounds[position]! + 1, end));
        calls.push({
          callee: frame.callee,
          args: args.length === 1 && args[0]!.length === 0 ? [] : args,
          ...(frame.curriedFrom === undefined ? {} : { curriedFrom: frame.curriedFrom }),
          ...(frame.receiver === undefined ? {} : { receiver: frame.receiver }),
          blocks: frame.blocks,
        });
        lastCall = { end: index, callee: frame.callee };
        callTexts.set(index, `${frame.callee}(${text(frame.start + 1, index)})`);
      }
    } else if (value === ',' && top?.kind === 'call') {
      top.commas.push(index);
    } else if (value === ':' || value === '=') {
      const key = tokens[index - 1];
      if (key === undefined || (key.type !== 'ident' && key.type !== 'string')) {
        continue;
      }
      const end = valueEnd(index + 1);
      const valueTokens = tokens.slice(index + 1, end);
      const kept =
        alwaysBound.test(key.value) &&
        valueTokens.length > 0 &&
        !(valueTokens.length === 1 && typeNames.has(valueTokens[0]!.value));
      if (!kept && (!valueTokens.some((entry) => entry.type === 'number') || valueTokens.length > 16)) {
        continue;
      }
      const context = value === '=' ? '=' : top?.kind === 'object' ? (top.argumentOf ?? top.elementOf ?? '') : '';
      const firstArgument = value === ':' && top?.kind === 'object' ? top.firstArgument : undefined;
      bindings.push({
        key: key.value,
        text: valueTokens.map((entry) => entry.value).join(' '),
        value: evaluate(valueTokens),
        context,
        ...(firstArgument === undefined ? {} : { firstArgument }),
        blocks: blocksOf(),
      });
    }
  }

  return { calls, bindings };
};

// --- Rules -----------------------------------------------------------------------------------------------------

const testFamily = new Set(['it', 'test', 'describe', 'suite', 'bench']);
const suites = new Set(['describe', 'suite']);
const hooks = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);
const disablers = ['skip', 'only', 'todo', 'fails', 'skipIf', 'runIf'] as const;
const focusedOrSkipped = new Set(['xit', 'xtest', 'xdescribe', 'fit', 'fdescribe', 'ftest']);
const asymmetric = new Set([
  'any',
  'anything',
  'objectContaining',
  'arrayContaining',
  'stringContaining',
  'stringMatching',
  'closeTo',
  'not',
  'extend',
  'addSnapshotSerializer',
  'addEqualityTesters',
  'getState',
  'setState',
]);
const assertionBases = new Set(['expect', 'assert', 'expectTypeOf', 'assertType']);
const strictMatchers = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toBeNull',
  'toBeUndefined',
  'toBeNaN',
  'toHaveLength',
  'toHaveBeenCalledTimes',
  'toHaveBeenCalledWith',
  'toHaveBeenLastCalledWith',
  'toHaveBeenNthCalledWith',
  'toHaveReturnedWith',
  'toMatchInlineSnapshot',
  'toThrowError',
]);
const looseMatchers = new Set([
  'toBeTruthy',
  'toBeFalsy',
  'toBeDefined',
  'toBeGreaterThan',
  'toBeGreaterThanOrEqual',
  'toBeLessThan',
  'toBeLessThanOrEqual',
  'toBeCloseTo',
  'toContain',
  'toContainEqual',
  'toMatch',
  'toMatchObject',
  'toHaveBeenCalled',
  'toHaveProperty',
  'toBeTypeOf',
  'toBeInstanceOf',
  'toSatisfy',
  'toBeOneOf',
  'toThrow',
]);
const sleepNames = new Set(['sleep', 'delay', 'pause', 'waitForTimeout', 'setTimeout']);
/** Calls that install a fake clock, and calls that advance one. */
const fakeClockInstall = new Set(['useFakeTimers', 'install']);
const fakeClockAdvance = new Set([
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'runAllTimers',
  'runAllTimersAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'tick',
  'tickAsync',
  'runFor',
  'fastForward',
]);
const optionDisablerKeys = new Set(['skip', 'only', 'todo', 'fails']);
const waitName = /^(?:waitFor(?!Timeout$)\w*|waitUntil|poll|until)$/u;
const toleranceKey = /^(?:tolerance|epsilon|eps|tol|delta|precision|threshold|maxDiff\w*|atol|rtol|margin|slack)$/iu;
const toleranceConstant = /tolerance|epsilon|threshold/iu;

const members = (callee: string): string[] => callee.split('.');

const isLiteral = (tokens: readonly Token[]): boolean =>
  tokens.length === 1 &&
  (tokens[0]!.type === 'number' ||
    tokens[0]!.type === 'string' ||
    ['true', 'false', 'null', 'undefined'].includes(tokens[0]!.value));

/** Counts keyed by where they stand: the path of the declarations around them (`suite:A > test:works`). */
export type Tally = Readonly<Record<string, number>>;

/** Counts and value lists the rules compare between before and after. */
export type Measures = {
  readonly disabled: Readonly<Record<string, number>>;
  /** Each disabled or focused declaration, by its identity, so moving a skip to another test still reads as one. */
  readonly disabledIds: Tally;
  readonly tests: number;
  readonly assertions: number;
  readonly literalAssertions: number;
  readonly sleeps: number;
  readonly waits: number;
  readonly strict: number;
  readonly loose: number;
  /** The same counts per declaration path, so a loss in one test is not hidden by a gain in another. */
  readonly byPath: {
    readonly tests: Tally;
    readonly assertions: Tally;
    readonly literalAssertions: Tally;
    readonly sleeps: Tally;
    /** `setTimeout` calls a fake clock installed and advanced around them may excuse. */
    readonly fakeClockTimers: Tally;
    readonly strict: Tally;
    readonly loose: Tally;
  };
  readonly retries: readonly Binding[];
  readonly testTimeouts: readonly Binding[];
  readonly waitTimeouts: readonly Binding[];
  readonly timeoutConstants: readonly Binding[];
  readonly tolerances: readonly Binding[];
  /** `toBeCloseTo` digits, negated so that a looser (smaller) digit count reads as a raise. */
  readonly closeTo: readonly Binding[];
  /** `skip`, `only`, `todo` or `fails` keys of an options object passed to a test or suite declaration. */
  readonly optionDisablers: number;
};

/** The disabling keys (`skip`, `only`, `todo`, `fails`, set to anything but `false`) of an options-object argument. */
const disablingOptions = (tokens: readonly Token[]): number => {
  if (tokens[0]?.value !== '{') {
    return 0;
  }
  let found = 0;
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'punct' && ['(', '[', '{'].includes(token.value)) {
      depth += 1;
    } else if (token.type === 'punct' && [')', ']', '}'].includes(token.value)) {
      depth -= 1;
    } else if (
      depth === 1 &&
      (token.type === 'ident' || token.type === 'string') &&
      optionDisablerKeys.has(token.value) &&
      ['{', ','].includes(tokens[index - 1]?.value ?? '') &&
      tokens[index + 1]?.value === ':' &&
      tokens[index + 2]?.value !== 'false'
    ) {
      found += 1;
    }
  }
  return found;
};

const tokenText = (tokens: readonly Token[]): string => tokens.map((token) => token.value).join(' ');

const positional = (tokens: readonly Token[], id: string): Binding | undefined => {
  const value = evaluate(tokens);
  return value === undefined ? undefined : { key: '', text: tokenText(tokens), value, context: '', id };
};

/** The path of declarations around a call or binding: `suite:A > test:works > beforeEach`. */
const pathOf = (blocks: readonly Block[] | undefined): string => (blocks ?? []).map((block) => block.label).join(' > ');

/** A path extended by one more label. */
const within = (path: string, label: string): string => (path === '' ? label : `${path} > ${label}`);

/** A declaration's own label, as `pathOf` writes it for the code inside it. */
const declarationLabel = (base: string, name: string | undefined): string =>
  hooks.has(base) ? base : `${suites.has(base) ? 'suite' : 'test'}:${name ?? '?'}`;

/** The innermost declaration a fake-clock call governs: a hook's suite or test, else its own, else the file (-1). */
const clockScope = (blocks: readonly Block[]): number => {
  const governed = blocks.at(-1)?.kind === 'hook' ? blocks.slice(0, -1) : blocks;
  return governed.at(-1)?.start ?? -1;
};

const bump = (tally: Record<string, number>, key: string): void => {
  tally[key] = (tally[key] ?? 0) + 1;
};

export const measure = (source: string): Measures => {
  const { calls, bindings } = facts(tokenize(source));
  const disabled: Record<string, number> = {};
  const disabledIds: Record<string, number> = {};
  const byPath: Record<keyof Measures['byPath'], Record<string, number>> = {
    tests: {},
    assertions: {},
    literalAssertions: {},
    sleeps: {},
    fakeClockTimers: {},
    strict: {},
    loose: {},
  };
  let waits = 0;
  const testTimeouts: Binding[] = [];
  const waitTimeouts: Binding[] = [];
  const closeTo: Binding[] = [];
  let optionDisablers = 0;

  // A fake clock runs `setTimeout` callbacks without waiting only where it is both installed and advanced: in the
  // declaration that does so (a hook's suite or test), and in the code nested inside it.
  const installed = new Set<number>();
  const advanced = new Set<number>();
  for (const { callee, blocks } of calls) {
    const chain = members(callee);
    const last = chain.at(-1)!;
    if (last === 'useFakeTimers' || (chain.at(-2) === 'clock' && fakeClockInstall.has(last))) {
      installed.add(clockScope(blocks));
    } else if (fakeClockAdvance.has(last)) {
      advanced.add(clockScope(blocks));
    }
  }
  const controlled = (blocks: readonly Block[]): boolean => {
    const scopes = [-1, ...blocks.map((block) => block.start)];
    return scopes.some((scope) => installed.has(scope)) && scopes.some((scope) => advanced.has(scope));
  };

  for (const { callee, args, curriedFrom, receiver, blocks } of calls) {
    const chain = members(callee);
    const base = chain[0]!;
    const last = chain.at(-1)!;
    const modifiers = new Set(chain.slice(1));
    const path = pathOf(blocks);
    const name = args[0]?.length === 1 && args[0][0]!.type === 'string' ? args[0][0]!.value : undefined;
    const own = within(path, declarationLabel(base, name));
    const disable = (key: string, id: string): void => {
      bump(disabled, key);
      bump(disabledIds, id);
    };

    if (testFamily.has(base)) {
      const disabler = disablers.find((entry) => modifiers.has(entry));
      if (disabler !== undefined) {
        disable(disabler, own);
      }
      // A disabled test is still declared, so switching one off reads as `disabled-test`, not as a deletion.
      if (!suites.has(base) && !modifiers.has('extend') && !modifiers.has('scoped')) {
        bump(byPath.tests, path);
      }
    } else if (focusedOrSkipped.has(callee)) {
      disable(callee, within(path, `${callee.endsWith('describe') ? 'suite' : 'test'}:${name ?? '?'}`));
      if (!callee.endsWith('describe')) {
        bump(byPath.tests, path);
      }
    } else if (chain.length > 1 && last === 'skip') {
      disable('skip', path);
    }

    const declaration = testFamily.has(base) || (curriedFrom !== undefined && testFamily.has(members(curriedFrom)[0]!));
    if (declaration) {
      const options = args.slice(1).reduce((total, argument) => total + disablingOptions(argument), 0);
      optionDisablers += options;
      for (let index = 0; index < options; index += 1) {
        bump(disabledIds, within(own, 'options'));
      }
    }

    const timeoutArgument = testFamily.has(base) ? 2 : hooks.has(base) ? 1 : -1;
    const budget =
      timeoutArgument >= 0 && args.length > timeoutArgument ? positional(args[timeoutArgument]!, own) : undefined;
    if (budget !== undefined) {
      testTimeouts.push(budget);
    }

    if (assertionBases.has(base) && !(chain.length > 1 && asymmetric.has(chain[1]!))) {
      bump(byPath.assertions, path);
      if (base === 'expect' && chain.length === 1 && args.length === 1 && isLiteral(args[0]!)) {
        bump(byPath.literalAssertions, path);
      }
    }

    const excused = last === 'setTimeout' && controlled(blocks);
    if (excused) {
      bump(byPath.fakeClockTimers, path);
    }
    if (
      (sleepNames.has(last) && !excused) ||
      ((last === 'wait' || callee === 'scheduler.wait') && args[0] !== undefined && evaluate(args[0]) !== undefined)
    ) {
      bump(byPath.sleeps, path);
    }

    if (waitName.test(last)) {
      waits += 1;
      const bound =
        args[1] === undefined ? undefined : positional(args[1], within(path, `${callee}(${tokenText(args[0] ?? [])})`));
      if (bound !== undefined) {
        waitTimeouts.push(bound);
      }
    }

    if (base === '<call>' || chain.length > 1) {
      if (strictMatchers.has(last)) {
        bump(byPath.strict, path);
      } else if (looseMatchers.has(last)) {
        bump(byPath.loose, path);
      }
    }
    if (
      chain.length > 1 &&
      chain[0] === 'expect' &&
      asymmetric.has(chain[1]!) &&
      !['not', 'extend'].includes(chain[1]!)
    ) {
      bump(byPath.loose, path);
    }

    if (last === 'toBeCloseTo') {
      const digits = args[1] === undefined ? 2 : evaluate(args[1]);
      closeTo.push({
        key: 'toBeCloseTo',
        text: String(digits),
        value: digits === undefined ? undefined : -digits,
        context: '',
        // Paired by where it stands, what it asserts on and the expected value, which a digits change leaves alone.
        id: within(path, `${receiver ?? callee}.toBeCloseTo(${tokenText(args[0] ?? [])})`),
      });
    }
  }

  const retries: Binding[] = [];
  const timeoutConstants: Binding[] = [];
  const tolerances: Binding[] = [];
  for (const binding of bindings) {
    const { key, context } = binding;
    const contextBase = members(context)[0]!;
    const path = pathOf(binding.blocks);
    const keyed = { ...binding, id: within(path, `${context}.${key}`) };
    if (/^(?:retry|retries)$/iu.test(key) || (context === '=' && /retr(?:y|ies)/iu.test(key))) {
      retries.push(keyed);
    } else if (/^(?:testTimeout|hookTimeout|teardownTimeout)$/u.test(key)) {
      testTimeouts.push(keyed);
    } else if (key === 'timeout' && (testFamily.has(contextBase) || hooks.has(contextBase))) {
      // The options object stands inside its declaration, so its path ends with the declaration's own label, the
      // identity a positional timeout on the same declaration has.
      testTimeouts.push({ ...binding, id: path });
    } else if (
      key === 'timeout' &&
      (context === 'projects[]' || /(?:setConfig|defineConfig|defineProject)$/u.test(context))
    ) {
      testTimeouts.push(keyed);
    } else if (key === 'timeout' && context !== '' && context !== '=') {
      waitTimeouts.push({ ...binding, id: within(path, `${context}(${binding.firstArgument ?? ''})`) });
    } else if (/timeout/iu.test(key)) {
      timeoutConstants.push(keyed);
    } else if (toleranceKey.test(key) || (context === '=' && toleranceConstant.test(key))) {
      tolerances.push(keyed);
    }
  }

  const total = (tally: Tally): number => Object.values(tally).reduce((sum, value) => sum + value, 0);
  return {
    disabled,
    disabledIds,
    tests: total(byPath.tests),
    assertions: total(byPath.assertions),
    literalAssertions: total(byPath.literalAssertions),
    sleeps: total(byPath.sleeps),
    waits,
    strict: total(byPath.strict),
    loose: total(byPath.loose),
    byPath,
    retries,
    testTimeouts,
    waitTimeouts,
    timeoutConstants,
    tolerances,
    closeTo,
    optionDisablers,
  };
};

/** The keys whose count in `after` exceeds the count in `before`. */
export const grew = (before: Tally, after: Tally): string[] =>
  Object.keys(after).filter((key) => after[key]! > (before[key] ?? 0));

const isRaise = (from: Binding, to: Binding): boolean =>
  to.text !== from.text && (to.value === undefined || from.value === undefined || to.value > from.value);

const byValue = (a: Binding, b: Binding): number => b.value! - a.value!;

/**
 * The values in `after` that exceed what `before` held, paired by structural identity (`id`: the declaration path,
 * and the callee, receiver or key with its first argument) before any value is compared:
 * - an identity with as many values on both sides pairs them in order and compares each pair;
 * - an identity with a different count on each side is ambiguous: its values compare sorted, largest to largest, so
 *   any value that exceeds its rank before is a raise (fail closed), and one beyond the count before is an addition;
 * - identities on one side only are removals and additions. They are compared largest to largest, so a value that
 *   moved to a new identity (a renamed test, a reworded condition) and went up is still a raise. An addition beyond
 *   the removals is a raise unless `fresh` is `'ignore'` (a new wait or matcher loosens nothing that stood before).
 *   A new value with no constant value is a raise against a removal, or when `fresh` is `'raise'`.
 */
export const raised = (
  before: readonly Binding[],
  after: readonly Binding[],
  fresh: 'raise' | 'ignore' = 'raise',
): Binding[] => {
  const group = (bindings: readonly Binding[]): Map<string, Binding[]> => {
    const groups = new Map<string, Binding[]>();
    for (const binding of bindings) {
      const id = binding.id ?? `${binding.context}.${binding.key}`;
      groups.set(id, [...(groups.get(id) ?? []), binding]);
    }
    return groups;
  };
  const was = group(before);
  const is = group(after);
  const result: Binding[] = [];
  const removed: Binding[] = [];
  const added: Binding[] = [];
  for (const [id, values] of is) {
    const previous = was.get(id);
    if (previous === undefined) {
      added.push(...values);
    } else if (previous.length === values.length) {
      result.push(...values.filter((value, index) => isRaise(previous[index]!, value)));
    } else {
      // Ambiguous: which value became which is unknown, so compare the sorted values largest to largest. A value
      // beyond the ones that stood before is an addition; one with no constant value is a raise unless it stood.
      const texts = new Set(previous.map((value) => value.text));
      const before = previous.filter((value) => value.value !== undefined).sort(byValue);
      const known = values.filter((value) => value.value !== undefined).sort(byValue);
      result.push(
        ...values.filter((value) => value.value === undefined && !texts.has(value.text)),
        ...known.filter((value, index) =>
          index >= before.length ? fresh === 'raise' : value.value! > before[index]!.value!,
        ),
      );
    }
  }
  for (const [id, values] of was) {
    if (!is.has(id)) {
      removed.push(...values);
    }
  }
  const counterparts = fresh === 'raise' ? Number.POSITIVE_INFINITY : removed.length;
  const unknown = added.filter((binding) => binding.value === undefined);
  const known = added.filter((binding) => binding.value !== undefined).sort(byValue);
  const previous = removed.filter((binding) => binding.value !== undefined).sort(byValue);
  return [
    ...result,
    ...unknown.slice(0, counterparts),
    ...known.filter((binding, index) =>
      index >= previous.length ? fresh === 'raise' : binding.value! > previous[index]!.value!,
    ),
  ];
};

/** A measured duration: a number and a time unit. */
const duration = String.raw`\d+(?:[.,]\d+)?[ \t]*(?:ms|milliseconds?|s|sec|seconds?|m|min|minutes?)\b`;
/**
 * A `Timeout-budget:` line whose p99 is a measured duration: `p99 21.4 s`, `p99: 1200 ms`, `measured p99 = 12 s`, or
 * `21.4 s (p99)`, `21.4 s p99`.
 */
const timeoutBudgetLine = new RegExp(
  String.raw`^[ \t>*-]*Timeout-budget:[^\n]*?(?:\bp99[ \t]*(?:[:=]|is|of|was)?[ \t]*~?${duration}|${duration}[ \t]*\(?[ \t]*p99\b)`,
  'imu',
);

/** Whether `message` (the pull-request body and commit messages) carries a `Timeout-budget:` line with a measured p99. */
export const hasTimeoutBudget = (message: string): boolean => timeoutBudgetLine.test(message);

const describeValues = (bindings: readonly Binding[]): string =>
  bindings.map((binding) => `${binding.key === '' ? '' : `${binding.key}: `}${binding.text}`).join(', ');

/** The findings for one test-scope code file. */
export const codeFindings = ({
  path,
  before,
  after,
  timeoutBudget,
}: {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly timeoutBudget: boolean;
}): Finding[] => {
  const was = measure(before);
  const is = measure(after);
  const findings: Finding[] = [];
  const add = (rule: string, severity: Severity, message: string): void => {
    findings.push({ rule, severity, path, message });
  };

  for (const name of [...disablers, ...focusedOrSkipped]) {
    const added = (is.disabled[name] ?? 0) - (was.disabled[name] ?? 0);
    if (added > 0) {
      add(
        'disabled-test',
        'forbidden',
        `adds ${added} \`${name}\`: a test is switched off or focused instead of fixed`,
      );
    }
  }
  if (is.optionDisablers > was.optionDisablers) {
    add('disabled-test', 'forbidden', 'adds a `skip`, `only`, `todo` or `fails` test option');
  }
  // Counts compare per declaration too, so a loss in one test or suite is not hidden by a gain in another.
  const switchedOff = grew(was.disabledIds, is.disabledIds);
  if (switchedOff.length > 0 && !findings.some((finding) => finding.rule === 'disabled-test')) {
    add('disabled-test', 'forbidden', `switches off or focuses another declaration (${switchedOff.join('; ')})`);
  }
  const fewerTests = grew(is.byPath.tests, was.byPath.tests);
  if (is.tests < was.tests || fewerTests.length > 0) {
    add(
      'deleted-test',
      'forbidden',
      `declares fewer tests (${was.tests} → ${is.tests}${fewerTests.length > 0 ? `; fewer in ${fewerTests.map((key) => key || 'the file').join('; ')}` : ''})`,
    );
  }
  const fewerAssertions = grew(is.byPath.assertions, was.byPath.assertions);
  if (is.assertions < was.assertions || fewerAssertions.length > 0) {
    add(
      'deleted-assertion',
      'forbidden',
      `makes fewer assertions (${was.assertions} → ${is.assertions}${fewerAssertions.length > 0 ? `; fewer in ${fewerAssertions.map((key) => key || 'the file').join('; ')}` : ''})`,
    );
  }
  if (grew(was.byPath.literalAssertions, is.byPath.literalAssertions).length > 0) {
    add('literal-assertion', 'forbidden', 'adds an assertion on a literal, which cannot fail');
  }
  const sleptIn = grew(was.byPath.sleeps, is.byPath.sleeps);
  if (sleptIn.length > 0) {
    add(
      'fixed-sleep',
      'forbidden',
      `adds a fixed sleep (sleep, delay, setTimeout, waitForTimeout) in ${sleptIn.map((key) => key || 'the file').join('; ')}: await the condition, not the clock`,
    );
  }
  const retries = raised(was.retries, is.retries);
  if (retries.length > 0) {
    add('raised-retry', 'forbidden', `raises a retry count (${describeValues(retries)}): a retry is not a fix`);
  }
  const testTimeouts = raised(was.testTimeouts, is.testTimeouts);
  if (testTimeouts.length > 0) {
    add(
      'raised-timeout',
      timeoutBudget ? 'tolerance' : 'forbidden',
      timeoutBudget
        ? `raises a test or hook timeout (${describeValues(testTimeouts)}) against its Timeout-budget line`
        : `raises a test or hook timeout (${describeValues(testTimeouts)}) without a \`Timeout-budget:\` line giving the measured p99`,
    );
  }
  // A new bounded wait pairs with nothing and is no widening; a retained bound that went up is, whatever was added.
  const waitTimeouts = raised(was.waitTimeouts, is.waitTimeouts, 'ignore');
  if (waitTimeouts.length > 0) {
    add(
      'widened-wait',
      'tolerance',
      `raises the bound of an existing condition wait (${describeValues(waitTimeouts)})`,
    );
  }
  const constants = raised(was.timeoutConstants, is.timeoutConstants);
  if (constants.length > 0) {
    add('raised-timeout-constant', 'tolerance', `raises a timeout value (${describeValues(constants)})`);
  }
  const tolerances = raised(was.tolerances, is.tolerances);
  if (tolerances.length > 0) {
    add('widened-tolerance', 'tolerance', `widens a tolerance (${describeValues(tolerances)})`);
  }
  if (raised(was.closeTo, is.closeTo, 'ignore').length > 0) {
    add('widened-tolerance', 'tolerance', 'lowers the digits of a `toBeCloseTo`');
  }
  // Proving that a fake clock still governs the timer (no `useRealTimers()` in between, no real await on it) needs
  // flow analysis, so an excused timer is not test-only: it goes to the operator.
  const clockTimers = grew(was.byPath.fakeClockTimers, is.byPath.fakeClockTimers);
  if (clockTimers.length > 0) {
    add(
      'fake-clock-timer',
      'tolerance',
      `adds a \`setTimeout\` under a fake clock in ${clockTimers.map((key) => key || 'the file').join('; ')}: confirm the clock, not the wall time, runs it`,
    );
  }
  const loosened = grew(is.byPath.strict, was.byPath.strict).filter(
    (key) => (is.byPath.loose[key] ?? 0) > (was.byPath.loose[key] ?? 0),
  );
  if (loosened.length > 0) {
    add('loosened-matcher', 'tolerance', `trades strict matchers for loose ones (${was.strict} → ${is.strict} strict)`);
  }

  return findings;
};

// --- Verdict ---------------------------------------------------------------------------------------------------

const order: readonly Classification[] = ['test-only', 'product', 'tolerance', 'forbidden'];

export const validateFlakeFix = (changes: readonly Change[], message: string): Verdict => {
  const timeoutBudget = hasTimeoutBudget(message);
  const findings: Finding[] = [];
  const files = changes.map(({ path }) => ({ path, kind: pathKind(path) }));

  if (changes.length === 0) {
    findings.push({
      rule: 'empty-diff',
      severity: 'forbidden',
      path: '',
      message: 'the pull request changes nothing',
    });
  }

  for (const change of changes) {
    const { path, previousPath, before, after } = change;
    const kind = pathKind(path);
    const previousKind = previousPath === undefined ? kind : pathKind(previousPath);
    const add = (rule: string, severity: Severity, text: string): void => {
      findings.push({ rule, severity, path, message: text });
    };

    if (kind === 'protected' || previousKind === 'protected') {
      add(
        'protected-path',
        'forbidden',
        'a flake fix may not change the quarantine, the ledger, the reporter, the validators, a workflow or policy',
      );
      continue;
    }
    if (previousPath !== undefined && testFile.test(previousPath) && !testFile.test(path)) {
      // The runner no longer collects the file, so its tests are gone whatever the new path is.
      add('deleted-test', 'forbidden', `renames the test file ${previousPath} to a path the runner does not collect`);
      continue;
    }
    if (kind === 'product') {
      add('product-code', 'product', 'changes product code');
      continue;
    }
    if (kind === 'snapshot') {
      if (before !== undefined) {
        add('snapshot', 'tolerance', 'changes a stored snapshot or screenshot');
      }
      continue;
    }

    const isCode = codePath.test(path) && after !== undefined && !after.includes('\0');
    if (kind === 'config') {
      add('test-config', 'product', 'changes a test runner config');
      if (isCode) {
        const was = measure(before ?? '');
        const is = measure(after);
        const retries = raised(was.retries, is.retries);
        if (retries.length > 0) {
          add('raised-retry', 'forbidden', `raises a retry count (${describeValues(retries)}): a retry is not a fix`);
        }
        const timeouts = raised(was.testTimeouts, is.testTimeouts);
        if (timeouts.length > 0) {
          add(
            'raised-timeout',
            timeoutBudget ? 'tolerance' : 'forbidden',
            `raises a test or hook timeout (${describeValues(timeouts)})${timeoutBudget ? '' : ' without a `Timeout-budget:` line giving the measured p99'}`,
          );
        }
      }
      continue;
    }

    // Test scope.
    if (after === undefined) {
      if (testFile.test(path)) {
        add('deleted-test', 'forbidden', 'deletes a test file');
      }
      continue;
    }
    if (isCode) {
      findings.push(...codeFindings({ path, before: before ?? '', after, timeoutBudget }));
    }
  }

  let classification: Classification = 'test-only';
  for (const { severity } of findings) {
    if (order.indexOf(severity) > order.indexOf(classification)) {
      classification = severity;
    }
  }
  return {
    classification,
    label: classification === 'test-only' ? 'flake:test-only' : 'flake:needs-operator',
    findings,
    files,
  };
};

const escapeCell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');

/** The step summary in Markdown. */
export const summary = (verdict: Verdict): string => {
  const lines = [
    '## validate-flake-fix',
    '',
    `Classification: **${verdict.classification}**, label \`${verdict.label}\`.`,
    '',
  ];
  if (verdict.findings.length > 0) {
    lines.push('| Severity | Rule | Path | Finding |', '| --- | --- | --- | --- |');
    for (const finding of verdict.findings) {
      lines.push(
        `| ${finding.severity} | ${finding.rule} | \`${escapeCell(finding.path)}\` | ${escapeCell(finding.message)} |`,
      );
    }
    lines.push('');
  }
  lines.push('| Path | Kind |', '| --- | --- |');
  for (const file of verdict.files) {
    lines.push(`| \`${escapeCell(file.path)}\` | ${file.kind} |`);
  }
  return `${lines.join('\n')}\n`;
};

// --- Git -------------------------------------------------------------------------------------------------------

const git = (args: readonly string[]): string =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const show = (revision: string, path: string): string => git(['show', `${revision}:${path}`]);

/** The changes between the merge base of `base` and `head`, and `head`, with renames paired. */
export const readChanges = (base: string, head: string): { changes: Change[]; messages: string } => {
  const mergeBase = git(['merge-base', base, head]).trim();
  const fields = git(['diff', '--no-ext-diff', '--name-status', '-z', '-M', mergeBase, head])
    .split('\0')
    .filter((field) => field !== '');
  const changes: Change[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index]!;
    if (status.startsWith('R') || status.startsWith('C')) {
      const [previousPath, path] = [fields[index + 1]!, fields[index + 2]!];
      changes.push({
        path,
        previousPath,
        before: show(mergeBase, previousPath),
        after: show(head, path),
      });
      index += 3;
    } else {
      const path = fields[index + 1]!;
      changes.push({
        path,
        ...(status === 'A' ? {} : { before: show(mergeBase, path) }),
        ...(status === 'D' ? {} : { after: show(head, path) }),
      });
      index += 2;
    }
  }
  return {
    changes,
    messages: git(['log', '--format=%B', `${mergeBase}..${head}`]),
  };
};

const usage = 'Usage: node scripts/src/validate-flake-fix.ts --base <rev> --head <rev> [--message-file <path>]';

const missing = Symbol('missing value');

/** An option's value, `undefined` when the option is absent, or `missing` when it is present without a value. */
const option = (args: readonly string[], name: string): string | typeof missing | undefined => {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  return value === undefined || value === '' || value.startsWith('--') ? missing : value;
};

/** Escapes an Actions workflow-command property value (the toolkit's `escapeProperty`). */
const escapeProperty = (text: string): string =>
  text
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');

/** Escapes an Actions workflow-command message (the toolkit's `escapeData`). */
const escapeData = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** One finding as an Actions annotation command. */
export const annotation = (finding: Finding): string => {
  const level = finding.severity === 'forbidden' ? 'error' : 'warning';
  const file = finding.path === '' ? '' : ` file=${escapeProperty(finding.path)}`;
  return `::${level}${file},title=${escapeProperty(`validate-flake-fix ${finding.rule}`)}::${escapeData(finding.message)}`;
};

const main = (args: readonly string[]): number => {
  const base = option(args, '--base');
  const head = option(args, '--head');
  const messageFile = option(args, '--message-file');
  if (typeof base !== 'string' || typeof head !== 'string' || messageFile === missing) {
    console.error(usage);
    return 2;
  }
  let body = '';
  if (messageFile !== undefined) {
    try {
      body = readFileSync(messageFile, 'utf8');
    } catch (error) {
      console.error(
        `validate-flake-fix: could not read --message-file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
  }

  let read: { changes: Change[]; messages: string };
  try {
    read = readChanges(base, head);
  } catch (error) {
    console.error(
      `validate-flake-fix: could not read the diff: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  const verdict = validateFlakeFix(read.changes, `${body}\n${read.messages}`);

  for (const finding of verdict.findings) {
    console.log(annotation(finding));
  }
  console.log(`classification=${verdict.classification} label=${verdict.label} files=${verdict.files.length}`);

  const output = process.env['GITHUB_OUTPUT'];
  if (output) {
    appendFileSync(output, `classification=${verdict.classification}\nlabel=${verdict.label}\n`);
  }
  const stepSummary = process.env['GITHUB_STEP_SUMMARY'];
  if (stepSummary) {
    appendFileSync(stepSummary, summary(verdict));
  }
  return verdict.classification === 'forbidden' ? 1 : 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
