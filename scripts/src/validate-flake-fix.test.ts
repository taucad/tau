import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  annotation,
  evaluate,
  hasTimeoutBudget,
  measure,
  pathKind,
  readChanges,
  summary,
  tokenize,
  validateFlakeFix,
} from '#validate-flake-fix.js';
import type { Change, Classification } from '#validate-flake-fix.js';

const fixtures = resolve(import.meta.dirname, 'fixtures/validate-flake-fix');

/**
 * A fixture is a unified diff whose hunks hold the whole file, so the file before is its context and removed lines
 * and the file after is its context and added lines. `/dev/null` marks an added or deleted file.
 */
const parseDiff = (text: string): Change[] => {
  const changes: Change[] = [];
  let current:
    | {
        path: string;
        before: string[] | undefined;
        after: string[] | undefined;
      }
    | undefined;
  const flush = (): void => {
    if (current !== undefined) {
      changes.push({
        path: current.path,
        ...(current.before === undefined ? {} : { before: current.before.join('\n') }),
        ...(current.after === undefined ? {} : { after: current.after.join('\n') }),
      });
    }
  };
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      flush();
      const from = line.slice(4);
      const to = lines[index + 1]!.slice(4);
      current = {
        path: (to === '/dev/null' ? from : to).replace(/^[ab]\//u, ''),
        before: from === '/dev/null' ? undefined : [],
        after: to === '/dev/null' ? undefined : [],
      };
    } else if (line.startsWith('+++ ') || line.startsWith('@@') || current === undefined) {
      continue;
    } else if (line.startsWith('-')) {
      current.before?.push(line.slice(1));
    } else if (line.startsWith('+')) {
      current.after?.push(line.slice(1));
    } else if (index < lines.length - 1 || line !== '') {
      current.before?.push(line.slice(1));
      current.after?.push(line.slice(1));
    }
  }
  flush();
  return changes;
};

const fixture = (name: string): Change[] => parseDiff(readFileSync(join(fixtures, `${name}.diff`), 'utf8'));

const budget = 'Evidence attached.\n\nTimeout-budget: p99 21.4 s over 300 runs in cpu mode\n';

