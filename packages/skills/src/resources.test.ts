// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { systemSkillBundles } from '#resources.js';
import { skillOwners } from '#skill-bundles.js';

describe('@taucad/skills/resources', () => {
  it('should aggregate one immutable lazy bundle per declared owner', () => {
    expect(systemSkillBundles).toHaveLength(skillOwners.length);
    expect(Object.isFrozen(systemSkillBundles)).toBe(true);
    expect(new Set(systemSkillBundles.map(({ slug }) => slug))).toHaveProperty('size', skillOwners.length);
    for (const bundle of systemSkillBundles) {
      expect(Object.isFrozen(bundle)).toBe(true);
      expect(Object.isFrozen(bundle.files)).toBe(true);
      expect(bundle.files[0]?.path).toBe('SKILL.md');
    }
  });

  it('should resolve every descriptor to the declared bytes without eager bodies', async () => {
    await Promise.all(
      systemSkillBundles.flatMap((bundle) =>
        bundle.files.map(async (resource) => {
          const bytes = await readFile(new URL(resource.url));
          expect(bytes.byteLength).toBe(resource.byteLength);
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(resource.sha256);
        }),
      ),
    );
  });
});
