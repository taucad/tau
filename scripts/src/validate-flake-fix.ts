/**
 * Validate a flake fix: reject the transformations that make a flaky test pass without fixing it, and classify the
 * rest so the fixing agent knows whether it may enable auto-merge (Brain research/ci-flake-quarantine-blueprint.md,
 * D7 "What a fix may not do", FQ-14, O4).
 *
 * Every changed path is classed first (the path guard):
 * - protected: a `quarantine.json`, the flake ledger and its jobs, the validators, `.github/` (workflows, actions,
 *   CODEOWNERS), policy and agent instructions. Agents do not mark their own work (invariant 5), so touching one is
 *   forbidden.
 * - test: a test file, or a file under a test, fixture or e2e directory. The rules below run on its code.
 * - snapshot: a changed or deleted stored snapshot or screenshot. Loosens an expectation; needs a review.
 * - config: a Vitest, Vite or Playwright config. Product-grade change; the retry and timeout rule runs on it.
 * - product: everything else.
 *
 * The rules compare each test file's code before and after, lexically (comments and string contents never match),
 * so moving code within a file is neutral and only a net change counts:
 * - forbidden: an added skip, `only`, `todo`, `fails`, `skipIf` or `runIf` (and `xit`/`fit`, `{ skip: true }`,
 *   `ctx.skip()`); fewer test declarations or a deleted test file; fewer assertions; an added assertion on a
 *   literal (`expect(true)`); a raised `retry`; a raised test or hook timeout without a `Timeout-budget:` line
 *   naming the measured p99 in the pull-request body or a commit message; an added fixed sleep (`sleep`, `delay`,
 *   `setTimeout`, `waitForTimeout`, `wait(<n>)`).
 * - tolerance: a raised test timeout that carries its `Timeout-budget:` line; a raised bound on an existing
 *   condition wait; a raised timeout constant; a raised tolerance, epsilon or threshold; fewer `toBeCloseTo`
 *   digits; strict matchers traded for loose ones (`toBe` for `toBeTruthy`, `toBeGreaterThan`, …).
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
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export type Classification =
  | "test-only"
  | "product"
  | "tolerance"
  | "forbidden";
export type Severity = Exclude<Classification, "test-only">;
export type PathKind = "protected" | "test" | "snapshot" | "config" | "product";

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
  readonly label: "flake:test-only" | "flake:needs-operator";
  readonly findings: readonly Finding[];
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly kind: PathKind;
  }>;
};

// --- Path guard ------------------------------------------------------------------------------------------------

/**
 * Paths a flake fix may not touch: the quarantine and the ledger, the jobs and validators that decide them, the
 * workflows and actions, and the policy and instructions agents work under. FQ-1's outcome reporter is matched by
 * name; when it lands under a name these miss, add it here.
 */
const protectedPaths: readonly RegExp[] = [
  /quarantine/iu,
  /flake-(?:ledger|repro|fix)/iu,
  /^scripts\/src\/(?:ci-queue-health|validate-)/u,
  /outcomes?-reporter|test-outcomes/u,
  /^\.github\//u,
  /^docs\/policy\//u,
  /^\.agents\//u,
  /^\.claude\//u,
  /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/u,
];

const configPath =
  /(?:^|\/)(?:vitest|vite|playwright)(?:\.[\w-]+)*\.(?:config|workspace)\.[cm]?[jt]s$/u;
const snapshotPath = /(?:^|\/)__(?:snapshots|screenshots)__\/|\.snap$/u;
const testFile = /(?:^|\/)[^/]+\.(?:test|spec|e2e|bench)\.[cm]?[jt]sx?$/u;
const testDirectory =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|fixtures|test|tests|testing|test-utils|e2e|spec)\/|^apps\/[^/]+-e2e\//u;
const codePath = /\.[cm]?[jt]sx?$/u;

export const pathKind = (path: string): PathKind => {
  if (protectedPaths.some((pattern) => pattern.test(path))) {
    return "protected";
  }
  if (configPath.test(path)) {
    return "config";
  }
  if (snapshotPath.test(path)) {
    return "snapshot";
  }
  return testFile.test(path) || testDirectory.test(path) ? "test" : "product";
};

// --- Lexer -----------------------------------------------------------------------------------------------------

