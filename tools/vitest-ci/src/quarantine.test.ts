import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { QuarantineEntry } from '#quarantine.js';
import {
  dayNumber,
  entryKey,
  entryProblems,
  neverQuarantineArea,
  parseQuarantine,
  quarantineBounds,
  quarantineClasses,
  quarantineOperatingSystems,
  readQuarantine,
  splitTest,
  utcDay,
  variantCovers,
} from '#quarantine.js';

const today = '2026-12-01';
const context = { projectRoot: 'packages/host' };

const entry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  test: 'src/run.test.ts > run > settles once',
  owner: 'rifont',
  issue: 2787,
  class: 'race',
  created: '2026-11-25',
  expires: '2026-12-09',
  evidence: '2 flake events in 61 executions; runs 1, 2',
  ...overrides,
});

describe('splitTest', () => {
  it('splits the file from the full name and refuses a bare file or an empty name', () => {
    expect(splitTest('src/a.test.ts > suite > title')).toEqual({ file: 'src/a.test.ts', name: 'suite > title' });
    expect(splitTest('src/a.test.ts')).toBeUndefined();
    expect(splitTest(' > title')).toBeUndefined();
    expect(splitTest('src/a.test.ts >  ')).toBeUndefined();
  });
});

describe('dayNumber and utcDay', () => {
  it('reads a real calendar day and refuses anything else', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-02-30')).toBeUndefined();
    expect(dayNumber('2026-2-3')).toBeUndefined();
    expect(dayNumber(20_261_201)).toBeUndefined();
  });

  it('formats the UTC day', () => {
    expect(utcDay(new Date('2026-12-01T23:59:59Z'))).toBe('2026-12-01');
    expect(utcDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('neverQuarantineArea', () => {
  it.each([
    ['packages/revisions/src/object-store/object-store.integrity.test.ts', 'data integrity'],
    ['apps/libs/api-billing/src/testing/billing-foundation.test.ts', 'money (billing)'],
    ['apps/libs/api-billing/src/credit-operation-oracle.test.ts', 'money (billing)'],
    ['apps/libs/api-git-mirror/src/maintenance/lfs-integrity.test.ts', 'data integrity'],
    ['apps/libs/api-auth/src/session.test.ts', 'security boundary'],
    ['apps/ui/app/lib/content-security-policy.server.test.ts', 'security boundary'],
    ['libs/sandbox/src/shell/shell.test.ts', 'security boundary'],
    ['packages/agent-host/src/log/chat-ledger.differential.test.ts', 'money (billing)'],
    ['apps/ui/app/workbench-records/record-sync.machine.conformance.test.ts', 'formal model'],
    ['libs/fs-bridge/src/filesystem-bridge-conformance.test.ts', 'formal model'],
    ['apps/ui/specs/message-queue/message-queue.conformance.test.ts', 'formal model'],
    ['tools/formal/src/check.test.ts', 'formal model'],
  ])('puts %s in the %s area', (path, area) => {
    expect(neverQuarantineArea(path)).toBe(area);
  });

  it('leaves ordinary tests out, matching whole words only', () => {
    expect(neverQuarantineArea('packages/host/src/service-worker-boot.test.ts')).toBeUndefined();
    expect(neverQuarantineArea('packages/cad/src/authoring.test.ts')).toBeUndefined();
    expect(neverQuarantineArea('apps/ui/app/cleanup.test.ts')).toBeUndefined();
  });

  it('puts every test of a money or security project tag in the set', () => {
    expect(neverQuarantineArea('apps/libs/payments-ui/src/a.test.ts', ['scope:ui'])).toBe('money (billing)');
    expect(neverQuarantineArea('apps/libs/x/src/a.test.ts', ['scope:api', 'api:auth'])).toBe('security boundary');
    expect(neverQuarantineArea('apps/libs/x/src/a.test.ts', ['scope:ui', 'ui:billing-ui'])).toBe('money (billing)');
  });
});

describe('parseQuarantine', () => {
  it('returns the raw entries of a well-formed file', () => {
    expect(parseQuarantine('{"$schema": "x", "entries": [1]}')).toEqual({ entries: [1], problems: [] });
  });

  it('honours no entry of a malformed file', () => {
    expect(parseQuarantine('{').problems[0]).toMatch(/^not JSON: /);
    expect(parseQuarantine('[]').problems).toEqual(['the top level must be an object with an "entries" array']);
    expect(parseQuarantine('{"entries": {}}').entries).toEqual([]);
    expect(parseQuarantine('{"entries": [], "projects": []}').problems).toEqual(['unknown top-level keys: projects']);
  });
});

describe('entryProblems', () => {
  it('accepts a valid entry, with or without a variant, and a renewal up to 28 days', () => {
    expect(entryProblems(entry(), context, today)).toEqual([]);
    expect(
      entryProblems(entry({ variant: { browser: 'chromium', os: 'linux', target: 'test:e2e' } }), context, today),
    ).toEqual([]);
    expect(
      entryProblems(entry({ expires: '2026-12-23', renewal: { by: 'rifont', on: '2026-12-01' } }), context, today),
    ).toEqual([]);
    expect(entryProblems(entry(), { projectRoot: '' }, today)).toEqual([]);
  });

  it('refuses anything but an object', () => {
    expect(entryProblems('x', context, today)).toEqual(['an entry must be an object']);
  });

  it('scopes to one test, never a file, a suite or a project', () => {
    expect(entryProblems(entry({ test: 'src/run.test.ts' }), context, today)).toContain(
      '"test" must be "<file> > <suite> > … > <title>": one test, never a file',
    );
    expect(entryProblems(entry({ test: 7 }), context, today)).toHaveLength(1);
    for (const test of ['/src/run.test.ts > a', './src/run.test.ts > a', '../x/run.test.ts > a']) {
      expect(entryProblems(entry({ test }), context, today)).toEqual([
        'the file in "test" is relative to the project root, without "./" or ".."',
      ]);
    }
    expect(entryProblems(entry({ variant: { file: 'x', suite: 'y' } }), context, today)).toEqual([
      '"variant" may narrow only by browser, os or target, never file, suite (a file, a suite or a project is never a variant)',
    ]);
  });

  it('checks the variant keys and values', () => {
    expect(entryProblems(entry({ variant: 'chromium' }), context, today)).toEqual([
      '"variant" must be an object of browser, os and target',
    ]);
    expect(entryProblems(entry({ variant: {} }), context, today)).toEqual([
      '"variant" is empty; leave it out to quarantine every variant',
    ]);
    expect(entryProblems(entry({ variant: { browser: '', target: 3, os: 'macos' } }), context, today)).toEqual([
      '"variant.browser" must be a non-empty string',
      '"variant.target" must be a non-empty string',
      `"variant.os" must be one of ${quarantineOperatingSystems.join(', ')}`,
    ]);
    expect(entryProblems(entry({ variant: { target: 'test:shard-2' } }), context, today)).toEqual([
      '"variant.target" names the target without its :shard-<n> suffix',
    ]);
  });

  it('requires the owner, the issue, the class and the evidence', () => {
    expect(
      entryProblems(
        entry({ owner: '@rifont', issue: 0, class: 'infrastructure', evidence: ' ', extra: 1 }),
        context,
        today,
      ),
    ).toEqual([
      'unknown keys: extra',
      '"owner" must be a GitHub login, without "@"',
      '"issue" must be the owner issue number',
      `"class" must be one of ${quarantineClasses.join(', ')}`,
      '"evidence" must state the flake events and their runs',
    ]);
    expect(entryProblems(entry({ owner: undefined, issue: 2.5 }), context, today)).toEqual([
      '"owner" must be a GitHub login, without "@"',
      '"issue" must be the owner issue number',
    ]);
  });

  it('rejects a test in the never-quarantine set, by path or by project tag', () => {
    expect(
      entryProblems(
        entry({ test: 'src/object-store/object-store.integrity.test.ts > pack > keeps every object' }),
        { projectRoot: 'packages/revisions' },
        today,
      ),
    ).toEqual([
      'packages/revisions/src/object-store/object-store.integrity.test.ts is in the never-quarantine set (data integrity): it always gates (testing policy § 16.4)',
    ]);
    expect(entryProblems(entry(), { projectRoot: 'apps/libs/x', tags: ['api:billing'] }, today)).toHaveLength(1);
  });

  it('holds an entry at most 14 days, or 28 after the one operator renewal', () => {
    expect(entryProblems(entry({ expires: '2026-12-10' }), context, today)).toEqual([
      `"expires" is 15 days after "created"; an entry holds at most ${quarantineBounds.maximumAgeDays} days without the one operator renewal`,
    ]);
    expect(
      entryProblems(entry({ expires: '2026-12-24', renewal: { by: 'rifont', on: '2026-12-01' } }), context, today),
    ).toEqual([
      `"expires" is 29 days after "created"; one renewal allows ${quarantineBounds.maximumRenewedAgeDays} in all, and a second renewal is not allowed`,
    ]);
    expect(entryProblems(entry({ expires: '2026-11-25' }), context, today)).toContain(
      '"expires" must be after "created"',
    );
  });

  it('checks the renewal itself', () => {
    expect(entryProblems(entry({ renewal: 'yes' }), context, today)).toEqual([
      '"renewal" must be an object { by, on }',
    ]);
    expect(entryProblems(entry({ renewal: { by: '@x', on: 'soon', why: 1 } }), context, today)).toEqual([
      'unknown "renewal" keys: why',
      '"renewal.by" must be the renewing operator\'s GitHub login, without "@"',
      '"renewal.on" must be a calendar day, YYYY-MM-DD',
    ]);
    for (const on of ['2026-11-24', '2026-12-02']) {
      expect(entryProblems(entry({ renewal: { by: 'rifont', on } }), context, today)).toEqual([
        '"renewal.on" must fall between "created" and today',
      ]);
    }
    expect(entryProblems(entry({ created: 'x', renewal: { by: 'rifont', on: '2026-11-01' } }), context, today)).toEqual(
      ['"created" must be a calendar day, YYYY-MM-DD'],
    );
  });

  it('fails an expired entry and one dated in the future or not dated at all', () => {
    expect(entryProblems(entry(), context, '2026-12-09')).toEqual([]);
    expect(entryProblems(entry(), context, '2026-12-10')).toEqual([
      'expired on 2026-12-09: the test gates again; remove the entry',
    ]);
    expect(entryProblems(entry(), context, '2026-11-24')).toEqual(['"created" (2026-11-25) is in the future']);
    expect(entryProblems(entry({ created: undefined, expires: '2026-13-01' }), context, today)).toEqual([
      '"created" must be a calendar day, YYYY-MM-DD',
      '"expires" must be a calendar day, YYYY-MM-DD',
    ]);
  });

  it('dates against the current day when today is malformed', () => {
    expect(entryProblems(entry({ created: '2020-01-01', expires: '2020-01-10' }), context, 'today')).toEqual([
      'expired on 2020-01-10: the test gates again; remove the entry',
    ]);
  });
});

describe('variantCovers and entryKey', () => {
  const execution = { browser: 'chromium', os: 'linux', target: 'test' };

  it('applies an entry when every key it names matches', () => {
    expect(variantCovers(undefined, execution)).toBe(true);
    expect(variantCovers({ browser: 'chromium', os: 'linux', target: 'test' }, execution)).toBe(true);
    expect(variantCovers({ browser: 'firefox' }, execution)).toBe(false);
    expect(variantCovers({ os: 'darwin' }, execution)).toBe(false);
    expect(variantCovers({ target: 'test:e2e' }, execution)).toBe(false);
  });

  it('keys an entry by its test and variant', () => {
    const base = entry() as QuarantineEntry;
    expect(entryKey(base)).toBe(JSON.stringify([base.test, null, null, null]));
    expect(entryKey({ ...base, variant: { os: 'win32' } })).toBe(JSON.stringify([base.test, null, 'win32', null]));
  });
});

describe('readQuarantine', () => {
  it('keeps the valid entries and drops each broken or duplicate one with its problems', () => {
    const text = JSON.stringify({
      entries: [entry(), entry({ issue: -1 }), entry(), entry({ variant: { browser: 'firefox' } }), 'nonsense'],
    });
    const { entries, problems } = readQuarantine(text, context, today);
    expect(entries).toHaveLength(2);
    expect(problems).toEqual([
      'entries[1] (src/run.test.ts > run > settles once): "issue" must be the owner issue number',
      'entries[2] (src/run.test.ts > run > settles once): duplicates an earlier entry for the same test and variant',
      'entries[4]: an entry must be an object',
    ]);
    expect(readQuarantine('{', context, today).entries).toEqual([]);
  });
});

describe('quarantine.schema.json', () => {
  type SchemaProperty = { enum?: unknown[]; properties?: Record<string, SchemaProperty> };
  const schema = JSON.parse(readFileSync(join(dirname(import.meta.dirname), 'quarantine.schema.json'), 'utf8')) as {
    properties: {
      entries: { maxItems: number; items: { required: string[]; properties: Record<string, SchemaProperty> } };
    };
  };
  const item = schema.properties.entries.items;

  it('agrees with the rules the reporter and the validator apply', () => {
    expect(schema.properties.entries.maxItems).toBe(quarantineBounds.projectEntries);
    expect(item.required.toSorted()).toEqual(['class', 'created', 'evidence', 'expires', 'issue', 'owner', 'test']);
    expect(Object.keys(item.properties).toSorted()).toEqual([
      'class',
      'created',
      'evidence',
      'expires',
      'issue',
      'owner',
      'renewal',
      'test',
      'variant',
    ]);
    expect(item.properties['class']?.enum).toEqual([...quarantineClasses]);
    const variant = item.properties['variant']?.properties ?? {};
    expect(Object.keys(variant).toSorted()).toEqual(['browser', 'os', 'target']);
    expect(variant['os']?.enum).toEqual([...quarantineOperatingSystems]);
  });
});
