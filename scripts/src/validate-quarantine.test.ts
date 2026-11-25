import { describe, expect, it } from 'vitest';

import type { QuarantineSource } from '#validate-quarantine.js';
import { quarantineProblems, resolvesTest, testLiterals } from '#validate-quarantine.js';

const today = '2026-12-01';

const testFile = [
  "import { describe, expect, it } from 'vitest';",
  '// it\'s a comment with an apostrophe and a "quote"',
  "describe('run', () => {",
  "  it('settles once', () => expect(1).toBe(1));",
  '  test.concurrent("isn\'t shy", () => {});',
  '  it.each([1, 2])(`handles case %i`, () => {});',
  "  it(`retries ${'twice'} at most`, () => {});",
  "  describe.each(['a'])('variant %s', () => {",
  "    it('works', () => {});",
  '  });',
  "  /* it('commented out') */",
  "  const label = 'not a title';",
  '});',
].join('\n');

const files: Record<string, string> = {
  'packages/host/src/run.test.ts': testFile,
  'packages/revisions/src/object-store/object-store.integrity.test.ts': "it('keeps every object', () => {});",
};

const readTracked = (path: string): string | undefined => files[path];

const entry = (test: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  test,
  owner: 'rifont',
  issue: 2787,
  class: 'race',
  created: '2026-11-25',
  expires: '2026-12-09',
  evidence: '2 flake events in 61 executions',
  ...overrides,
});

const source = (root: string, entries: unknown[], tags: string[] = []): QuarantineSource => ({
  path: `${root}/quarantine.json`,
  project: { name: root.split('/').at(-1) ?? root, root, tags },
  text: JSON.stringify({ entries }),
});

describe('testLiterals and resolvesTest', () => {
  const literals = testLiterals(testFile);

  it('reads literals outside comments and marks the titles of it and test calls', () => {
    const titles = literals.filter((literal) => literal.title).map((literal) => literal.text);
    expect(titles).toEqual(['settles once', "isn't shy", 'handles case %i', "retries ${'twice'} at most", 'works']);
    expect(literals.map((literal) => literal.text)).not.toContain('commented out');
    expect(literals.map((literal) => literal.text)).toContain('not a title');
  });

  it.each([
    ['run > settles once', true],
    ["run > isn't shy", true],
    ['run > handles case 2', true],
    ['run > retries twice at most', true],
    ['run > variant a > works', true],
    ['run > settles twice', false],
    ['run', false],
    ['run > not a title', false],
    ['other > settles once', false],
  ])('resolves "%s": %s', (name, expected) => {
    expect(resolvesTest(literals, name)).toBe(expected);
  });

  it('joins segments when a literal holds the separator', () => {
    expect(resolvesTest(testLiterals("it('a > b', () => {});"), 'a > b')).toBe(true);
  });

  it('unescapes literals and survives an unterminated string or comment', () => {
    expect(testLiterals(String.raw`it('tab\there A\u{42}\x43 \'q\'', () => {});`)[0]?.text).toBe("tab\there ABC 'q'");
    expect(testLiterals("it('a', () => {}); /* open").map((literal) => literal.text)).toEqual(['a']);
    expect(testLiterals("it('open").map((literal) => literal.text)).toEqual(['open']);
    expect(testLiterals('const a = 1; // tail').length).toBe(0);
    expect(testLiterals('it(`x ${`y ${"}"} z`} w`)')[0]?.title).toBe(true);
  });
});