/** Every fixture, its expected classification and the rules it must raise. */
const cases: ReadonlyArray<{
  readonly name: string;
  readonly classification: Classification;
  readonly rules: readonly string[];
  readonly message?: string;
}> = [
  { name: 'skip', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'only', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'todo', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'fails', classification: 'forbidden', rules: ['disabled-test'] },
  {
    name: 'run-if-false',
    classification: 'forbidden',
    rules: ['disabled-test'],
  },
  { name: 'skip-if', classification: 'forbidden', rules: ['disabled-test'] },
  {
    name: 'describe-skip',
    classification: 'forbidden',
    rules: ['disabled-test'],
  },
  { name: 'xit', classification: 'forbidden', rules: ['disabled-test'] },
  {
    name: 'context-skip',
    classification: 'forbidden',
    rules: ['disabled-test'],
  },
  {
    name: 'option-skip',
    classification: 'forbidden',
    rules: ['disabled-test'],
  },
  {
    name: 'deleted-test',
    classification: 'forbidden',
    rules: ['deleted-test', 'deleted-assertion'],
  },
  {
    name: 'deleted-test-file',
    classification: 'forbidden',
    rules: ['deleted-test'],
  },
  {
    name: 'deleted-assertion',
    classification: 'forbidden',
    rules: ['deleted-assertion'],
  },
  {
    name: 'literal-assertion',
    classification: 'forbidden',
    rules: ['literal-assertion'],
  },
  {
    name: 'raised-test-timeout',
    classification: 'forbidden',
    rules: ['raised-timeout'],
  },
  {
    name: 'raised-test-timeout-option',
    classification: 'forbidden',
    rules: ['raised-timeout'],
  },
  {
    name: 'raised-hook-timeout',
    classification: 'forbidden',
    rules: ['raised-timeout'],
  },
  {
    name: 'raised-test-timeout-config',
    classification: 'forbidden',
    rules: ['test-config', 'raised-timeout'],
  },
  {
    name: 'raised-retry',
    classification: 'forbidden',
    rules: ['raised-retry'],
  },
  {
    name: 'raised-retry',
    classification: 'forbidden',
    rules: ['raised-retry'],
    message: budget,
  },
  {
    name: 'raised-retry-config',
    classification: 'forbidden',
    rules: ['test-config', 'raised-retry'],
  },
  { name: 'fixed-sleep', classification: 'forbidden', rules: ['fixed-sleep'] },
  {
    name: 'fixed-sleep-helper',
    classification: 'forbidden',
    rules: ['fixed-sleep'],
  },
  {
    name: 'fixed-sleep-wait-for-timeout',
    classification: 'forbidden',
    rules: ['fixed-sleep'],
  },
  {
    name: 'quarantine',
    classification: 'forbidden',
    rules: ['protected-path'],
  },
  { name: 'ledger', classification: 'forbidden', rules: ['protected-path'] },
  { name: 'workflow', classification: 'forbidden', rules: ['protected-path'] },
  { name: 'policy', classification: 'forbidden', rules: ['protected-path'] },
  { name: 'validator', classification: 'forbidden', rules: ['protected-path'] },
  {
    name: 'raised-test-timeout',
    classification: 'tolerance',
    rules: ['raised-timeout'],
    message: budget,
  },
  {
    name: 'raised-test-timeout-config',
    classification: 'tolerance',
    rules: ['test-config', 'raised-timeout'],
    message: budget,
  },
  {
    name: 'widened-tolerance',
    classification: 'tolerance',
    rules: ['widened-tolerance'],
  },
  {
    name: 'close-to-digits',
    classification: 'tolerance',
    rules: ['widened-tolerance'],
  },
  {
    name: 'loosened-matcher',
    classification: 'tolerance',
    rules: ['loosened-matcher'],
  },
  {
    name: 'widened-wait',
    classification: 'tolerance',
    rules: ['widened-wait'],
  },
  { name: 'snapshot', classification: 'tolerance', rules: ['snapshot'] },
  { name: 'product', classification: 'product', rules: ['product-code'] },
  { name: 'wait-for-condition', classification: 'test-only', rules: [] },
  { name: 'isolate-state', classification: 'test-only', rules: [] },
  { name: 'comment-mentions', classification: 'test-only', rules: [] },
  { name: 'new-test-file', classification: 'test-only', rules: [] },
  {
    name: 'raised-retry-variable',
    classification: 'forbidden',
    rules: ['test-config', 'raised-retry'],
  },
  { name: 'fake-clock', classification: 'tolerance', rules: ['fake-clock-timer'] },
  { name: 'fake-clock-no-advance', classification: 'forbidden', rules: ['fixed-sleep'] },
  {
    name: 'raised-project-timeout',
    classification: 'forbidden',
    rules: ['test-config', 'raised-timeout'],
  },
  {
    name: 'raised-project-timeout',
    classification: 'tolerance',
    rules: ['test-config', 'raised-timeout'],
    message: budget,
  },
  { name: 'swapped-test-timeouts', classification: 'forbidden', rules: ['raised-timeout'] },
  { name: 'swapped-option-timeouts', classification: 'forbidden', rules: ['raised-timeout'] },
  { name: 'product-option-skip', classification: 'test-only', rules: [] },
  { name: 'option-skip-quoted', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'option-skip-each', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'widened-wait-added-wait', classification: 'tolerance', rules: ['widened-wait'] },
  { name: 'added-wait', classification: 'test-only', rules: [] },
  { name: 'added-close-to', classification: 'test-only', rules: [] },
  { name: 'close-to-digits-moved', classification: 'tolerance', rules: ['widened-tolerance'] },
  { name: 'of-division', classification: 'forbidden', rules: ['deleted-assertion'] },
  { name: 'close-to-receiver', classification: 'tolerance', rules: ['widened-tolerance'] },
  { name: 'reordered-suite-timeouts', classification: 'forbidden', rules: ['raised-timeout'] },
  { name: 'fake-clock-real-timers', classification: 'tolerance', rules: ['fake-clock-timer'] },
  { name: 'ambiguous-wait-reshuffle', classification: 'tolerance', rules: ['widened-wait'] },
  { name: 'swapped-suite-timeouts', classification: 'forbidden', rules: ['raised-timeout'] },
  {
    name: 'swapped-suite-timeouts',
    classification: 'tolerance',
    rules: ['raised-timeout'],
    message: budget,
  },
  { name: 'fake-clock-replaced-timer', classification: 'tolerance', rules: ['fake-clock-timer'] },
  { name: 'replaced-sleep', classification: 'forbidden', rules: ['fixed-sleep'] },
  { name: 'added-condition-wait', classification: 'test-only', rules: [] },
  { name: 'fake-clock-moved-timer', classification: 'tolerance', rules: ['timer-moved'] },
  { name: 'mixed-timers', classification: 'forbidden', rules: ['fixed-sleep'] },
  { name: 'widened-wait-same-condition', classification: 'tolerance', rules: ['widened-wait'] },
  { name: 'widened-wait-new-bounded', classification: 'tolerance', rules: ['widened-wait'] },
  { name: 'moved-assertion', classification: 'forbidden', rules: ['deleted-assertion'] },
  { name: 'moved-skip', classification: 'forbidden', rules: ['disabled-test'] },
  { name: 'moved-sleep', classification: 'forbidden', rules: ['fixed-sleep'] },
  { name: 'moved-test', classification: 'forbidden', rules: ['deleted-test', 'deleted-assertion'] },
];