export type Token = {
  readonly type: "ident" | "number" | "string" | "regex" | "punct";
  readonly value: string;
};

const punctuators = [
  "...",
  "===",
  "!==",
  ">>>",
  "**=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "**",
];

/** Words after which a `/` starts a regular expression rather than a division. */
const regexPrefixWords = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "instanceof",
  "yield",
  "await",
]);

const identifierStart = /[A-Za-z_$#]/u;
const identifierPart = /[\w$]/u;
const numberPattern =
  /^(?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)n?/u;

/**
 * Tokens of a JavaScript or TypeScript source: identifiers, numbers, punctuators, and string, template and regular
 * expression literals as single tokens, with comments dropped. Template substitutions are tokenised as code.
 * ponytail: a lexer, not a parser. It is exact on the things the rules read (calls, member chains, property values)
 * and approximate on `/` after `}`; a misread there shifts one token, not the comparison.
 */
export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  const braces: Array<"brace" | "template"> = [];
  let index = 0;

  const readTemplate = (): void => {
    // Called just after a backtick or a substitution's closing brace.
    let text = "";
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        text += source.slice(index, index + 2);
        index += 2;
      } else if (char === "`") {
        index += 1;
        tokens.push({ type: "string", value: text });
        return;
      } else if (char === "$" && source[index + 1] === "{") {
        index += 2;
        tokens.push({ type: "string", value: text });
        braces.push("template");
        return;
      } else {
        text += char;
        index += 1;
      }
    }
    tokens.push({ type: "string", value: text });
  };

  const regexAllowed = (): boolean => {
    const previous = tokens.at(-1);
    if (previous === undefined) {
      return true;
    }
    if (previous.type === "punct") {
      return ![")", "]", "}"].includes(previous.value);
    }
    return previous.type === "ident" && regexPrefixWords.has(previous.value);
  };

  const punctuatorAt = (position: number): string =>
    punctuators.find((candidate) => source.startsWith(candidate, position)) ??
    source[position]!;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (/\s/u.test(char)) {
      index += 1;
    } else if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (
        end < source.length &&
        source[end] !== char &&
        source[end] !== "\n"
      ) {
        end += source[end] === "\\" ? 2 : 1;
      }
      tokens.push({ type: "string", value: source.slice(index + 1, end) });
      index = end + 1;
    } else if (char === "`") {
      index += 1;
      readTemplate();
    } else if (char === "/" && regexAllowed()) {
      let end = index + 1;
      let inClass = false;
      while (
        end < source.length &&
        source[end] !== "\n" &&
        (inClass || source[end] !== "/")
      ) {
        switch (source[end]) {
          case "\\": {
            end += 1;
            break;
          }
          case "[": {
            inClass = true;
            break;
          }
          case "]": {
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
      tokens.push({ type: "regex", value: source.slice(index, end) });
      index = end;
    } else if (
      /\d/u.test(char) ||
      (char === "." && next !== undefined && /\d/u.test(next))
    ) {
      const match = numberPattern.exec(source.slice(index, index + 64));
      const value = match?.[0] ?? char;
      tokens.push({ type: "number", value });
      index += value.length;
    } else if (identifierStart.test(char)) {
      let end = index + 1;
      while (end < source.length && identifierPart.test(source[end]!)) {
        end += 1;
      }
      tokens.push({ type: "ident", value: source.slice(index, end) });
      index = end;
    } else if (char === "{") {
      braces.push("brace");
      tokens.push({ type: "punct", value: "{" });
      index += 1;
    } else if (char === "}") {
      index += 1;
      if (braces.pop() === "template") {
        readTemplate();
      } else {
        tokens.push({ type: "punct", value: "}" });
      }
    } else {
      const value = punctuatorAt(index);
      tokens.push({ type: "punct", value });
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
};

/** A numeric value bound to a name: `key: value` in an object, or `name = value`. `context` says where. */
export type Binding = {
  readonly key: string;
  readonly text: string;
  readonly value: number | undefined;
  /** The callee the object is a direct argument of, `''` for any other object, `'='` for an assignment. */
  readonly context: string;
};

export type Facts = {
  readonly calls: readonly Call[];
  readonly bindings: readonly Binding[];
};

const notCallees = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "return",
  "typeof",
  "await",
  "yield",
  "in",
  "of",
  "case",
  "throw",
  "else",
  "do",
  "void",
  "delete",
]);

/** The value of a constant numeric expression (`30 * 1_000`, `-1`), or undefined for anything else. */
export const evaluate = (tokens: readonly Token[]): number | undefined => {
  let index = 0;
  const peek = (): string | undefined => tokens[index]?.value;
  const factor = (): number | undefined => {
    const token = tokens[index];
    index += 1;
    if (token?.type === "number") {
      const text = token.value.replaceAll("_", "").replace(/n$/u, "");
      const radix = /^0[bB]/u.test(text) ? 2 : 8;
      return /^0[bBoO]/u.test(text)
        ? Number.parseInt(text.slice(2), radix)
        : Number(text);
    }
    if (token?.value === "-") {
      const value = factor();
      return value === undefined ? undefined : -value;
    }
    if (token?.value === "(") {
      const value = sum();
      index += 1;
      return tokens[index - 1]?.value === ")" ? value : undefined;
    }
    return undefined;
  };
  const product = (): number | undefined => {
    let value = factor();
    while (value !== undefined && (peek() === "*" || peek() === "/")) {
      const operator = peek();
      index += 1;
      const right = factor();
      value =
        right === undefined
          ? undefined
          : operator === "*"
            ? value * right
            : value / right;
    }
    return value;
  };
  const sum = (): number | undefined => {
    let value = product();
    while (value !== undefined && (peek() === "+" || peek() === "-")) {
      const operator = peek();
      index += 1;
      const right = product();
      value =
        right === undefined
          ? undefined
          : operator === "+"
            ? value + right
            : value - right;
    }
    return value;
  };
  const value = sum();
  return index === tokens.length &&
    value !== undefined &&
    Number.isFinite(value)
    ? value
    : undefined;
};

type Frame =
  | {
      readonly kind: "call";
      readonly callee: string;
      readonly start: number;
      readonly commas: number[];
    }
  | { readonly kind: "object"; readonly argumentOf: string | undefined }
  | { readonly kind: "group" };

const closers: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

/** The calls and numeric bindings in a token stream. */
export const facts = (tokens: readonly Token[]): Facts => {
  const calls: Call[] = [];
  const bindings: Binding[] = [];
  const stack: Array<Frame & { readonly open: string }> = [];

  const calleeAt = (index: number): string | undefined => {
    // `index` is the `(`; read the member chain that ends just before it.
    const previous = tokens[index - 1];
    if (previous?.type === "punct" && previous.value === ")") {
      return "<call>";
    }
    if (previous?.type !== "ident" || notCallees.has(previous.value)) {
      return undefined;
    }
    if (tokens[index - 2]?.value === "function") {
      return undefined;
    }
    const parts = [previous.value];
    let cursor = index - 2;
    while (
      tokens[cursor]?.type === "punct" &&
      (tokens[cursor]!.value === "." || tokens[cursor]!.value === "?.")
    ) {
      const object = tokens[cursor - 1];
      if (object?.type === "ident") {
        parts.unshift(object.value);
        cursor -= 2;
      } else {
        parts.unshift("<call>");
        break;
      }
    }
    return parts.join(".");
  };

  const valueEnd = (from: number): number => {
    let depth = 0;
    let cursor = from;
    while (cursor < tokens.length) {
      const { type, value } = tokens[cursor]!;
      if (type === "punct") {
        if (["(", "[", "{"].includes(value)) {
          depth += 1;
        } else if ([")", "]", "}"].includes(value)) {
          if (depth === 0) {
            return cursor;
          }
          depth -= 1;
        } else if (depth === 0 && [",", ";"].includes(value)) {
          return cursor;
        }
      }
      cursor += 1;
    }
    return cursor;
  };

  for (const [index, token] of tokens.entries()) {
    if (token.type !== "punct") {
      continue;
    }
    const { value } = token;
    const top = stack.at(-1);
    if (value === "(") {
      const callee = calleeAt(index);
      stack.push(
        callee === undefined
          ? { kind: "group", open: "(" }
          : { kind: "call", callee, start: index, commas: [], open: "(" },
      );
    } else if (value === "{" || value === "[") {
      const previous = tokens[index - 1]?.value;
      const argumentOf =
        value === "{" &&
        top?.kind === "call" &&
        (previous === "(" || previous === ",")
          ? top.callee
          : undefined;
      stack.push(
        value === "{"
          ? { kind: "object", argumentOf, open: "{" }
          : { kind: "group", open: "[" },
      );
    } else if (value in closers) {
      // Unbalanced input (a lexer misread) pops until the matching opener rather than throwing.
      let frame = stack.pop();
      while (frame !== undefined && frame.open !== closers[value]) {
        frame = stack.pop();
      }
      if (frame?.kind === "call") {
        const bounds = [frame.start, ...frame.commas, index];
        const args = bounds
          .slice(1)
          .map((end, position) => tokens.slice(bounds[position]! + 1, end));
        calls.push({
          callee: frame.callee,
          args: args.length === 1 && args[0]!.length === 0 ? [] : args,
        });
      }
    } else if (value === "," && top?.kind === "call") {
      top.commas.push(index);
    } else if (value === ":" || value === "=") {
      const key = tokens[index - 1];
      if (
        key === undefined ||
        (key.type !== "ident" && key.type !== "string")
      ) {
        continue;
      }
      const end = valueEnd(index + 1);
      const valueTokens = tokens.slice(index + 1, end);
      if (
        !valueTokens.some((entry) => entry.type === "number") ||
        valueTokens.length > 16
      ) {
        continue;
      }
      const context =
        value === "="
          ? "="
          : top?.kind === "object"
            ? (top.argumentOf ?? "")
            : "";
      bindings.push({
        key: key.value,
        text: valueTokens.map((entry) => entry.value).join(" "),
        value: evaluate(valueTokens),
        context,
      });
    }
  }

  return { calls, bindings };
};

// --- Rules -----------------------------------------------------------------------------------------------------

const testFamily = new Set(["it", "test", "describe", "suite", "bench"]);
const hooks = new Set(["beforeEach", "afterEach", "beforeAll", "afterAll"]);
const disablers = ["skip", "only", "todo", "fails", "skipIf", "runIf"] as const;
const focusedOrSkipped = new Set([
  "xit",
  "xtest",
  "xdescribe",
  "fit",
  "fdescribe",
  "ftest",
]);
const asymmetric = new Set([
  "any",
  "anything",
  "objectContaining",
  "arrayContaining",
  "stringContaining",
  "stringMatching",
  "closeTo",
  "not",
  "extend",
  "addSnapshotSerializer",
  "addEqualityTesters",
  "getState",
  "setState",
]);
const assertionBases = new Set([
  "expect",
  "assert",
  "expectTypeOf",
  "assertType",
]);
const strictMatchers = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toBeNull",
  "toBeUndefined",
  "toBeNaN",
  "toHaveLength",
  "toHaveBeenCalledTimes",
  "toHaveBeenCalledWith",
  "toHaveBeenLastCalledWith",
  "toHaveBeenNthCalledWith",
  "toHaveReturnedWith",
  "toMatchInlineSnapshot",
  "toThrowError",
]);
const looseMatchers = new Set([
  "toBeTruthy",
  "toBeFalsy",
  "toBeDefined",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeCloseTo",
  "toContain",
  "toContainEqual",
  "toMatch",
  "toMatchObject",
  "toHaveBeenCalled",
  "toHaveProperty",
  "toBeTypeOf",
  "toBeInstanceOf",
  "toSatisfy",
  "toBeOneOf",
  "toThrow",
]);
const sleepNames = new Set([
  "sleep",
  "delay",
  "pause",
  "waitForTimeout",
  "setTimeout",
]);
const waitName = /^(?:waitFor(?!Timeout$)\w*|waitUntil|poll|until)$/u;
const toleranceKey =
  /^(?:tolerance|epsilon|eps|tol|delta|precision|threshold|maxDiff\w*|atol|rtol|margin|slack)$/iu;
