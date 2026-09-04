import { describe, expect, it } from 'vitest';
import { kernelConfigurations } from '@taucad/types/constants';
import { parseSkillFrontmatter } from '#hooks/use-context-payload.utils.js';
import { createModelSkillMarkdown } from '#lib/create-model-skill.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

const progressiveDisclosureSkillNames = [
  'create-model',
  'cad-build123d',
  'cad-picogk',
  'cad-openscad',
  'cad-replicad',
  'cad-manifold',
  'cad-zoo',
  'cad-jscad',
  'cad-opencascadejs',
  'geospec-authoring',
] as const;

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

  it('should resolve every progressive-disclosure skill from priority tier 60', async () => {
    const resolver = createSkillResolver({
      readFile: async () => {
        throw new Error('not found');
      },
      listDirectory: async () => [],
    });

    const results = await Promise.all(
      progressiveDisclosureSkillNames.map(async (skillName) => ({
        catalogEntry: builtInSystemSkills.find((skill) => skill.slug === skillName),
        resolved: await resolver.resolveSkill(skillName),
      })),
    );

    for (const { catalogEntry, resolved } of results) {
      expect(catalogEntry).toEqual(expect.objectContaining({ priority: 60, source: 'system' }));
      expect(resolved).toEqual(
        expect.objectContaining({ success: true, skillName: catalogEntry?.slug, source: 'system' }),
      );
    }
  });

  it('keeps configured kernels, cad-* catalog slugs, and create-model rows set-equal', () => {
    const configured = kernelConfigurations.map(({ id }) => id).toSorted();
    const catalog = builtInSystemSkills
      .flatMap(({ slug }) => (slug.startsWith('cad-') ? [slug.slice('cad-'.length)] : []))
      .toSorted();
    const createModelRows = [...createModelSkillMarkdown.matchAll(/^\| `cad-([^`]+)` \|/gmu)]
      .flatMap((match) => (match[1] ? [match[1]] : []))
      .toSorted();

    expect(catalog).toEqual(configured);
    expect(createModelRows).toEqual(configured);
    expect(progressiveDisclosureSkillNames).toHaveLength(10);
  });

  it('preserves JSCAD multi-shape output as one flat array of named geometries', () => {
    const jscad = builtInSystemSkills.find(({ slug }) => slug === 'cad-jscad');
    expect(jscad?.skillMarkdown).toContain('one flat array of named geometries');
  });
});
