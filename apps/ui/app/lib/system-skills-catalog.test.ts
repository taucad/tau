import { describe, expect, it } from 'vitest';
import { kernelConfigurations } from '@taucad/types/constants';
import { parseSkillFrontmatter } from '#hooks/use-context-payload.utils.js';
import { createModelSkillMarkdown } from '#lib/create-model-skill.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import { systemSkillsCatalog } from '#lib/system-skills-catalog.js';

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

describe('systemSkillsCatalog', () => {
  it('should include a valid create-skill system skill', () => {
    const createSkill = systemSkillsCatalog.find((skill) => skill.slug === 'create-skill');

    if (!createSkill) {
      throw new Error('Expected system create-skill to be registered');
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
        catalogEntry: systemSkillsCatalog.find((skill) => skill.slug === skillName),
        resolved: await resolver.resolveSkill(skillName),
      })),
    );

    for (const { catalogEntry, resolved } of results) {
      expect(catalogEntry).toEqual(expect.objectContaining({ priority: 60, source: 'system' }));
      expect(resolved).toEqual(
        expect.objectContaining({
          success: true,
          skillName: catalogEntry?.slug,
          source: 'system',
        }),
      );
    }
  });

  it('keeps configured kernels, cad-* catalog slugs, and create-model rows set-equal', () => {
    const configured = kernelConfigurations.map(({ id }) => id).toSorted();
    const catalog = systemSkillsCatalog
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
    const jscad = systemSkillsCatalog.find(({ slug }) => slug === 'cad-jscad');
    expect(jscad?.skillMarkdown).toContain('one flat array of named geometries');
  });

  it.each([
    ['cad-openscad', 10],
    ['geospec-authoring', 5],
  ] as const)('returns actionable paths and every supporting file for %s', async (slug, supportingCount) => {
    const resolver = createSkillResolver({
      readFile: async () => {
        throw new Error('package resources stay lazy during activation');
      },
      listDirectory: async () => [],
    });

    const resolved = await resolver.resolveSkill(slug);
    expect(resolved.success).toBe(true);
    if (!resolved.success) {
      throw new Error(`Expected ${slug} to resolve`);
    }
    expect(resolved.resourceUri).toBe(`system:skills/${slug}/SKILL.md`);
    expect(resolved.skillPath).toBe(`.agents/skills/${slug}/SKILL.md`);
    expect(resolved.baseDirectory).toBe(`.agents/skills/${slug}`);
    expect(resolved.fingerprint).toMatch(/^[\da-f]{64}$/u);
    expect(resolved.supportingFiles).toHaveLength(supportingCount);
  });
});
