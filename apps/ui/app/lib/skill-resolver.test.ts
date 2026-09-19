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
  it('should expose the system create-skill as a virtual system resource', async () => {
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
        supportingFiles: [],
      }),
    );
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.content).toContain('# Create Skill');
    }
  });

  it('should let a user skill fully replace a same-slug system bundle', async () => {
    const resolver = createMemoryResolver({
      '.agents/skills/create-skill/SKILL.md': skillMarkdown({
        name: 'create-skill',
        description: 'Workspace override',
        source: 'user',
        body: '# Workspace replacement',
      }),
    });

    const listing = await resolver.listSkills();
    const createSkill = listing.find((skill) => skill.name === 'create-skill');

    expect(listing.filter((skill) => skill.name === 'create-skill')).toHaveLength(1);
    expect(createSkill).toEqual(
      expect.objectContaining({
        description: 'Workspace override',
        source: 'user',
        resourceUri: 'file:.agents/skills/create-skill/SKILL.md',
        skillPath: '.agents/skills/create-skill/SKILL.md',
      }),
    );
    expect(createSkill).not.toHaveProperty('shadowedSources');
    expect(createSkill).toHaveProperty('version', undefined);
    expect(createSkill).toHaveProperty('whenToUse', undefined);

    const resolved = await resolver.resolveSkill('create-skill');
    expect(resolved).toEqual(
      expect.objectContaining({
        success: true,
        source: 'user',
        resourceUri: 'file:.agents/skills/create-skill/SKILL.md',
      }),
    );
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.content).toContain('# Workspace replacement');
    }
    expect(resolved).not.toHaveProperty('shadowedSources');
    expect(resolved).not.toHaveProperty('version');
    expect(resolved).not.toHaveProperty('whenToUse');
  });

  // `.agents/skills` is the only filesystem root the resolver reads (L7).
  it('never reads the legacy .tau/skills directory', async () => {
    const resolver = createMemoryResolver({
      '.tau/skills/legacy-only/SKILL.md': skillMarkdown({
        name: 'legacy-only',
        description: 'Legacy override',
      }),
    });

    const listing = await resolver.listSkills();

    expect(listing.find((skill) => skill.name === 'legacy-only')).toBeUndefined();
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
      }),
    );
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.content).toContain('# Edited Mine');
    }
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