describe('validateFlakeFix', () => {
  it('should have a case for every fixture', () => {
    const files = readdirSync(fixtures).map((file) => file.replace(/\.diff$/u, ''));
    expect(new Set(cases.map(({ name }) => name))).toEqual(new Set(files));
  });

  it.each(cases)('should class $name as $classification', ({ name, classification, rules, message }) => {
    const verdict = validateFlakeFix(fixture(name), message ?? '');
    expect(verdict.classification).toBe(classification);
    expect([...new Set(verdict.findings.map((finding) => finding.rule))].sort()).toEqual([...rules].sort());
    expect(verdict.label).toBe(classification === 'test-only' ? 'flake:test-only' : 'flake:needs-operator');
  });

  it('should pass the legitimate wait-for-condition fix as test-only', () => {
    const verdict = validateFlakeFix(fixture('wait-for-condition'), '');
    expect(verdict).toEqual({
      classification: 'test-only',
      label: 'flake:test-only',
      findings: [],
      files: [{ path: 'apps/ui/src/boot.test.ts', kind: 'test' }],
    });
  });

  it('should name suite A as the raised timeout when B moves before it and A and B trade values', () => {
    const [finding] = validateFlakeFix(fixture('swapped-suite-timeouts'), budget).findings;
    expect(finding?.message).toContain('raises a test or hook timeout (5000)');
    const { testTimeouts } = measure(fixture('swapped-suite-timeouts')[0]!.after!);
    expect(testTimeouts.map(({ id, value }) => [id, value])).toEqual([
      ['suite:B > test:works', 1000],
      ['suite:A > test:works', 5000],
    ]);
  });

  it('should fail an empty diff', () => {
    expect(validateFlakeFix([], '').classification).toBe('forbidden');
  });

  it('should keep the most severe class when a diff mixes them', () => {
    const changes = [...fixture('product'), ...fixture('widened-tolerance'), ...fixture('fixed-sleep')];
    expect(validateFlakeFix(changes, '').classification).toBe('forbidden');
    expect(validateFlakeFix([...fixture('product'), ...fixture('widened-tolerance')], '').classification).toBe(
      'tolerance',
    );
  });

  it('should treat a rename out of a protected path as protected', () => {
    const verdict = validateFlakeFix(
      [
        {
          path: 'apps/ui/src/q.test.ts',
          previousPath: 'apps/ui/quarantine.json',
          before: '{}',
          after: '{}',
        },
      ],
      '',
    );
    expect(verdict.findings.map((finding) => finding.rule)).toEqual(['protected-path']);
  });

  it.each([
    ['apps/ui/src/boot-check.ts', 'product'],
    ['apps/ui/src/test/boot.ts', 'test'],
    ['apps/ui/src/boot.snap', 'snapshot'],
  ])('should fail a test file renamed to %s (%s) as a deleted test', (path, kind) => {
    const source = "it('a', () => { expect(boot()).toBe(1); });";
    const verdict = validateFlakeFix(
      [{ path, previousPath: 'apps/ui/src/boot.test.ts', before: source, after: source }],
      '',
    );
    expect(verdict.files).toEqual([{ path, kind }]);
    expect(verdict.classification).toBe('forbidden');
    expect(verdict.findings.map((finding) => finding.rule)).toEqual(['deleted-test']);
  });

  it('should let a test file renamed to another test file through', () => {
    const source = "it('a', () => { expect(boot()).toBe(1); });";
    const verdict = validateFlakeFix(
      [{ path: 'apps/ui/src/boot.spec.ts', previousPath: 'apps/ui/src/boot.test.ts', before: source, after: source }],
      '',
    );
    expect(verdict.classification).toBe('test-only');
  });

  it('should let a new snapshot and a deleted test helper through', () => {
    const verdict = validateFlakeFix(
      [
        {
          path: 'apps/ui/src/__snapshots__/new.test.ts.snap',
          after: 'exports[`a`] = `1`;',
        },
        { path: 'apps/ui/src/test/helpers.ts', before: 'export const a = 1;' },
        { path: 'apps/ui/src/test/data.json', before: '{}', after: '{"a":1}' },
      ],
      '',
    );
    expect(verdict.classification).toBe('test-only');
  });
});

