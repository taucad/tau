import { kernelConfigurations } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';
import { systemSkillsCatalog } from '#lib/system-skills-catalog.js';

const maxDescriptionCharacters = 160;

/*
 * Derived, not listed. This table used to be nine hardcoded
 * `../../../../packages/plugins/<name>/agent/SKILL.md` paths, which meant the
 * test knew the workspace layout — so relocating a bundle broke it with ENOENT
 * rather than a budget failure, and a tenth skill could ship ungated because
 * nobody remembered to add a tenth line. The catalogue is now assembled from
 * each package's own manifest, so asserting over it covers exactly what the app
 * actually loads.
 */
const packageSkills = systemSkillsCatalog.filter(({ slug }) => slug !== 'create-skill' && slug !== 'create-model');

const assertSkillBudget = (skillName: string, skillMarkdown: string, maxBodyTokens = 800): void => {
  const description = /^description:\s*(.+)$/m.exec(skillMarkdown)?.[1]?.trim();
  if (!description) {
    throw new Error(`${skillName} has invalid frontmatter`);
  }

  const body = skillMarkdown.replace(/^---\n[\S\s]*?\n---\n?/, '');
  if (description.length > maxDescriptionCharacters) {
    throw new Error(`${skillName} description exceeds ${maxDescriptionCharacters} characters`);
  }
  if (body.length > maxBodyTokens * 4) {
    throw new Error(`${skillName} body exceeds ${maxBodyTokens} estimated tokens`);
  }
};

const getCreateModelSkillMarkdown = (): string => {
  const skillMarkdown = systemSkillsCatalog.find(({ slug }) => slug === 'create-model')?.skillMarkdown;
  if (!skillMarkdown) {
    throw new Error('create-model is not registered');
  }
  return skillMarkdown;
};

const assertCreateModelSelectionRows = (skillMarkdown: string): void => {
  const lines = skillMarkdown.split('\n');
  for (const { id } of kernelConfigurations) {
    const rowPrefix = `| \`cad-${id}\` |`;
    if (lines.filter((line) => line.startsWith(rowPrefix)).length !== 1) {
      throw new Error(`create-model requires exactly one selection row for ${id}`);
    }
  }
};

describe('progressive-disclosure system skill budgets', () => {
  it.each(packageSkills.map((skill) => [skill.slug, skill.skillMarkdown] as const))(
    'should keep %s within its body and description budgets',
    (skillName, skillMarkdown) => {
      expect(() => {
        assertSkillBudget(skillName, skillMarkdown);
      }).not.toThrow();
    },
  );

  it('gates every package-owned skill, not a hand-kept subset', () => {
    /* The count this replaced was a literal; if an owner ships a bundle and no
     * row appears above, that is the failure mode worth catching. */
    expect(packageSkills.length).toBeGreaterThanOrEqual(kernelConfigurations.length);
    expect(packageSkills.map((skill) => skill.slug)).toContain('geospec-authoring');
    expect(packageSkills.every((skill) => skill.skillMarkdown.startsWith('---\n'))).toBe(true);
  });

  it('should keep create-model within its 900-token body budget', () => {
    expect(() => {
      assertSkillBudget('create-model', getCreateModelSkillMarkdown(), 900);
    }).not.toThrow();
  });

  it('should include exactly one generated selection row for every configured kernel', () => {
    expect(() => {
      assertCreateModelSelectionRows(getCreateModelSkillMarkdown());
    }).not.toThrow();
  });

  it('should reject selection guidance with a deliberately omitted kernel row', () => {
    const skillMarkdown = getCreateModelSkillMarkdown();
    const omittedKernel = kernelConfigurations[0];
    const incompleteSkillMarkdown = skillMarkdown
      .split('\n')
      .filter((line) => !line.startsWith(`| \`cad-${omittedKernel.id}\` |`))
      .join('\n');

    expect(() => {
      assertCreateModelSelectionRows(incompleteSkillMarkdown);
    }).toThrow(`create-model requires exactly one selection row for ${omittedKernel.id}`);
  });

  it('should reject a deliberately oversized fixture body', () => {
    const maxBodyCharacters = 800 * 4;
    const fixture = `---\nname: oversized-fixture\ndescription: Budget guard fixture.\n---\n\n${'x'.repeat(
      maxBodyCharacters + 1,
    )}`;

    expect(() => {
      assertSkillBudget('oversized-fixture', fixture);
    }).toThrow('body exceeds 800 estimated tokens');
  });
});
