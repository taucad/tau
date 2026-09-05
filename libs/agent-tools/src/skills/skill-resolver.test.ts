import { describe, expect, it, vi } from 'vitest';

import { createSkillResolver } from '#skills/skill-resolver.js';
import type { SkillResolverDependencies } from '#skills/skill-resolver.js';

const encoder = new TextEncoder();

const skillMarkdown = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0\nenabled: true\n---\n\n# ${name}\n`;

const resolverOver = (
  files: Record<string, string>,
  directories: Record<string, ReadonlyArray<{ name: string; isFolder?: boolean }>>,
  extra: Partial<SkillResolverDependencies> = {},
) =>
  createSkillResolver({
    readFile: vi.fn(async (path: string) => {
      const content = files[path];
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return encoder.encode(content);
    }),
    listDirectory: vi.fn(async (path: string) => directories[path] ?? []),
    ...extra,
  });

describe('createSkillResolver', () => {
  it('discovers a workspace skill and resolves its content', async () => {
    const resolver = resolverOver(
      { '.agents/skills/bracket/SKILL.md': skillMarkdown('bracket', 'Bracket design rules') },
      { '.agents/skills': [{ name: 'bracket', isFolder: true }] },
    );

    const listed = await resolver.listSkills();
    expect(listed.map((skill) => skill.name)).toStrictEqual(['bracket']);
    const resolved = await resolver.resolveSkill('/bracket');
    expect(resolved).toMatchObject({
      success: true,
      skillName: 'bracket',
      title: 'Bracket',
      source: 'user',
      skillPath: '.agents/skills/bracket/SKILL.md',
    });
  });

  it('has no system layer unless the host supplies one', async () => {
    const withoutSystem = resolverOver({}, {});
    expect(await withoutSystem.listSkills()).toStrictEqual([]);

    const withSystem = resolverOver(
      {},
      {},
      {
        systemSkills: [
          {
            slug: 'create-skill',
            name: 'Create Skill',
            version: '1.0.0',
            whenToUse: 'Use when authoring skills.',
            skillMarkdown: skillMarkdown('create-skill', 'Create or update Tau agent skills'),
          },
        ],
      },
    );
    const resolved = await withSystem.resolveSkill('create-skill');
    expect(resolved).toMatchObject({ success: true, source: 'system', title: 'Create Skill', supportingFiles: [] });
  });

  it('falls back to the shipped store markdown when an installed skill file is unreadable', async () => {
    const resolver = resolverOver(
      {
        '.agents/plugins/installed.json': JSON.stringify({
          skills: {
            woodworking: {
              status: 'shadowed',
              source: 'tau-store',
              installedPath: '.agents/skills/woodworking/SKILL.md',
              version: '1.0.0',
              updatedAt: '2026-09-02T00:00:00.000Z',
            },
          },
        }),
      },
      {},
    );

    const listed = await resolver.listSkills();
    expect(listed.map((skill) => skill.name)).toStrictEqual(['woodworking']);
    expect(listed[0]).toMatchObject({ source: 'tau-store', resourceUri: 'tau-store:skills/woodworking/SKILL.md' });
  });

  it('refuses an unknown skill with a typed error rather than throwing', async () => {
    await expect(resolverOver({}, {}).resolveSkill('nope')).resolves.toMatchObject({
      success: false,
      message: 'Skill not found: nope',
    });
  });
});
