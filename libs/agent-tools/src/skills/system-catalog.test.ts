import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { fingerprintSkillContent, parseSkillFrontmatter } from '#skills/skill-metadata.js';
import { createSkillResolver } from '#skills/skill-resolver.js';
import { loadSystemSkills, systemSkillCatalog } from '#skills/system-catalog.js';

/*
 * A resolution base that can see every kernel package.
 *
 * The loader is host-neutral and takes its resolver from its caller, so a test
 * has to supply one; the app that depends on all nine packages is the only
 * place in this workspace where all nine resolve, and its directory is used
 * here as a *base* rather than imported from.
 */
const workspaceRequire = createRequire(new URL('../../../../apps/ui/app/', import.meta.url));

const nodeLoader = {
  resolve: (subpath: string): string => workspaceRequire.resolve(subpath),
  readFile: async (path: string): Promise<string> => readFile(path, 'utf8'),
};

describe('the shared system-skill catalogue', () => {
  it('loads every entry under Node from the file the browser bundler inlines', async () => {
    const loaded = await loadSystemSkills(nodeLoader);

    expect(loaded.map((skill) => skill.slug)).toEqual(systemSkillCatalog.map((entry) => entry.slug));
    /* `?raw` inlines exactly the bytes at the resolved subpath, so a Node
     * fingerprint equal to that file's is a fingerprint equal to the browser's
     * for the same catalogue row. */
    const bundled = await Promise.all(
      systemSkillCatalog.map(async (entry) => ({
        entry,
        markdown: await readFile(workspaceRequire.resolve(entry.subpath), 'utf8'),
      })),
    );
    for (const { entry, markdown } of bundled) {
      const skill = loaded.find((candidate) => candidate.slug === entry.slug);
      expect(fingerprintSkillContent(skill?.skillMarkdown ?? '')).toBe(fingerprintSkillContent(markdown));
      expect(parseSkillFrontmatter(markdown, `system:skills/${entry.slug}/SKILL.md`)?.name).toBe(entry.slug);
    }
  });

  it('offers the entries a host can read and withholds the ones it cannot', async () => {
    const partial = await loadSystemSkills({
      ...nodeLoader,
      resolve: (subpath) => {
        if (subpath === '@taucad/zoo/agent') {
          throw new Error('not installed beside this host');
        }
        return workspaceRequire.resolve(subpath);
      },
    });

    expect(partial.map((skill) => skill.slug)).not.toContain('cad-zoo');
    expect(partial).toHaveLength(systemSkillCatalog.length - 1);
  });

  it('resolves a catalogue skill through the shared resolver with no workspace files', async () => {
    const resolver = createSkillResolver({
      systemSkills: await loadSystemSkills(nodeLoader),
      readFile: async () => {
        throw new Error('no workspace files');
      },
      listDirectory: async () => [],
    });

    const resolved = await resolver.resolveSkill('cad-jscad');
    expect(resolved).toMatchObject({ success: true, skillName: 'cad-jscad', source: 'system' });
  });
});
