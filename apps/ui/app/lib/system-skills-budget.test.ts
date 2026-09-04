import { readFileSync } from 'node:fs';
import { kernelConfigurations } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

const maxDescriptionCharacters = 160;
const authoredSkills = [
  ['cad-build123d', '../../../../packages/plugins/build123d/agent/SKILL.md'],
  ['cad-picogk', '../../../../packages/plugins/picogk/agent/SKILL.md'],
  ['cad-openscad', '../../../../packages/plugins/openrscad/agent/SKILL.md'],
  ['cad-replicad', '../../../../packages/plugins/replicad/agent/SKILL.md'],
  ['cad-manifold', '../../../../packages/plugins/manifold/agent/SKILL.md'],
  ['cad-zoo', '../../../../packages/plugins/zoo/agent/SKILL.md'],
  ['cad-jscad', '../../../../packages/plugins/jscad/agent/SKILL.md'],
  ['cad-opencascadejs', '../../../../packages/plugins/opencascade/agent/SKILL.md'],
  ['geospec-authoring', '../../../../packages/plugins/middleware/agent/geospec-authoring/SKILL.md'],
] as const;

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
  const skillMarkdown = builtInSystemSkills.find(({ slug }) => slug === 'create-model')?.skillMarkdown;
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
  it.each(authoredSkills)('should keep %s within its body and description budgets', (skillName, path) => {
    const skillMarkdown = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(() => {
      assertSkillBudget(skillName, skillMarkdown);
    }).not.toThrow();
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
