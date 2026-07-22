/* eslint-disable @typescript-eslint/naming-convention -- Tests assert the serialized recovery schema. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  atomicWriteClean,
  canonicalJson,
  canonicalJsonl,
  collisionSafePlanFilename,
  createSourceBaseline,
  dispatchBackupPayload,
  readConversationSearchRecords,
  redactSensitiveText,
  recoverPlanArchive,
  resolveSymbolicLocator,
  runCursorHistoryRecovery,
  scanSensitiveText,
  selectContentChangeRange,
  selectLastContentChange,
  sha256,
  sha256File,
  symbolicLocator,
  validateCommittedOutputs,
  validateCoverageCounts,
  verifySourceBaseline,
  writeConversationSearchClassificationUnits,
} from '#cursor-history-recovery.js';

let fixtureRoot = '';

const writeFixture = (path: string, content: string): string => {
  const target = join(fixtureRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
};

describe('cursor history recovery', () => {
  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'tau-cursor-history-'));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = '';
  });

  it('should serialize canonical JSON and JSONL deterministically', () => {
    const first = { z: 1, a: { y: undefined, x: [2, undefined, Number.NaN] } };
    const second = { a: { x: [2, undefined, Number.NaN], y: undefined }, z: 1 };

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalJson(first)).toBe(
      '{\n  "a": {\n    "x": [\n      2,\n      null,\n      null\n    ]\n  },\n  "z": 1\n}\n',
    );
    expect(canonicalJsonl([{ z: 1, a: 2 }, { b: 3 }])).toBe('{"a":2,"z":1}\n{"b":3}\n');
    expect(canonicalJsonl([])).toBe('');
    expect(() => canonicalJson(Symbol('not-json'))).toThrow('not JSON-serializable');
  });

  it('should hash strings and files with SHA-256', () => {
    const path = writeFixture('source.txt', 'cursor-era');

    expect(sha256('cursor-era')).toBe('51cd909acf644f796586383467bed5d7902bbcb227c5da8d9a9ca620850dddb2');
    expect(sha256File(path)).toBe(sha256('cursor-era'));
  });

  it('should keep absolute source roots out of symbolic locators', () => {
    const path = writeFixture('cursor/User/History/entry.md', '# Plan');
    const root = join(fixtureRoot, 'cursor');
    const locator = symbolicLocator({ scheme: 'cursor', root, path });

    expect(locator).toBe('cursor://User/History/entry.md');
    expect(locator).not.toContain(fixtureRoot);
    expect(resolveSymbolicLocator(locator, { cursor: root })).toBe(path);
    expect(() => symbolicLocator({ scheme: 'Cursor', root, path })).toThrow('invalid locator scheme');
    expect(() => symbolicLocator({ scheme: 'cursor', root, path: fixtureRoot })).toThrow('outside');
    expect(() => resolveSymbolicLocator('cursor://../outside', { cursor: root })).toThrow('escapes');
    expect(() => resolveSymbolicLocator('unknown://entry', { cursor: root })).toThrow('unresolvable');
  });

  it('should select the last content-changing Local History revision', () => {
    const revisions = [
      { id: 'c', timestamp: 30, content: 'second' },
      { id: 'a', timestamp: 10, content: 'first' },
      { id: 'b', timestamp: 20, content: 'second' },
      { id: 'd', timestamp: 40, content: 'second' },
    ];

    expect(selectContentChangeRange(revisions)).toEqual({
      first: revisions[1],
      last: revisions[2],
      changes: 2,
    });
    expect(selectLastContentChange(revisions)).toBe(revisions[2]);
    expect(selectLastContentChange([])).toBeUndefined();
  });

  it('should dispatch three JSON content wrappers separately from a raw Backup trace', () => {
    const wrappers = [
      `cursor-plan://composer/declar.plan.md ${JSON.stringify({ content: '# Transform controls plan' })}`,
      `cursor-plan://composer/plan.plan.md ${JSON.stringify({ content: '# Transform controls plan revision 2', metadata: { revision: 2 } })}`,
      `\uFEFFcursor-plan://composer/converter.plan.md ${JSON.stringify({ content: '# Converter formats plan' })}`,
    ];

    for (const wrapper of wrappers) {
      const dispatched = dispatchBackupPayload(wrapper);
      expect(dispatched.kind).toBe('content-wrapper');
      if (dispatched.kind === 'content-wrapper') {
        expect(dispatched.wrapper_sha256).toHaveLength(64);
        expect(dispatched.content_sha256).toBe(sha256(dispatched.content));
        expect(dispatched.backup_uri).toMatch(/^cursor-plan:\/\//u);
      }
    }

    const raw = 'untitled:Untitled-2 {"typeId":""}\n{"type":"MutationResponse"}';
    expect(dispatchBackupPayload(raw)).toEqual({
      kind: 'raw-trace',
      backup_uri: 'untitled:Untitled-2',
      source_sha256: sha256(raw),
      content: '{"typeId":""}\n{"type":"MutationResponse"}',
    });
    expect(dispatchBackupPayload('{"other":"json trace"}').kind).toBe('raw-trace');
  });

  it('should read SQLite FTS records without mutating the source and write only sanitized non-git units', () => {
    const databasePath = join(fixtureRoot, 'conversation-search.db');
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE conversations (
        fts_rowid INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        scope TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE conversation_fts USING fts5(title, body);
      INSERT INTO conversations VALUES (1, 'local', '', 'record-1', 'Historical unit', 1770000000000);
      INSERT INTO conversation_fts(rowid, title, body)
        VALUES (1, 'Historical unit', 'Decision theme. token=abcdefghijklmnopqrstuvwxyz');
    `);
    database.close();
    const before = sha256File(databasePath);

    const records = readConversationSearchRecords({
      databasePath,
      units: [{ unit: 'CHAT-F01', id: 'record-1' }],
    });
    expect(records).toEqual([
      expect.objectContaining({
        unit: 'CHAT-F01',
        id: 'record-1',
        source: 'local',
        sanitized_text: 'Decision theme. [REDACTED:credential]',
        redactions: { credential: 1 },
      }),
    ]);
    expect(records[0]?.source_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(sha256File(databasePath)).toBe(before);

    const outputDirectory = join(fixtureRoot, 'classification');
    writeConversationSearchClassificationUnits({
      databasePath,
      units: [{ unit: 'CHAT-F01', id: 'record-1' }],
      outputDirectory,
    });
    expect(readFileSync(join(outputDirectory, 'CHAT-F01.md'), 'utf8')).toBe('Decision theme. [REDACTED:credential]\n');
    expect(readFileSync(join(outputDirectory, 'CHAT-F01.json'), 'utf8')).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('should make byte-distinct same-basename plans collision-safe', () => {
    const first = collisionSafePlanFilename('/one/opencascade monaco.plan.md', 'revision one');
    const occupied = new Map([[first, sha256('revision one')]]);
    const duplicate = collisionSafePlanFilename('/two/opencascade monaco.plan.md', 'revision one', occupied);
    const second = collisionSafePlanFilename('/two/opencascade monaco.plan.md', 'revision two', occupied);

    expect(first).toBe(duplicate);
    expect(first).not.toBe(second);
    expect(first).toBe('opencascade_monaco.plan.md');
    expect(second).toBe(`opencascade_monaco__${sha256('revision two').slice(0, 8)}.plan.md`);
    expect(collisionSafePlanFilename('.md', 'content')).toBe('recovered-plan.plan.md');
  });

  it('should extend and normalize the plan archive without overwriting collisions', () => {
    const appSupport = join(fixtureRoot, 'Library', 'Application Support', 'Cursor');
    const historyRoot = join(appSupport, 'User', 'History');
    const historyDirectory = join(historyRoot, 'one');
    const backupRoot = join(appSupport, 'Backups');
    const archiveRoot = join(fixtureRoot, 'archive');
    mkdirSync(historyDirectory, { recursive: true });
    mkdirSync(backupRoot, { recursive: true });
    mkdirSync(archiveRoot, { recursive: true });
    writeFileSync(join(historyDirectory, 'a.md'), '# First\n');
    writeFileSync(join(historyDirectory, 'b.md'), '# Recovered\n');
    writeFileSync(
      join(historyDirectory, 'entries.json'),
      canonicalJson({
        resource: pathToFileURL(join(fixtureRoot, 'git', 'tau', '.cursor', 'plans', 'same.plan.md')).href,
        entries: [
          { id: 'a.md', timestamp: 1_700_000_000_000 },
          { id: 'b.md', timestamp: 1_700_086_400_000 },
        ],
      }),
    );
    writeFileSync(
      join(backupRoot, 'wrapper'),
      `cursor-plan://fixture/backup.plan.md ${JSON.stringify({ content: '# Backup\n' })}`,
    );
    const manifestPath = join(archiveRoot, 'manifest.json');
    writeFileSync(
      manifestPath,
      canonicalJson({
        schema_version: 2,
        created: '2026-07-21',
        plans: [
          {
            archived: 'same.plan.md',
            sha256: sha256('# Existing\n'),
            created: '2026-01-01',
            updated: '2026-01-01',
            canonical_source: '/Users/researcher/.cursor/plans/same.plan.md',
            source_aliases: ['/Users/researcher/.cursor/plans/same.plan.md'],
          },
        ],
      }),
    );

    expect(
      recoverPlanArchive({
        historyRoot,
        historyDirectories: new Set(['one']),
        backupsRoot: backupRoot,
        archiveRoot,
        manifestPath,
      }),
    ).toEqual({
      historyPlans: 1,
      backupPlans: 1,
      plans: 3,
    });
    const manifest = readFileSync(manifestPath, 'utf8');
    expect(manifest).not.toContain('/Users/');
    expect(JSON.parse(manifest)).toMatchObject({ schema_version: 3, distinct_contents: 3 });
    expect(readdirSync(archiveRoot).filter((name) => name.endsWith('.plan.md'))).toEqual(
      expect.arrayContaining(['backup.plan.md', `same__${sha256('# Recovered\n').slice(0, 8)}.plan.md`]),
    );
  });

  it('should classify and redact secrets without retaining their values', () => {
    const text = [
      'Authorization: Bearer abcdefghijkl.mnopqrstuvwxyz.0123456789abcdef',
      '"blobEncryptionKey":"Y6a3t+S8HJRnIRqZfagpfS7WFXWlgn5EUueuua7CYmQ="',
      'owner@example.co.nz',
      '/Users/researcher/Library/Application Support/Cursor',
      'https://capture.test/session?token=opaque-value',
    ].join('\n');

    const findings = scanSensitiveText(text);
    const redacted = redactSensitiveText(text);

    expect(findings.map((finding) => finding.category).sort()).toEqual([
      'absolute-home-path',
      'credential',
      'credential',
      'private-email',
      'tokenized-url',
    ]);
    expect(findings.every((finding) => !Object.hasOwn(finding, 'value'))).toBe(true);
    expect(redacted.text).not.toContain('researcher');
    expect(redacted.text).not.toContain('opaque-value');
    expect(redacted.counts).toEqual({
      'absolute-home-path': 1,
      credential: 2,
      'private-email': 1,
      'tokenized-url': 1,
    });
  });

  it('should not mistake hashes, UUIDs, integrity strings, or example emails for secrets', () => {
    const safe = [
      `original_sha256=${'a'.repeat(64)}`,
      'record_id=8becb0a8-f463-44de-8794-c72bdcf063fc',
      'integrity=sha512-AbCdEf1234567890+/=',
      'test@example.com',
      'cursor://User/History/entry.md',
    ].join('\n');

    expect(scanSensitiveText(safe)).toEqual([]);
  });

  it('should reject sensitive content before creating or replacing an output', () => {
    const path = join(fixtureRoot, 'nested', 'manifest.json');
    expect(() => {
      atomicWriteClean(path, 'token=abcdefghijklmnopqrstuvwxyz');
    }).toThrow('refusing to write');
    expect(existsSync(join(fixtureRoot, 'nested'))).toBe(false);

    writeFixture('existing.json', '{"safe":true}\n');
    const existing = join(fixtureRoot, 'existing.json');
    expect(() => {
      atomicWriteClean(existing, 'owner@private.test');
    }).toThrow('refusing to write');
    expect(readFileSync(existing, 'utf8')).toBe('{"safe":true}\n');

    atomicWriteClean(path, canonicalJson({ source_locator: 'cursor://state.vscdb', original_sha256: 'a'.repeat(64) }));
    expect(readFileSync(path, 'utf8')).toContain('cursor://state.vscdb');
  });

  it('should freeze a deterministic baseline and report source drift', () => {
    const sourceRoot = join(fixtureRoot, 'cursor');
    const source = writeFixture('cursor/state.vscdb', 'snapshot');
    const options = {
      units: [{ unit: 'CURSOR-DB-01', source_locator: 'cursor://state.vscdb', source_kind: 'sqlite' }],
      roots: { cursor: sourceRoot },
      extractedAt: '2026-07-22T00:00:00.000Z',
    } as const;

    const first = createSourceBaseline(options);
    const second = createSourceBaseline(options);

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.entries[0]).toMatchObject({
      unit: 'CURSOR-DB-01',
      original_sha256: sha256('snapshot'),
      size: 8,
    });
    expect(typeof first.entries[0]?.file_mtime_ms).toBe('number');
    expect(verifySourceBaseline(first, options.roots)).toEqual([]);

    writeFileSync(source, 'changed');
    expect(verifySourceBaseline(first, options.roots)).toEqual([
      expect.objectContaining({ unit: 'CURSOR-DB-01', kind: 'changed' }),
    ]);
    rmSync(source);
    expect(verifySourceBaseline(first, options.roots)).toEqual([
      expect.objectContaining({ unit: 'CURSOR-DB-01', kind: 'missing' }),
    ]);
    expect(() => createSourceBaseline({ ...options, units: [...options.units, ...options.units] })).toThrow(
      'duplicate source unit',
    );
  });

  it('should enforce the Cursor coverage arithmetic', () => {
    const valid = {
      exported_primary: 714,
      recovered_primary: 18,
      metadata_only_primary: 2124,
      orphan_fts: 6,
      exported_subagents: 3199,
      recoverable_subagents: 746,
      unrecoverable_subagents: 19,
      headerless_subagents: 1,
    };

    expect(validateCoverageCounts(valid)).toEqual([]);
    expect(validateCoverageCounts({ ...valid, metadata_only_primary: 0, orphan_fts: 0 })).toContain(
      'primary headers must satisfy 714 + 18 + 2,124 = 2,856',
    );
    expect(validateCoverageCounts({ ...valid, exported_subagents: 0, headerless_subagents: 0 })).toEqual(
      expect.arrayContaining([
        'subagent headers must satisfy 3,199 + 746 + 19 = 3,964',
        'Tau headers must satisfy 2,856 + 3,964 = 6,820',
        'headerless exported subagents must remain a separate population of 1',
      ]),
    );
  });

  it('should scaffold committed-output schema, privacy, and theme-closure checks', () => {
    const root = join(fixtureRoot, 'cursor-history');
    writeFixture('cursor-history/manifest.json', canonicalJson({ entries: [] }));
    writeFixture('cursor-history/headers.jsonl', canonicalJsonl([{ composer_id: 'one' }, { composer_id: 'one' }]));
    writeFixture(
      'cursor-history/themes.jsonl',
      `${canonicalJsonl([{ theme_id: 'THEME-1', disposition: 'unresolved', content: 'raw transcript' }])}not-json\n`,
    );
    writeFixture('cursor-history/private.txt', '/home/researcher/private');

    const diagnostics = validateCommittedOutputs({ root, requireComplete: true });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'headers.jsonl', rule: 'duplicate-id' }),
        expect.objectContaining({ path: 'themes.jsonl', rule: 'invalid-json' }),
        expect.objectContaining({ path: 'themes.jsonl', rule: 'raw-transcript' }),
        expect.objectContaining({ path: 'themes.jsonl', rule: 'unresolved-theme' }),
        expect.objectContaining({ path: 'private.txt', rule: 'sensitive-content' }),
        expect.objectContaining({ path: 'losses.jsonl', rule: 'missing-file' }),
        expect.objectContaining({ path: 'legacy-authored-plans.json', rule: 'missing-file' }),
      ]),
    );
  });

  it('should produce byte-identical extract metadata from a frozen CLI baseline', () => {
    const sourceRoot = join(fixtureRoot, 'cursor');
    writeFixture('cursor/state.vscdb', 'snapshot');
    const baseline = join(fixtureRoot, 'baseline.json');
    const first = join(fixtureRoot, 'extract-1.json');
    const second = join(fixtureRoot, 'extract-2.json');
    const rootArgument = `cursor=${sourceRoot}`;

    expect(
      runCursorHistoryRecovery([
        'baseline',
        '--root',
        rootArgument,
        '--unit',
        'CURSOR-DB-01=cursor://state.vscdb',
        '--output',
        baseline,
        '--extracted-at',
        '2026-07-22T00:00:00.000Z',
      ]),
    ).toBe(0);
    expect(
      runCursorHistoryRecovery(['extract', '--root', rootArgument, '--baseline', baseline, '--output', first]),
    ).toBe(0);
    expect(
      runCursorHistoryRecovery(['extract', '--root', rootArgument, '--baseline', baseline, '--output', second]),
    ).toBe(0);

    expect(readFileSync(first)).toEqual(readFileSync(second));
    expect(runCursorHistoryRecovery(['verify', '--root', rootArgument, '--baseline', baseline])).toBe(0);
    expect(runCursorHistoryRecovery(['verify', '--output-root', join(fixtureRoot, 'private-tau-brain')])).toBe(0);
    expect(runCursorHistoryRecovery(['--help'])).toBe(0);
  });
});
