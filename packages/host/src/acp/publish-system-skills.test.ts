import { createHash } from 'node:crypto';
import type * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, expect, it, vi } from 'vitest';

import type { HostSystemSkillBundle } from '#agent-tools.js';
import { publishSystemSkills } from '#acp/run.js';

/* Windows' answer to renaming a directory onto an existing one, wherever the test runs. */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  const rename: typeof actual.rename = async (from, to) => {
    if (
      await actual.stat(to).then(
        () => true,
        () => false,
      )
    ) {
      throw Object.assign(new Error(`EPERM: operation not permitted, rename '${String(from)}' -> '${String(to)}'`), {
        code: 'EPERM',
      });
    }
    await actual.rename(from, to);
  };
  return { ...actual, rename };
});

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

it('should reuse a publication that already exists when the platform refuses the rename with EPERM', async () => {
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-acp-publish-config-'));
  const source = await mkdtemp(join(tmpdir(), 'tau-acp-publish-source-'));
  roots.push(configDirectory, source);
  vi.stubEnv('TAU_CONFIG_DIR', configDirectory);
  const body = '---\nname: fixture-skill\ndescription: Fixture skill\n---\nUse it.\n';
  await writeFile(join(source, 'SKILL.md'), body);
  const bundle: HostSystemSkillBundle = {
    slug: 'fixture-skill',
    name: 'fixture-skill',
    description: 'Fixture skill',
    version: '1.0.0',
    whenToUse: 'Fixture tests',
    body,
    fingerprint: 'fixture',
    files: [
      {
        path: 'SKILL.md',
        url: pathToFileURL(join(source, 'SKILL.md')).href,
        byteLength: Buffer.byteLength(body),
        lineCount: 5,
        contentKind: 'text',
        mediaType: 'text/markdown',
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    ],
  };

  const first = await publishSystemSkills([bundle], new AbortController().signal);
  const second = await publishSystemSkills([bundle], new AbortController().signal);

  expect(second).toEqual(first);
  expect(await readFile(join(first!.root, '.agents', 'skills', 'fixture-skill', 'SKILL.md'), 'utf8')).toBe(body);
});
