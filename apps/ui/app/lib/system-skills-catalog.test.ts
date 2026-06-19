import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '#hooks/use-context-payload.utils.js';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

describe('builtInSystemSkills', () => {
  it('should include a valid create-skill system skill', () => {
    const createSkill = builtInSystemSkills.find((skill) => skill.slug === 'create-skill');

    if (!createSkill) {
      throw new Error('Expected built-in create-skill to be registered');
    }

    expect(createSkill.skillMarkdown).toContain('name: create-skill');
    expect(createSkill.skillMarkdown).toContain('source: system');
    expect(createSkill.skillMarkdown).toContain('.agents/skills/<skill-name>/SKILL.md');
    expect(createSkill.source).toBe('system');

    const metadata = parseSkillFrontmatter(createSkill.skillMarkdown, 'system:skills/create-skill/SKILL.md', {
      source: 'system',
      resourceUri: 'system:skills/create-skill/SKILL.md',
    });
    if (!metadata) {
      throw new Error('Expected create-skill frontmatter to parse');
    }

    expect(metadata).toEqual(
      expect.objectContaining({
        name: 'create-skill',
        source: 'system',
        version: '1.0.0',
        enabled: true,
      }),
    );
    expect(metadata.description).toContain('Create or update Tau agent skills');
  });
});
