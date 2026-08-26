import { describe, expect, it } from 'vitest';
import { validateTags, workspace } from '@taucad/nx';

describe('project tag validation', () => {
  it('accepts every project in the workspace', async () => {
    expect(validateTags(await workspace())).toEqual([]);
  });
});