const toleranceConstant = /tolerance|epsilon|threshold/iu;

const members = (callee: string): string[] => callee.split(".");

const isLiteral = (tokens: readonly Token[]): boolean =>
  tokens.length === 1 &&
  (tokens[0]!.type === "number" ||
    tokens[0]!.type === "string" ||
    ["true", "false", "null", "undefined"].includes(tokens[0]!.value));

/** Counts and value lists the rules compare between before and after. */
export type Measures = {
  readonly disabled: Readonly<Record<string, number>>;
  readonly tests: number;
  readonly assertions: number;
  readonly literalAssertions: number;
  readonly sleeps: number;
  readonly waits: number;
  readonly strict: number;
  readonly loose: number;
  readonly retries: readonly Binding[];
  readonly testTimeouts: readonly Binding[];
  readonly waitTimeouts: readonly Binding[];
  readonly timeoutConstants: readonly Binding[];
  readonly tolerances: readonly Binding[];
  /** `toBeCloseTo` digits, negated so that a looser (smaller) digit count reads as a raise. */
  readonly closeTo: readonly Binding[];
};

const positional = (tokens: readonly Token[]): Binding | undefined => {
  const value = evaluate(tokens);
  return value === undefined
    ? undefined
    : {
        key: "",
        text: tokens.map((token) => token.value).join(" "),
        value,
        context: "",
      };
};