describe('pathKind', () => {
  it.each([
    ['apps/ui/src/boot.test.ts', 'test'],
    ['apps/ui/src/boot.spec.tsx', 'test'],
    ['apps/ui-e2e/src/journeys/editor.ts', 'test'],
    ['libs/fs-bridge/src/test/fake-host.ts', 'test'],
    ['libs/fs-bridge/fixtures/tree.json', 'test'],
    ['apps/ui/src/__snapshots__/boot.test.ts.snap', 'snapshot'],
    ['apps/ui-e2e/vitest.config.ts', 'config'],
    ['apps/ui/vitest.browser.config.mts', 'config'],
    ['apps/ui/src/boot.ts', 'product'],
    ['pnpm-lock.yaml', 'product'],
    ['apps/ui/quarantine.json', 'protected'],
    ['scripts/src/flake-ledger.json', 'protected'],
    ['scripts/src/ci-flake-ledger.ts', 'protected'],
    ['scripts/src/ci-queue-health.ts', 'protected'],
    ['scripts/src/validate-expected-failures.ts', 'protected'],
    ['scripts/src/validate-flake-fix.test.ts', 'protected'],
    ['libs/vitest-outcomes-reporter/src/index.ts', 'protected'],
    ['tools/vitest-ci/src/index.ts', 'protected'],
    ['tools/vitest-ci/package.json', 'protected'],
    ['scripts/src/ci-flake-ledger-store.ts', 'protected'],
    ['scripts/src/ci-shadow-rows.ts', 'protected'],
    ['scripts/src/ci-shadow-rows-promote-cli.ts', 'protected'],
    ['scripts/src/flake-repro-cli.ts', 'protected'],
    ['scripts/src/burn-in.ts', 'protected'],
    ['scripts/src/burn-in-cli.test.ts', 'protected'],
    ['scripts/src/timing-budget-report.ts', 'protected'],
    ['scripts/src/timing-budgets-workflow.test.ts', 'protected'],
    ['apps/api/test/quarantine.json', 'protected'],
    ['.github/workflows/flake-ledger.yml', 'protected'],
    ['.github/workflows/timing-budgets.yml', 'protected'],
    ['docs/policy/flake-policy.md', 'protected'],
    ['.github/workflows/flake-repro.yml', 'protected'],
    ['.github/actions/setup-nx/action.yml', 'protected'],
    ['.github/CODEOWNERS', 'protected'],
    ['docs/policy/testing-policy.md', 'protected'],
    ['apps/ui/AGENTS.md', 'protected'],
    ['.agents/skills/flake-fix/SKILL.md', 'protected'],
  ])('should class %s as %s', (path, kind) => {
    expect(pathKind(path)).toBe(kind);
  });
});

