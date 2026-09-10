import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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
  it('loads every entry from the same manifest bytes the browser compiles in', async () => {
    const loaded = await loadSystemSkills(nodeLoader);

    expect(loaded.map((skill) => skill.slug)).toEqual(systemSkillCatalog.map((entry) => entry.slug));

    /*
     * Each subpath now names `agent/skills.json`, which both hosts read: Node
     * parses it here, the browser imports it with `type: 'json'`. So equality
     * with the manifest's own `body` is equality with what the browser renders.
     *
     * The `SKILL.md` beside it is asserted too, because the body is stored
     * twice — inline for JS consumers, on disk for a host that just drops the
     * directory into `.agents/skills/`. Two copies that must not diverge is
     * exactly the thing worth a test.
     */
    const inspected = await Promise.all(
      systemSkillCatalog.map(async (entry) => {
        const manifestPath = workspaceRequire.resolve(entry.subpath);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
          readonly bundles: ReadonlyArray<{ readonly directory: string; readonly body: string }>;
        };
        const bundle = manifest.bundles[0];
        const onDisk = await readFile(
          new URL(`${bundle?.directory ?? '.'}/SKILL.md`, pathToFileURL(manifestPath)),
          'utf8',
        );
        return { entry, bundle, onDisk };
      }),
    );

    for (const { entry, bundle, onDisk } of inspected) {
      const skill = loaded.find((candidate) => candidate.slug === entry.slug);

      expect(fingerprintSkillContent(skill?.skillMarkdown ?? '')).toBe(fingerprintSkillContent(bundle?.body ?? ''));
      expect(fingerprintSkillContent(onDisk)).toBe(fingerprintSkillContent(bundle?.body ?? ''));
      expect(parseSkillFrontmatter(onDisk, `system:skills/${entry.slug}/SKILL.md`)?.name).toBe(entry.slug);
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