export const measure = (source: string): Measures => {
  const { calls, bindings } = facts(tokenize(source));
  const disabled: Record<string, number> = {};
  const count = (key: string): void => {
    disabled[key] = (disabled[key] ?? 0) + 1;
  };
  let tests = 0;
  let assertions = 0;
  let literalAssertions = 0;
  let sleeps = 0;
  let waits = 0;
  let strict = 0;
  let loose = 0;
  const testTimeouts: Binding[] = [];
  const waitTimeouts: Binding[] = [];
  const closeTo: Binding[] = [];

  for (const { callee, args } of calls) {
    const chain = members(callee);
    const base = chain[0]!;
    const last = chain.at(-1)!;
    const modifiers = new Set(chain.slice(1));

    if (testFamily.has(base)) {
      const disabler = disablers.find((name) => modifiers.has(name));
      if (disabler !== undefined) {
        count(disabler);
      }
      // A disabled test is still declared, so switching one off reads as `disabled-test`, not as a deletion.
      if (
        base !== "describe" &&
        base !== "suite" &&
        !modifiers.has("extend") &&
        !modifiers.has("scoped")
      ) {
        tests += 1;
      }
    } else if (focusedOrSkipped.has(callee)) {
      count(callee);
      tests += callee.endsWith("describe") ? 0 : 1;
    } else if (chain.length > 1 && last === "skip") {
      count("skip");
    }

    const timeoutArgument = testFamily.has(base) ? 2 : hooks.has(base) ? 1 : -1;
    const budget =
      timeoutArgument >= 0 && args.length > timeoutArgument
        ? positional(args[timeoutArgument]!)
        : undefined;
    if (budget !== undefined) {
      testTimeouts.push(budget);
    }

    if (
      assertionBases.has(base) &&
      !(chain.length > 1 && asymmetric.has(chain[1]!))
    ) {
      assertions += 1;
      if (
        base === "expect" &&
        chain.length === 1 &&
        args.length === 1 &&
        isLiteral(args[0]!)
      ) {
        literalAssertions += 1;
      }
    }

    if (
      sleepNames.has(last) ||
      ((last === "wait" || callee === "scheduler.wait") &&
        args[0] !== undefined &&
        evaluate(args[0]) !== undefined)
    ) {
      sleeps += 1;
    }

    if (waitName.test(last)) {
      waits += 1;
      const bound = args[1] === undefined ? undefined : positional(args[1]);
      if (bound !== undefined) {
        waitTimeouts.push(bound);
      }
    }

    if (base === "<call>" || chain.length > 1) {
      if (strictMatchers.has(last)) {
        strict += 1;
      } else if (looseMatchers.has(last)) {
        loose += 1;
      }
    }
    if (
      chain.length > 1 &&
      chain[0] === "expect" &&
      asymmetric.has(chain[1]!) &&
      !["not", "extend"].includes(chain[1]!)
    ) {
      loose += 1;
    }

    if (last === "toBeCloseTo") {
      const digits = args[1] === undefined ? 2 : evaluate(args[1]);
      closeTo.push({
        key: "toBeCloseTo",
        text: String(digits),
        value: digits === undefined ? undefined : -digits,
        context: "",
      });
    }
  }

  const retries: Binding[] = [];
  const timeoutConstants: Binding[] = [];
  const tolerances: Binding[] = [];
  for (const binding of bindings) {
    const { key, context } = binding;
    const contextBase = members(context)[0]!;
    if (
      /^(?:retry|retries)$/iu.test(key) ||
      (context === "=" && /retr(?:y|ies)/iu.test(key))
    ) {
      retries.push(binding);
    } else if (/^(?:testTimeout|hookTimeout|teardownTimeout)$/u.test(key)) {
      testTimeouts.push(binding);
    } else if (
      key === "timeout" &&
      (testFamily.has(contextBase) ||
        hooks.has(contextBase) ||
        /(?:setConfig|defineConfig|defineProject)$/u.test(context))
    ) {
      testTimeouts.push(binding);
    } else if (key === "timeout" && context !== "" && context !== "=") {
      waitTimeouts.push(binding);
    } else if (/timeout/iu.test(key)) {
      timeoutConstants.push(binding);
    } else if (
      toleranceKey.test(key) ||
      (context === "=" && toleranceConstant.test(key))
    ) {
      tolerances.push(binding);
    }
  }

  return {
    disabled,
    tests,
    assertions,
    literalAssertions,
    sleeps,
    waits,
    strict,
    loose,
    retries,
    testTimeouts,
    waitTimeouts,
    timeoutConstants,
    tolerances,
    closeTo,
  };
};