describe('measure', () => {
  it('should ignore comments, strings, templates and regular expressions', () => {
    const source = [
      '// it.skip("x", () => {}); sleep(1);',
      '/* expect(a).toBe(b); */',
      'const text = \'it.only("x")\';',
      // oxlint-disable-next-line no-template-curly-in-string -- the source under test holds a template literal
      'const template = `setTimeout(${count}, 5)`;',
      String.raw`const pattern = /it\.skip\(/u;`,
      'const ratio = total / 2 / 3;',
    ].join('\n');
    const measures = measure(source);
    expect(measures).toMatchObject({
      disabled: {},
      tests: 0,
      assertions: 0,
      sleeps: 0,
    });
  });

  it('should read calls inside template substitutions', () => {
    // oxlint-disable-next-line no-template-curly-in-string -- the source under test holds a template literal
    expect(measure('const a = `${await sleep(5)}`;').sleeps).toBe(1);
  });

  it('should count chained matchers once per assertion and ignore asymmetric matchers', () => {
    const measures = measure(
      'expect(a).not.toBe(1); expect(b).toEqual({ id: expect.any(String) }); expect.soft(c).resolves.toBe(2); assert.equal(d, 1);',
    );
    expect(measures.assertions).toBe(4);
    expect(measures.strict).toBe(3);
    expect(measures.loose).toBe(1);
  });

  it('should class timeouts by where they stand', () => {
    const measures = measure(
      [
        "it('a', { timeout: 100 }, () => {});",
        "test('b', () => {}, 200);",
        'afterAll(() => {}, 300);',
        'vi.setConfig({ testTimeout: 400 });',
        'await vi.waitFor(check, 500);',
        'await page.waitForSelector(selector, { timeout: 600 });',
        'const BOOT_TIMEOUT_MS = 700;',
        'const retries = 2;',
        'const options = { retry: { count: 1 } };',
      ].join('\n'),
    );
    expect(measures.testTimeouts.map((binding) => binding.value)).toEqual([200, 300, 100, 400]);
    expect(measures.waitTimeouts.map((binding) => binding.value)).toEqual([500, 600]);
    expect(measures.timeoutConstants.map((binding) => binding.value)).toEqual([700]);
    expect(measures.retries.map((binding) => binding.text)).toEqual(['2', '{ count : 1 }']);
  });

  it('should count a numeric wait() as a sleep and a condition wait() as none', () => {
    expect(measure('await wait(100); await wait(() => ready);').sleeps).toBe(1);
  });
});

describe('tokenize and evaluate', () => {
  it.each([
    ['const q = of / 2; expect(r).toBe(q);', 'punct'],
    ['const q = a.return / 2; expect(r).toBe(q);', 'punct'],
    ['return /x/u.test(s);', 'regex'],
    ['for (const line of /x/u.exec(s)) {}', 'regex'],
  ])('should read the slash in %j as %s', (source, type) => {
    expect(tokenize(source).find((token) => token.value.startsWith('/'))?.type).toBe(type);
  });

  it('should keep an unterminated literal from swallowing the file silently', () => {
    expect(tokenize("const a = 'open\nconst b = 1;").at(-2)).toEqual({
      type: 'number',
      value: '1',
    });
    expect(tokenize('const t = `open').at(-1)).toEqual({
      type: 'string',
      value: 'open',
    });
    expect(tokenize('/* open').length).toBe(0);
  });

  it.each([
    ['30 * 1_000', 30_000],
    ['-1', -1],
    ['(1 + 2) * 3 - 4 / 2', 7],
    ['0x10', 16],
    ['0b11', 3],
    ['0o10', 8],
    ['1e3', 1000],
    ['10n', 10],
    ['a', undefined],
    ['1 +', undefined],
    ['(1', undefined],
    ['1 / 0', undefined],
    ['{ count : 1 }', undefined],
  ])('should evaluate %s as %s', (source, value) => {
    expect(evaluate(tokenize(source))).toBe(value);
  });
});

