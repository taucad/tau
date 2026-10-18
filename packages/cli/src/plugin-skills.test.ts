import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pluginSkillBundles } from '#plugin-skills.js';

const skill = '---\nname: cad-rustcad\n---\n\n# RustCAD\n';

describe('pluginSkillBundles', () => {
  let project: string;

  /** Install a plugin package in the project, with the given `tau.skills` and bundle files. */
  const install = async (name: string, options: { skills?: unknown; files?: Record<string, string> } = {}) => {
    const root = join(project, 'node_modules', ...name.split('/'));
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name, tau: { skills: options.skills } }));
    for (const [path, text] of Object.entries(options.files ?? {})) {
      // oxlint-disable-next-line no-await-in-loop -- a few fixture files, written in order.
      await mkdir(join(root, path, '..'), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- see above
      await writeFile(join(root, path), text);
    }
    return root;
  };

  const manifest = (slug: string, files: string[]) =>
    JSON.stringify({
      bundles: [
        {
          slug,
          name: 'RustCAD authoring',
          description: 'Guides RustCAD models.',
          version: '1.0.0',
          whenToUse: 'Use when editing .rcad files.',
          directory: slug,
          files,
        },
      ],
    });

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tau-plugin-skills-'));
    await writeFile(join(project, 'package.json'), '{}');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it("should offer each listed plugin package's declared bundle, read from its installed files", async () => {
    const root = await install('@acme/rustcad', {
      skills: './agent/skills.json',
      files: { 'agent/skills.json': manifest('cad-rustcad', ['SKILL.md']), 'agent/cad-rustcad/SKILL.md': skill },
    });

    const bundles = await pluginSkillBundles({ projectRoot: project, plugins: ['@acme/rustcad'] });

    const sha256 = createHash('sha256').update(skill).digest('hex');
    expect(bundles).toEqual([
      {
        slug: 'cad-rustcad',
        name: 'RustCAD authoring',
        description: 'Guides RustCAD models.',
        version: '1.0.0',
        whenToUse: 'Use when editing .rcad files.',
        body: skill,
        fingerprint: createHash('sha256')
          .update(JSON.stringify([{ path: 'SKILL.md', sha256 }]))
          .digest('hex'),
        files: [
          {
            path: 'SKILL.md',
            url: pathToFileURL(join(root, 'agent/cad-rustcad/SKILL.md')).href,
            byteLength: Buffer.byteLength(skill),
            lineCount: 6,
            contentKind: 'text',
            mediaType: 'text/markdown',
            sha256,
          },
        ],
      },
    ]);
  });

  it('should skip a plugin that is not an installed package, declares no bundle, or repeats an offered slug', async () => {
    await install('@acme/plain');
    await install('@acme/first-party', {
      skills: './agent/skills.json',
      files: { 'agent/skills.json': manifest('cad-replicad', ['SKILL.md']), 'agent/cad-replicad/SKILL.md': skill },
    });

    await expect(
      pluginSkillBundles({
        projectRoot: project,
        plugins: ['local-plugin', '@acme/plain', '@acme/first-party'],
        exclude: new Set(['cad-replicad']),
      }),
    ).resolves.toEqual([]);
  });

  it('should refuse a bundle file outside its package', async () => {
    await install('@acme/escape', {
      skills: './agent/skills.json',
      files: { 'agent/skills.json': manifest('cad-escape', ['../../../../package.json']) },
    });

    await expect(pluginSkillBundles({ projectRoot: project, plugins: ['@acme/escape'] })).rejects.toThrow(
      'must be Markdown inside the package',
    );
  });
});