/**
 * The values in `after` that exceed what `before` held. Identical expressions cancel first; the rest are compared
 * largest to largest, so a value that went up, or a new one, is a raise. An expression with no constant value that
 * did not stand before is a raise too (fail closed).
 */
export const raised = (
  before: readonly Binding[],
  after: readonly Binding[],
): Binding[] => {
  const remaining = [...before];
  const added: Binding[] = [];
  for (const binding of after) {
    const match = remaining.findIndex(
      (candidate) => candidate.text === binding.text,
    );
    if (match === -1) {
      added.push(binding);
    } else {
      remaining.splice(match, 1);
    }
  }
  const unknown = added.filter((binding) => binding.value === undefined);
  const known = added
    .filter((binding) => binding.value !== undefined)
    .sort((a, b) => b.value! - a.value!);
  const previous = remaining
    .filter((binding) => binding.value !== undefined)
    .sort((a, b) => b.value! - a.value!);
  return [
    ...unknown,
    ...known.filter(
      (binding, index) =>
        index >= previous.length || binding.value! > previous[index]!.value!,
    ),
  ];
};

const timeoutBudgetLine = /^[ \t>*-]*Timeout-budget:[^\n]*\bp99\b[^\n]*\d/imu;

/** Whether `message` (the pull-request body and commit messages) carries a `Timeout-budget:` line with a p99. */
export const hasTimeoutBudget = (message: string): boolean =>
  timeoutBudgetLine.test(message);