describe('hasTimeoutBudget', () => {
  it.each([
    ['Timeout-budget: p99 21.4 s over 300 runs', true],
    ['- timeout-budget: measured p99 = 12000 ms', true],
    ['Timeout-budget: generous', false],
    ['The Timeout-budget: p99 is unknown', false],
    ['Timeout-budget: 125 ms (p99)', true],
    ['Timeout-budget: p99: 1,5 s', true],
    ['Timeout-budget: p99 not measured; see issue 42', false],
    ['Timeout-budget: p99 over 300 runs', false],
    ['Timeout-budget: p99\n125 ms is the default timeout', false],
    ['Timeout-budget: 125\nms (p99)', false],
    ['Timeout-budget: see below\np99 21.4 s', false],
    ['Notes\nTimeout-budget: p99 21.4 s\nmore', true],
    ['', false],
  ])('should read %j as %s', (message, expected) => {
    expect(hasTimeoutBudget(message)).toBe(expected);
  });
});

describe('annotation', () => {
  it('should escape the path as a property and the message as data', () => {
    expect(
      annotation({
        rule: 'deleted-test',
        severity: 'forbidden',
        path: 'apps/ui/src/boot,slow:1%.test.ts',
        message: 'line one\n::error::injected 100%',
      }),
    ).toBe(
      '::error file=apps/ui/src/boot%2Cslow%3A1%25.test.ts,title=validate-flake-fix deleted-test::line one%0A::error::injected 100%25',
    );
  });
});

describe('summary', () => {
  it('should table the classification, findings and files', () => {
    const text = summary(validateFlakeFix(fixture('skip'), ''));
    expect(text).toContain('Classification: **forbidden**, label `flake:needs-operator`.');
    expect(text).toContain('| forbidden | disabled-test | `apps/ui/src/boot.test.ts` |');
    expect(text).toContain('| `apps/ui/src/boot.test.ts` | test |');
  });
});

