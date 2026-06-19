import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '#hooks/use-context-payload.utils.js';
import { skillMetadataToSlashCommand } from '#hooks/use-skills-catalog.js';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

describe('skillMetadataToSlashCommand', () => {
  it('should expose create-skill as a system slash skill item', () => {
    const createSkill = builtInSystemSkills.find((skill) => skill.slug === 'create-skill');
    if (!createSkill) {
      throw new Error('Expected built-in create-skill to be registered');
    }

    const metadata = parseSkillFrontmatter(createSkill.skillMarkdown, 'system:skills/create-skill/SKILL.md', {
      source: 'system',
      resourceUri: 'system:skills/create-skill/SKILL.md',
    });
    if (!metadata) {
      throw new Error('Expected create-skill frontmatter to parse');
    }

    expect(skillMetadataToSlashCommand(metadata)).toEqual(
      expect.objectContaining({
        id: 'create-skill',
        label: '/create-skill',
        title: 'Create Skill',
        group: 'Skills',
        source: 'system',
      }),
    );
  });
});