const describeValues = (bindings: readonly Binding[]): string =>
  bindings
    .map(
      (binding) =>
        `${binding.key === "" ? "" : `${binding.key}: `}${binding.text}`,
    )
    .join(", ");

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
        "disabled-test",
        "forbidden",
        `adds ${added} \`${name}\`: a test is switched off or focused instead of fixed`,
      );
    }
  }
  const optionDisablers =
    /(?:^|[,{(]\s*)(?:skip|only|todo|fails)\s*:\s*true\b/gu;
  const optionCount = (source: string): number =>
    tokensText(source).match(optionDisablers)?.length ?? 0;
  if (optionCount(after) > optionCount(before)) {
    add(
      "disabled-test",
      "forbidden",
      "adds a `skip`, `only`, `todo` or `fails` test option",
    );
  }
  if (is.tests < was.tests) {
    add(
      "deleted-test",
      "forbidden",
      `declares ${was.tests - is.tests} fewer test(s) (${was.tests} → ${is.tests})`,
    );
  }
  if (is.assertions < was.assertions) {
    add(
      "deleted-assertion",
      "forbidden",
      `makes ${was.assertions - is.assertions} fewer assertion(s) (${was.assertions} → ${is.assertions})`,
    );
  }
  if (is.literalAssertions > was.literalAssertions) {
    add(
      "literal-assertion",
      "forbidden",
      "adds an assertion on a literal, which cannot fail",
    );
  }
  if (is.sleeps > was.sleeps) {
    add(
      "fixed-sleep",
      "forbidden",
      `adds ${is.sleeps - was.sleeps} fixed sleep(s) (sleep, delay, setTimeout, waitForTimeout): await the condition, not the clock`,
    );
  }
  const retries = raised(was.retries, is.retries);
  if (retries.length > 0) {
    add(
      "raised-retry",
      "forbidden",
      `raises a retry count (${describeValues(retries)}): a retry is not a fix`,
    );
  }
  const testTimeouts = raised(was.testTimeouts, is.testTimeouts);
  if (testTimeouts.length > 0) {
    add(
      "raised-timeout",
      timeoutBudget ? "tolerance" : "forbidden",
      timeoutBudget
        ? `raises a test or hook timeout (${describeValues(testTimeouts)}) against its Timeout-budget line`
        : `raises a test or hook timeout (${describeValues(testTimeouts)}) without a \`Timeout-budget:\` line giving the measured p99`,
    );
  }
  const waitTimeouts = raised(was.waitTimeouts, is.waitTimeouts);
  if (waitTimeouts.length > 0 && is.waits <= was.waits) {
    add(
      "widened-wait",
      "tolerance",
      `raises the bound of an existing condition wait (${describeValues(waitTimeouts)})`,
    );
  }
  const constants = raised(was.timeoutConstants, is.timeoutConstants);
  if (constants.length > 0) {
    add(
      "raised-timeout-constant",
      "tolerance",
      `raises a timeout value (${describeValues(constants)})`,
    );
  }
  const tolerances = raised(was.tolerances, is.tolerances);
  if (tolerances.length > 0) {
    add(
      "widened-tolerance",
      "tolerance",
      `widens a tolerance (${describeValues(tolerances)})`,
    );
  }
  if (raised(was.closeTo, is.closeTo).length > 0) {
    add(
      "widened-tolerance",
      "tolerance",
      "lowers the digits of a `toBeCloseTo`",
    );
  }
  if (is.strict < was.strict && is.loose > was.loose) {
    add(
      "loosened-matcher",
      "tolerance",
      `trades strict matchers for loose ones (${was.strict} → ${is.strict} strict)`,
    );
  }

  return findings;
};

/** The code with string contents and comments removed, for option-shape patterns. */
const tokensText = (source: string): string =>
  tokenize(source)
    .map((token) => (token.type === "string" ? '""' : token.value))
    .join(" ");

// --- Verdict ---------------------------------------------------------------------------------------------------

const order: readonly Classification[] = [
  "test-only",
  "product",
  "tolerance",
  "forbidden",
];

export const validateFlakeFix = (
  changes: readonly Change[],
  message: string,
): Verdict => {
  const timeoutBudget = hasTimeoutBudget(message);
  const findings: Finding[] = [];
  const files = changes.map(({ path }) => ({ path, kind: pathKind(path) }));

  if (changes.length === 0) {
    findings.push({
      rule: "empty-diff",
      severity: "forbidden",
      path: "",
      message: "the pull request changes nothing",
    });
  }

  for (const change of changes) {
    const { path, previousPath, before, after } = change;
    const kind = pathKind(path);
    const previousKind =
      previousPath === undefined ? kind : pathKind(previousPath);
    const add = (rule: string, severity: Severity, text: string): void => {
      findings.push({ rule, severity, path, message: text });
    };

    if (kind === "protected" || previousKind === "protected") {
      add(
        "protected-path",
        "forbidden",
        "a flake fix may not change the quarantine, the ledger, the reporter, the validators, a workflow or policy",
      );
      continue;
    }
    if (kind === "product") {
      add("product-code", "product", "changes product code");
      continue;
    }
    if (kind === "snapshot") {
      if (before !== undefined) {
        add("snapshot", "tolerance", "changes a stored snapshot or screenshot");
      }
      continue;
    }

    const isCode =
      codePath.test(path) && after !== undefined && !after.includes("\0");
    if (kind === "config") {
      add("test-config", "product", "changes a test runner config");
      if (isCode) {
        const was = measure(before ?? "");
        const is = measure(after);
        const retries = raised(was.retries, is.retries);
        if (retries.length > 0) {
          add(
            "raised-retry",
            "forbidden",
            `raises a retry count (${describeValues(retries)}): a retry is not a fix`,
          );
        }
        const timeouts = raised(was.testTimeouts, is.testTimeouts);
        if (timeouts.length > 0) {
          add(
            "raised-timeout",
            timeoutBudget ? "tolerance" : "forbidden",
            `raises a test or hook timeout (${describeValues(timeouts)})${timeoutBudget ? "" : " without a `Timeout-budget:` line giving the measured p99"}`,
          );
        }
      }
      continue;
    }

    // Test scope.
    if (after === undefined) {
      if (testFile.test(path)) {
        add("deleted-test", "forbidden", "deletes a test file");
      }
      continue;
    }
    if (isCode) {
      findings.push(
        ...codeFindings({ path, before: before ?? "", after, timeoutBudget }),
      );
    }
  }

  let classification: Classification = "test-only";
  for (const { severity } of findings) {
    if (order.indexOf(severity) > order.indexOf(classification)) {
      classification = severity;
    }
  }
  return {
    classification,
    label:
      classification === "test-only"
        ? "flake:test-only"
        : "flake:needs-operator",
    findings,
    files,
  };
};

const escapeCell = (text: string): string =>
  text.replaceAll("|", String.raw`\|`).replaceAll("\n", " ");

/** The step summary in Markdown. */
export const summary = (verdict: Verdict): string => {
  const lines = [
    "## validate-flake-fix",
    "",
    `Classification: **${verdict.classification}**, label \`${verdict.label}\`.`,
    "",
  ];
  if (verdict.findings.length > 0) {
    lines.push(
      "| Severity | Rule | Path | Finding |",
      "| --- | --- | --- | --- |",
    );
    for (const finding of verdict.findings) {
      lines.push(
        `| ${finding.severity} | ${finding.rule} | \`${escapeCell(finding.path)}\` | ${escapeCell(finding.message)} |`,
      );
    }
    lines.push("");
  }
  lines.push("| Path | Kind |", "| --- | --- |");
  for (const file of verdict.files) {
    lines.push(`| \`${escapeCell(file.path)}\` | ${file.kind} |`);
  }
  return `${lines.join("\n")}\n`;
};

// --- Git -------------------------------------------------------------------------------------------------------

const git = (args: readonly string[]): string =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const show = (revision: string, path: string): string =>
  git(["show", `${revision}:${path}`]);

/** The changes between the merge base of `base` and `head`, and `head`, with renames paired. */
export const readChanges = (
  base: string,
  head: string,
): { changes: Change[]; messages: string } => {
  const mergeBase = git(["merge-base", base, head]).trim();
  const fields = git([
    "diff",
    "--no-ext-diff",
    "--name-status",
    "-z",
    "-M",
    mergeBase,
    head,
  ])
    .split("\0")
    .filter((field) => field !== "");
  const changes: Change[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index]!;
    if (status.startsWith("R") || status.startsWith("C")) {
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
        ...(status === "A" ? {} : { before: show(mergeBase, path) }),
        ...(status === "D" ? {} : { after: show(head, path) }),
      });
      index += 2;
    }
  }
  return {
    changes,
    messages: git(["log", "--format=%B", `${mergeBase}..${head}`]),
  };
};