describe('readChanges and the CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'validate-flake-fix-'));
  const script = resolve(import.meta.dirname, 'validate-flake-fix.ts');
  const run = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const cli = (
    ...args: string[]
  ): {
    status: number;
    stdout: string;
    output: string;
    summaryText: string;
  } => {
    const output = join(root, '..', `${root.split('/').at(-1)!}-output`);
    const summaryFile = `${output}-summary`;
    writeFileSync(output, '');
    writeFileSync(summaryFile, '');
    try {
      const stdout = execFileSync(process.execPath, [script, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: Object.fromEntries([
          ...Object.entries(process.env),
          ['GITHUB_OUTPUT', output],
          ['GITHUB_STEP_SUMMARY', summaryFile],
        ]),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {
        status: 0,
        stdout,
        output: readFileSync(output, 'utf8'),
        summaryText: readFileSync(summaryFile, 'utf8'),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string };
      return {
        status: failed.status,
        stdout: failed.stdout,
        output: readFileSync(output, 'utf8'),
        summaryText: readFileSync(summaryFile, 'utf8'),
      };
    } finally {
      rmSync(output, { force: true });
      rmSync(summaryFile, { force: true });
    }
  };

  const [legit] = fixture('wait-for-condition');
  run('init', '--quiet', '--initial-branch=main');
  write(legit!.path, legit!.before!);
  write('apps/ui/src/old.test.ts', "it('a', () => { expect(1 + a).toBe(2); });\n");
  run('add', '.');
  run('commit', '--quiet', '-m', 'base');
  run('checkout', '--quiet', '-b', 'flake/2787');
  write(legit!.path, legit!.after!);
  run('mv', 'apps/ui/src/old.test.ts', 'apps/ui/src/renamed.test.ts');
  run('commit', '--quiet', '-am', 'fix(ui): Await the worker instead of sleeping\n\nTimeout-budget: p99 1.2 s');
  run('checkout', '--quiet', 'main');
  write('apps/ui/src/later.ts', 'export const later = 1;\n');
  run('add', '.');
  run('commit', '--quiet', '-m', 'unrelated change on main');
  run('checkout', '--quiet', '-b', 'flake/2788', 'flake/2787');
  write('apps/ui/src/boot.test.ts', `${legit!.after!}\nit.skip('later', () => {});\n`);
  run('commit', '--quiet', '-am', 'skip it');
  const [timeout] = fixture('raised-test-timeout');
  run('checkout', '--quiet', '-b', 'flake/2789', 'main');
  write(timeout!.path, timeout!.before!);
  run('add', '.');
  run('commit', '--quiet', '-m', 'test(ui): Add the boot test');
  run('checkout', '--quiet', '-b', 'flake/2790');
  write(timeout!.path, timeout!.after!);
  run('commit', '--quiet', '-am', 'test(ui): Give the boot test more time');

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('should diff against the merge base, pair renames and read commit messages', () => {
    const { changes, messages } = (() => {
      const cwd = process.cwd();
      process.chdir(root);
      try {
        return readChanges('main', 'flake/2787');
      } finally {
        process.chdir(cwd);
      }
    })();
    expect(changes.map(({ path, previousPath }) => ({ path, previousPath }))).toEqual([
      { path: 'apps/ui/src/boot.test.ts', previousPath: undefined },
      {
        path: 'apps/ui/src/renamed.test.ts',
        previousPath: 'apps/ui/src/old.test.ts',
      },
    ]);
    expect(messages).toContain('Timeout-budget: p99 1.2 s');
  });

  it('should pass a test-only fix and write its outputs', () => {
    const result = cli('--base', 'main', '--head', 'flake/2787');
    expect(result.status).toBe(0);
    expect(result.output).toBe('classification=test-only\nlabel=flake:test-only\n');
    expect(result.summaryText).toContain('Classification: **test-only**');
  });

  it('should fail a forbidden fix with an annotation, and read the pull-request body', () => {
    const body = join(root, '..', `${root.split('/').at(-1)!}-body`);
    writeFileSync(body, 'Timeout-budget: p99 3 s');
    const result = cli('--base', 'main', '--head', 'flake/2788', '--message-file', body);
    rmSync(body);
    expect(result.status).toBe(1);
    expect(result.output).toBe('classification=forbidden\nlabel=flake:needs-operator\n');
    expect(result.stdout).toContain('::error file=apps/ui/src/boot.test.ts,title=validate-flake-fix disabled-test::');
  });

  it('should take the timeout budget from the pull-request body alone', () => {
    const body = join(root, '..', `${root.split('/').at(-1)!}-budget`);
    writeFileSync(body, 'Timeout-budget: p99 21.4 s over 300 runs');
    const withoutBody = cli('--base', 'flake/2789', '--head', 'flake/2790');
    const withBody = cli('--base', 'flake/2789', '--head', 'flake/2790', '--message-file', body);
    rmSync(body);
    expect(withoutBody.status).toBe(1);
    expect(withoutBody.output).toBe('classification=forbidden\nlabel=flake:needs-operator\n');
    expect(withBody.status).toBe(0);
    expect(withBody.output).toBe('classification=tolerance\nlabel=flake:needs-operator\n');
    expect(withBody.stdout).toContain(
      '::warning file=apps/ui/src/boot.test.ts,title=validate-flake-fix raised-timeout::',
    );
  });

  it('should exit 2 on bad usage or an unreadable diff or message file', () => {
    expect(cli('--base', 'main').status).toBe(2);
    expect(cli('--base', 'main', '--head', 'no-such-ref').status).toBe(2);
    expect(cli('--base', 'main', '--head', 'flake/2787', '--message-file').status).toBe(2);
    expect(cli('--base', 'main', '--head', 'flake/2787', '--message-file', '--base').status).toBe(2);
    expect(cli('--base', 'main', '--head', 'flake/2787', '--message-file', join(root, 'no-such-body')).status).toBe(2);
  });
});
