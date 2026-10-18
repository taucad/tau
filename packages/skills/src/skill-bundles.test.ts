// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { installSkills, normalizeBundlePath, resolveSkillBundles, skillOwners } from '#skill-bundles.js';

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchDirectories.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('@taucad/skills', () => {
  it('should resolve a bundle for every declared owner', async () => {
    const bundles = await resolveSkillBundles();

    /* A missing row means an owner stopped declaring `tau.skills`, which is
     * exactly the silent drop this package exists to make loud. */
    expect(bundles.map((bundle) => bundle.owner).sort()).toEqual([...skillOwners].sort());
    for (const bundle of bundles) {
      expect(bundle.slug).toMatch(/^[\da-z-]+$/);
      expect(bundle.files.length).toBeGreaterThan(0);
    }
  });

  it('should install the approved workbench skill from its owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'taucad-workbench-skill-'));
    scratchDirectories.push(directory);
    expect(await installSkills(directory, ['@taucad/workbench'])).toEqual(['workbench']);
    const body = await readFile(join(directory, 'workbench', 'SKILL.md'), 'utf8');
    expect(body).toContain('Read before you rearrange');
    expect(body).toContain('arrange_workbench');
  });

  it('should address every bundle file by bare specifier through its owner', async () => {
    const bundles = await resolveSkillBundles();

    /* The self-containment property: a consumer that declares only the
     * dependency can reach every file. A path join into `node_modules` would
     * pass a smoke test here and fail on any host with a different layout. */
    for (const bundle of bundles) {
      for (const file of bundle.files) {
        expect(file.specifier.startsWith(`${bundle.owner}/`)).toBe(true);
        expect(file.specifier).not.toContain('/./');
        expect(file.specifier).not.toContain('/../');
        expect(file.url.startsWith('file:')).toBe(true);
      }
    }
  });

  it('should carry no bundle of its own', async () => {
    const bundles = await resolveSkillBundles();

    /* R20: dependency-only. A file resolved out of `@taucad/skills` itself is a
     * second copy, and a second copy is the drift the meta-package prevents. */
    for (const bundle of bundles) {
      for (const file of bundle.files) {
        expect(file.url).not.toContain('/packages/skills/');
      }
    }
  });

  it('should install a declared bundle into the host skills layout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'taucad-skills-'));
    scratchDirectories.push(directory);

    expect(await installSkills(directory, ['@taucad/replicad'])).toEqual(['cad-replicad']);
    expect(await readFile(join(directory, 'cad-replicad', 'SKILL.md'), 'utf8')).toContain('name: cad-replicad');
    expect(await readFile(join(directory, 'cad-replicad', 'SKILL.md'), 'utf8')).toContain('tau-authoring-reference.md');
    expect(await readFile(join(directory, 'cad-replicad', 'api-index.md'), 'utf8')).toContain('replicad API index');
    expect(await readFile(join(directory, 'cad-replicad', 'tau-api-index.md'), 'utf8')).toContain('ShapeConfig');
    expect(await readFile(join(directory, 'cad-replicad', 'tau-authoring-reference.md'), 'utf8')).toContain(
      'KHR_materials_volume',
    );
    expect(await readFile(join(directory, 'cad-replicad', 'kinematics-reference.md'), 'utf8')).toContain(
      '## Joints and degree-of-freedom IDs',
    );
  });

  it('should own every plugin bundle, or name why the plugin declares none', async () => {
    const pluginsRoot = new URL('../../plugins/', import.meta.url);
    const plugins = await readdir(pluginsRoot, { withFileTypes: true });
    const manifests = await Promise.all(
      plugins
        .filter((entry) => entry.isDirectory())
        .map(async ({ name }) => {
          const source = await readFile(new URL(`${name}/package.json`, pluginsRoot), 'utf8');
          return JSON.parse(source) as {
            readonly name: string;
            readonly exports?: Readonly<Record<string, unknown>>;
            readonly tau?: { readonly skills?: unknown; readonly reason?: unknown };
          };
        }),
    );

    /*
     * First-party enrichment only: this walks Tau's own plugins. A third-party package's `tau.skills` reaches hosts
     * through the plugin listing and needs no row here. `tau.skills: null` with a reason is the declared opt-out (see
     * `skillOwners`); anything else is a forgotten row.
     */
    for (const manifest of manifests) {
      const declared = manifest.tau?.skills;
      if (typeof declared === 'string') {
        expect(skillOwners, manifest.name).toContain(manifest.name);
      } else {
        expect(declared, manifest.name).toBeNull();
        expect(manifest.tau?.reason, manifest.name).toEqual(expect.stringMatching(/\S/u));
        expect(manifest.exports ?? {}, manifest.name).not.toHaveProperty(['./agent']);
        expect(skillOwners, manifest.name).not.toContain(manifest.name);
      }
    }
  });

  it('should reject manifest paths that can escape their bundle', () => {
    expect(() => normalizeBundlePath('../outside')).toThrow(/must stay relative/u);
    expect(() => normalizeBundlePath(String.raw`nested\..\outside`)).toThrow(/must stay relative/u);
    expect(normalizeBundlePath('./api-index.md')).toBe('api-index.md');
  });
});
