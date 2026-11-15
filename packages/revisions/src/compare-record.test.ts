import { describe, expect, it } from 'vitest';

import { compareRulesRevision, compareRulesText } from '#compare-record.js';

describe('compareRulesText', () => {
  it('should name the revision of Tau’s own tree-id rules beside the host’s, so an older release’s record answers nothing', () => {
    const text = compareRulesText(['threshold', 'registry', 'engine']);

    expect(compareRulesRevision).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(text)).toEqual([`tau-rules-${String(compareRulesRevision)}`, 'threshold', 'registry', 'engine']);
  });
});
