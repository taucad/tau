import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishDraft } from '@taucad/revisions';
import { autoVersionName } from '@taucad/revisions/publish-machine';

import { autoNamed } from '#revisions.js';

describe('autoNamed', () => {
  const draft: PublishDraft = { tag: '', isAutoNamed: true, projectName: 'Bracket', entryPath: 'main.ts' };
  /* One instant for the helper and the expectation, so a run across local midnight names the same day. */
  const now = new Date(2026, 10, 19, 23, 59, 59, 999);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names an auto-named draft with no name in this locale', () => {
    expect(autoNamed(draft).tag).toBe(autoVersionName(now));
  });

  it('keeps a name the draft has', () => {
    expect(autoNamed({ ...draft, tag: 'Ready for print' }).tag).toBe('Ready for print');
  });

  it('names a page draft that arrives with no tag at all, rather than throwing', () => {
    /* A page's `confirmPublish` draft is not validated before it reaches the host. */
    const { tag: _tag, ...untagged } = draft;

    expect(autoNamed(untagged as PublishDraft).tag).toBe(autoVersionName(now));
  });
});
