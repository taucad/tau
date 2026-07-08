import { describe, expect, it } from 'vitest';
import type { SkillResolverDirectoryEntry } from '#lib/skill-resolver.js';
import { createSkillResolver } from '#lib/skill-resolver.js';

const encoder = new TextEncoder();

type MemoryTree = Record<string, string>;

function skillMarkdown(options: {
  readonly name: string;
  readonly description: string;
  readonly source?: string;
  readonly body?: string;
}): string {
  return `---
name: ${options.name}
description: ${options.description}
${options.source ? `source: ${options.source}\n` : ''}enabled: true
---

${options.body ?? `# ${options.name}`}`;
}

function createMemoryResolver(files: MemoryTree) {
  const listDirectory = async (path: string): Promise<SkillResolverDirectoryEntry[]> => {
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const filePath of Object.keys(files)) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const next = filePath.slice(prefix.length).split('/')[0];
      if (next) {
        names.add(next);
      }
    }

    return [...names].sort().map((name) => ({
      name,
      isFolder: Object.keys(files).some((filePath) => filePath.startsWith(`${prefix}${name}/`)),
    }));
  };

  return createSkillResolver({
    readFile: async (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return encoder.encode(content);
    },
    listDirectory,
  });
}

describe('createSkillResolver', () => {
  it('should expose the built-in create-skill as a virtual system resource', async () => {
    const resolver = createMemoryResolver({});

    const listing = await resolver.listSkills();
    expect(listing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'create-skill',
          source: 'system',
          resourceUri: 'system:skills/create-skill/SKILL.md',
        }),
      ]),
    );

    const resolved = await resolver.resolveSkill('create-skill');
    expect(resolved).toEqual(
      expect.objectContaining({
        success: true,
        skillName: 'create-skill',
        source: 'system',
        resourceUri: 'system:skills/create-skill/SKILL.md',
        content: expect.stringContaining('# Create Skill'),
        supportingFiles: [],
      }),
    );
  });

  it('should prefer user skills over system and legacy sources and preserve shadow metadata', async () => {
    const resolver = createMemoryResolver({
      '.agents/skills/create-skill/SKILL.md': skillMarkdown({
        name: 'create-skill',
        description: 'Workspace override',
        source: 'user',
      }),
      '.tau/skills/create-skill/SKILL.md': skillMarkdown({
        name: 'create-skill',
        description: 'Legacy override',
      }),
    });

    const listing = await resolver.listSkills();
    const createSkill = listing.find((skill) => skill.name === 'create-skill');

    expect(createSkill).toEqual(
      expect.objectContaining({
        description: 'Workspace override',
        source: 'user',
        skillPath: '.agents/skills/create-skill/SKILL.md',
        shadowedSources: expect.arrayContaining([
          expect.objectContaining({ source: 'system', resourceUri: 'system:skills/create-skill/SKILL.md' }),
          expect.objectContaining({ source: 'legacy', skillPath: '.tau/skills/create-skill/SKILL.md' }),
        ]),
      }),
    );
  });

  it('should reflect edited content on the next prompt listing (no per-chat freeze)', async () => {
    const files: MemoryTree = {
      '.agents/skills/mine/SKILL.md': skillMarkdown({
        name: 'mine',
        description: 'Initial description',
        body: '# Initial Mine',
      }),
    };
    const resolver = createMemoryResolver(files);

    const initialPromptListing = await resolver.getPromptSkillListing();
    expect(initialPromptListing).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'mine', description: 'Initial description' })]),
    );

    files['.agents/skills/mine/SKILL.md'] = skillMarkdown({
      name: 'mine',
      description: 'Edited description',
      body: '# Edited Mine',
    });

    const editedPromptListing = await resolver.getPromptSkillListing();
    const resolved = await resolver.resolveSkill('mine');

    expect(editedPromptListing).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'mine', description: 'Edited description' })]),
    );
    expect(resolved).toEqual(
      expect.objectContaining({
        success: true,
        skillName: 'mine',
        content: expect.stringContaining('# Edited Mine'),
      }),
    );
  });

  it('should return SKILL_NOT_FOUND for unknown skills', async () => {
    const resolver = createMemoryResolver({});

    await expect(resolver.resolveSkill('missing')).resolves.toEqual({
      success: false,
      errorCode: 'SKILL_NOT_FOUND',
      message: 'Skill not found: missing',
    });
  });
});
