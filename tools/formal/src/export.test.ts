import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { staleFiles } from '#export.js';

describe('staleFiles', () => {
  // The commit hook runs oxfmt over every staged file, so a committed graph is reformatted JSON.
  it('should compare generated JSON by value, not by layout', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'formal-stale-'));
    const same = path.join(directory, 'same.json');
    const changed = path.join(directory, 'changed.json');
    writeFileSync(same, '{\n  "initial": [1],\n  "views": []\n}\n');
    writeFileSync(changed, '{\n  "initial": [2],\n  "views": []\n}\n');

    expect(staleFiles({ [same]: '{"initial":[1],"views":[]}\n', [changed]: '{"initial":[1],"views":[]}\n' })).toEqual([
      changed,
    ]);
  });
});