const option = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const main = (args: readonly string[]): number => {
  const base = option(args, "--base");
  const head = option(args, "--head");
  const messageFile = option(args, "--message-file");
  if (base === undefined || head === undefined) {
    console.error(
      "Usage: node scripts/src/validate-flake-fix.ts --base <rev> --head <rev> [--message-file <path>]",
    );
    return 2;
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
  const body =
    messageFile === undefined ? "" : readFileSync(messageFile, "utf8");
  const verdict = validateFlakeFix(read.changes, `${body}\n${read.messages}`);

  for (const finding of verdict.findings) {
    const level = finding.severity === "forbidden" ? "error" : "warning";
    const file = finding.path === "" ? "" : ` file=${finding.path}`;
    console.log(
      `::${level}${file},title=validate-flake-fix ${finding.rule}::${finding.message}`,
    );
  }
  console.log(
    `classification=${verdict.classification} label=${verdict.label} files=${verdict.files.length}`,
  );

  const output = process.env["GITHUB_OUTPUT"];
  if (output) {
    appendFileSync(
      output,
      `classification=${verdict.classification}\nlabel=${verdict.label}\n`,
    );
  }
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary) {
    appendFileSync(stepSummary, summary(verdict));
  }
  return verdict.classification === "forbidden" ? 1 : 0;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
