import { describe, expect, it } from 'vitest';

import { parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import { parseStartRecord, serializeStartRecord, startReadingOf, startSummary, startTrigger } from '#start-version.js';
import type { StartOrigin } from '#start-version.js';

const origins: readonly StartOrigin[] = ['created', 'github', 'folder', 'zip'];

describe('the Start version (A6)', () => {
  it.each(origins)('reads back the %s record it writes, and refuses anything else', (origin) => {
    expect(parseStartRecord(serializeStartRecord(origin))).toBe(origin);
  });

  it.each([
    '{"version":2,"origin":"created"}',
    '{"version":1,"origin":"desk"}',
    '{"version":1,"origin":"zip","extra":true}',
    '[]',
    'not json',
  ])('refuses the record %s', (text) => {
    expect(parseStartRecord(new TextEncoder().encode(text))).toBeUndefined();
  });

  it.each(origins)('round-trips a %s entry through the commit trailer and reads it as Start', (origin) => {
    const message = revisionCommitMessage({
      parents: [],
      provenance: {
        source: origin === 'created' ? 'user' : 'import',
        actorId: 'ada',
        trigger: startTrigger(origin),
        createdAt: Date.UTC(2026, 10, 10),
      },
      summary: { generated: startSummary(origin) },
    });
    const trailer = parseRevisionCommitMessage(message);

    expect(trailer?.provenance.trigger).toBe(startTrigger(origin));
    expect(message.split('\n')).toContain(`Tau-Trigger: ${startTrigger(origin)}`);
    expect(trailer && startReadingOf(trailer)).toBe(origin);
  });

  it('reads an older project’s root entry, a turn’s base cut, as Start with no tag', () => {
    expect(
      startReadingOf({
        parents: [],
        provenance: { source: 'user', trigger: 'turn' },
        summary: { generated: 'Agent turn t1' },
      }),
    ).toBe('created');
  });

  it('does not read a repository’s own first commit, or any later entry, as Start', () => {
    expect(
      startReadingOf({ parents: [], provenance: { source: 'import' }, summary: { generated: 'Initial commit' } }),
    ).toBeUndefined();
    expect(
      startReadingOf({
        parents: ['a'],
        provenance: { source: 'user', trigger: 'save' },
        summary: { generated: 'Saved changes (save)' },
      }),
    ).toBeUndefined();
  });

  it('reads a GitHub link’s import entry, above the repository’s history, as Start', () => {
    expect(
      startReadingOf({
        parents: ['upstream'],
        provenance: { source: 'import', trigger: 'import' },
        summary: { generated: 'Imported from GitHub' },
      }),
    ).toBe('github');
    expect(
      startReadingOf({
        parents: [],
        provenance: { source: 'import', trigger: 'import' },
        summary: { generated: 'Brought in by hand' },
      }),
    ).toBe('imported');
  });
});