describe('quarantineProblems', () => {
  it('accepts a valid entry for a test that exists', () => {
    expect(
      quarantineProblems(
        [source('packages/host', [entry('src/run.test.ts > run > settles once')])],
        readTracked,
        today,
      ),
    ).toEqual([]);
  });

  it('fails an entry for a missing test, a missing file and a suite', () => {
    expect(
      quarantineProblems(
        [
          source('packages/host', [
            entry('src/run.test.ts > run > settles twice'),
            entry('src/gone.test.ts > run > settles once'),
            entry('src/run.test.ts > run'),
          ]),
        ],
        readTracked,
        today,
      ),
    ).toEqual([
      'packages/host/quarantine.json: "src/run.test.ts > run > settles twice" resolves to no test in packages/host/src/run.test.ts: each suite and the title must be literals of the file, the title an it or test call\'s',
      'packages/host/quarantine.json: "src/gone.test.ts > run > settles once": packages/host/src/gone.test.ts is not a tracked file of host',
      'packages/host/quarantine.json: "src/run.test.ts > run" resolves to no test in packages/host/src/run.test.ts: each suite and the title must be literals of the file, the title an it or test call\'s',
    ]);
  });

  it('rejects the never-quarantine set: object-store.integrity', () => {
    expect(
      quarantineProblems(
        [source('packages/revisions', [entry('src/object-store/object-store.integrity.test.ts > keeps every object')])],
        readTracked,
        today,
      ),
    ).toEqual([
      'packages/revisions/quarantine.json: entries[0] (src/object-store/object-store.integrity.test.ts > keeps every object): packages/revisions/src/object-store/object-store.integrity.test.ts is in the never-quarantine set (data integrity): it always gates (testing policy § 16.4)',
    ]);
  });

  it('fails an expired entry and a second renewal', () => {
    const problems = quarantineProblems(
      [
        source('packages/host', [
          entry('src/run.test.ts > run > settles once', { created: '2026-11-01', expires: '2026-11-15' }),
          entry("src/run.test.ts > run > isn't shy", {
            created: '2026-11-01',
            expires: '2026-12-10',
            renewal: { by: 'rifont', on: '2026-11-14' },
          }),
        ]),
      ],
      readTracked,
      today,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('expired on 2026-11-15: the test gates again; remove the entry');
    expect(problems[1]).toContain('a second renewal is not allowed');
  });

  it('caps a project at 8 entries and the workspace at 20: a twenty-first entry fails', () => {
    const titles = ['run > settles once', "run > isn't shy", 'run > handles case 1', 'run > variant a > works'];
    const entries = (count: number): Array<Record<string, unknown>> =>
      Array.from({ length: count }, (_, index) =>
        entry(`src/run.test.ts > ${titles[index % titles.length] ?? ''}`, {
          variant: { target: `test:lane-${String(index)}` },
        }),
      );
    const projects = (counts: number[]): QuarantineSource[] =>
      counts.map((count, index) => source(`packages/host${index === 0 ? '' : `-${String(index)}`}`, entries(count)));
    for (const index of [1, 2, 3]) {
      files[`packages/host-${String(index)}/src/run.test.ts`] = testFile;
    }

    expect(quarantineProblems(projects([8, 8, 4]), readTracked, today)).toEqual([]);
    expect(quarantineProblems(projects([8, 8, 4, 1]), readTracked, today)).toEqual([
      'the workspace holds 21 quarantine entries; at most 20 (the debt is full: no new quarantine)',
    ]);
    expect(quarantineProblems(projects([9]), readTracked, today)).toEqual([
      'packages/host/quarantine.json: 9 entries; a project holds at most 8 (no new quarantine: fix one first)',
    ]);
  });

  it('requires the file at a project root and resolves files at the workspace root', () => {
    expect(
      quarantineProblems(
        [{ path: 'misc/quarantine.json', project: undefined, text: '{"entries": []}' }],
        readTracked,
        today,
      ),
    ).toEqual(['misc/quarantine.json: a quarantine.json sits at the root of the Nx project that owns the test']);
    files['run.test.ts'] = testFile;
    expect(
      quarantineProblems(
        [
          {
            path: 'quarantine.json',
            project: { name: 'root', root: '', tags: [] },
            text: JSON.stringify({ entries: [entry('run.test.ts > run > never written')] }),
          },
        ],
        readTracked,
        today,
      ),
    ).toEqual([
      'quarantine.json: "run.test.ts > run > never written" resolves to no test in run.test.ts: each suite and the title must be literals of the file, the title an it or test call\'s',
    ]);
  });
});
