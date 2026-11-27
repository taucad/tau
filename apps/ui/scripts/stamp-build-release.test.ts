// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseManifestName, stampBuildRelease } from '#scripts/stamp-build-release.mts';
/* oxlint-disable eslint/no-restricted-imports -- This test exercises the build configuration seam directly. */
import { resolveTauBuildRelease, unstampedBuildRelease } from '../build-environment.js';
/* oxlint-enable eslint/no-restricted-imports */

const appRoot = resolve(import.meta.dirname, '..');
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

/** A finished build as `ui:build` leaves it: the placeholder in two server scripts, one of them nested. */
const fakeBuild = async (): Promise<string> => {
  const build = await mkdtemp(join(tmpdir(), 'tau-ui-stamp-'));
  directories.push(build);
  await mkdir(join(build, 'server/assets'), { recursive: true });
  await mkdir(join(build, 'client'), { recursive: true });
  await writeFile(join(build, 'server/index.js'), `const release = "${unstampedBuildRelease}";\nexport { release };\n`);
  await writeFile(join(build, 'server/assets/server-build.mjs'), `globalThis.r = '${unstampedBuildRelease}';\n`);
  await writeFile(join(build, 'server/assets/server-build.js.map'), `{"names":["${unstampedBuildRelease}"]}\n`);
  return build;
};

describe('stampBuildRelease', () => {
  it('should stamp the release of the checked-out commit, and publish it, after the build', async () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the deploy's own variable name.
    const release = resolveTauBuildRelease({ GITHUB_SHA: head });
    const build = await fakeBuild();
    const before = await readFile(join(build, 'server/index.js'), 'utf8');

    expect(release).toBe(head.slice(0, 12));
    expect(await stampBuildRelease(build, release!)).toEqual(['assets/server-build.mjs', 'index.js']);

    const after = await readFile(join(build, 'server/index.js'), 'utf8');
    expect(after).toBe(`const release = "${head.slice(0, 12)}";\nexport { release };\n`);
    // Same length, so the server source maps still point at the right columns.
    expect(after).toHaveLength(before.length);
    expect(await readFile(join(build, 'server/assets/server-build.mjs'), 'utf8')).toContain(`'${head.slice(0, 12)}'`);
    expect(await readFile(join(build, 'server/assets/server-build.js.map'), 'utf8')).toContain(unstampedBuildRelease);
    expect(JSON.parse(await readFile(join(build, 'client', releaseManifestName), 'utf8'))).toEqual({
      release: head.slice(0, 12),
    });
  });

  it('should refuse a build that holds no placeholder, such as one already stamped', async () => {
    const build = await fakeBuild();
    await stampBuildRelease(build, 'abcdef012345');

    await expect(stampBuildRelease(build, '0123456789ab')).rejects.toThrow('holds the release placeholder');
  });

  it('should refuse a label that would move the bytes after it', async () => {
    await expect(stampBuildRelease(await fakeBuild(), 'abcdef0')).rejects.toThrow('12 characters');
  });

  it('should compile the placeholder, not the commit, into the server graph', async () => {
    const config = await readFile(join(appRoot, 'vite.config.ts'), 'utf8');
    const project = JSON.parse(await readFile(join(appRoot, 'project.json'), 'utf8')) as {
      targets: Record<string, { inputs?: ReadonlyArray<string | Record<string, string>> }>;
    };

    expect(config).toContain('tauBuildRelease: JSON.stringify(unstampedBuildRelease)');
    expect(config).not.toContain('resolveTauBuildRelease');
    expect(project.targets['build']?.inputs).not.toContainEqual({ env: 'GITHUB_SHA' });
    expect(project.targets['build']?.inputs).not.toContainEqual({ env: 'COMMIT_REF' });
  });
});
