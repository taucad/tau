import { describe, it, expect } from 'vitest';
import { mergeSkillMetadata, parseSkillFrontmatter } from '#hooks/use-context-payload.utils.js';

describe('parseSkillFrontmatter', () => {
  it('should parse valid YAML frontmatter with name and description', () => {
    const content = `---
name: my-skill
description: A useful skill for testing
---

# My Skill

Some content here.
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/my-skill/SKILL.md', { source: 'user' });

    expect(result).toEqual(
      expect.objectContaining({
        name: 'my-skill',
        description: 'A useful skill for testing',
        path: '.agents/skills/my-skill',
        source: 'user',
        enabled: true,
      }),
    );
    expect(result?.fingerprint).toMatch(/^[\da-f]{8}$/);
  });

  it('should return undefined for content without frontmatter', () => {
    const content = '# Just a heading\n\nNo frontmatter here.';

    expect(parseSkillFrontmatter(content, '.tau/skills/x/SKILL.md')).toBeUndefined();
  });

  it('should return undefined when name is missing', () => {
    const content = `---
description: Missing name field
---
`;
    expect(parseSkillFrontmatter(content, '.tau/skills/x/SKILL.md')).toBeUndefined();
  });

  it('should return undefined when description is missing', () => {
    const content = `---
name: incomplete-skill
---
`;
    expect(parseSkillFrontmatter(content, '.tau/skills/x/SKILL.md')).toBeUndefined();
  });

  it('should handle single-quoted values in frontmatter', () => {
    const content = `---
name: 'quoted-skill'
description: 'A skill with quoted values'
---
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/quoted-skill/SKILL.md');

    expect(result).toEqual(
      expect.objectContaining({
        name: 'quoted-skill',
        description: 'A skill with quoted values',
        path: '.agents/skills/quoted-skill',
      }),
    );
  });

  it('should handle double-quoted values in frontmatter', () => {
    const content = `---
name: "double-quoted"
description: "Uses double quotes"
---
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/double-quoted/SKILL.md');

    expect(result).toEqual(
      expect.objectContaining({
        name: 'double-quoted',
        description: 'Uses double quotes',
        path: '.agents/skills/double-quoted',
      }),
    );
  });

  it('should strip SKILL.md from path to produce skill directory path', () => {
    const content = `---
name: nested
description: Nested skill
---
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/deeply/nested/SKILL.md');

    expect(result?.path).toBe('.agents/skills/deeply/nested');
  });

  it('should return undefined for empty frontmatter block', () => {
    const content = `---
---
`;
    expect(parseSkillFrontmatter(content, '.tau/skills/x/SKILL.md')).toBeUndefined();
  });

  it('should handle frontmatter with extra fields gracefully', () => {
    const content = `---
name: extra-fields
description: Has extra fields
status: active
category: testing
---
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/extra-fields/SKILL.md');

    expect(result).toEqual(
      expect.objectContaining({
        name: 'extra-fields',
        description: 'Has extra fields',
        path: '.agents/skills/extra-fields',
      }),
    );
  });

  it('should parse stable catalog fields from frontmatter', () => {
    const content = `---
name: catalog-fields
description: Has catalog fields
source: tau-store
version: 2.1.0
when_to_use: Use when catalog fields matter
enabled: false
---
`;
    const result = parseSkillFrontmatter(content, '.agents/skills/catalog-fields/SKILL.md');

    expect(result).toEqual(
      expect.objectContaining({
        name: 'catalog-fields',
        source: 'tau-store',
        version: '2.1.0',
        whenToUse: 'Use when catalog fields matter',
        enabled: false,
      }),
    );
  });
});

describe('mergeSkillMetadata', () => {
  it('should prefer canonical user skills and preserve lower-priority shadows', () => {
    const result = mergeSkillMetadata([
      {
        name: 'woodworking',
        description: 'Legacy copy',
        path: '.tau/skills/woodworking',
        source: 'legacy',
        fingerprint: 'legacyhash',
      },
      {
        name: 'woodworking',
        description: 'User copy',
        path: '.agents/skills/woodworking',
        source: 'user',
        fingerprint: 'userhash',
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        name: 'woodworking',
        description: 'User copy',
        path: '.agents/skills/woodworking',
        source: 'user',
        shadowedSources: [{ source: 'legacy', path: '.tau/skills/woodworking', fingerprint: 'legacyhash' }],
      }),
    ]);
  });
});
