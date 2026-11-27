// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { checkBuild, inspectChunk } from '#scripts/check-route-module-patch.mts';

const scriptPath = fileURLToPath(new URL('check-route-module-patch.mts', import.meta.url));

/** React Router 8's loader as its minified client build prints it, before and after Tau's patch. */
const unpatchedChunk =
  'async function Ue(e,t){if(e.id in t)return t[e.id];try{let n=await import(e.module);return t[e.id]=n,n}catch(n){' +
  'return console.error("Error loading route module `"+e.module+"`, reloading page..."),console.error(n),' +
  'window.__reactRouterContext&&window.__reactRouterContext.isSpaMode,window.location.reload(),new Promise(()=>{})}}';
const patchedChunk =
  'async function Ue(e,t){if(e.id in t)return t[e.id];try{let n=await import(e.module);return t[e.id]=n,n}catch(n){' +
  'console.error("Error loading route module `"+e.module+"`, reloading page..."),console.error(n);' +
  'let r=window.__reactRouterDataRouter,a=r&&r.state.navigation,o=a&&a.location&&(!a.formMethod||' +
  'a.formMethod.toUpperCase()==="GET")?r.createHref(a.location):void 0;o!==void 0&&o!==window.location.pathname+' +
  'window.location.search+window.location.hash?window.location.assign(o):window.location.reload();' +
  'return new Promise(()=>{})}}';

let buildRoot: string | undefined;

afterEach(async () => {
  if (buildRoot !== undefined) {
    await rm(buildRoot, { recursive: true, force: true });
    buildRoot = undefined;
  }
});

/** Writes a build whose `client/assets` holds the given chunks and returns its directory. */
const writeBuild = async (chunks: Readonly<Record<string, string>>): Promise<string> => {
  buildRoot = await mkdtemp(join(tmpdir(), 'check-route-module-patch-'));
  const root = buildRoot;
  await mkdir(join(root, 'client', 'assets'), { recursive: true });
  await Promise.all(
    Object.entries(chunks).map(async ([name, contents]) => writeFile(join(root, 'client', 'assets', name), contents)),
  );
  return root;
};

describe('check-route-module-patch', () => {
  it('should count a patched loader and flag an unpatched one', () => {
    expect(inspectChunk(patchedChunk)).toEqual({ loaders: 1, unpatched: 0 });
    expect(inspectChunk(unpatchedChunk)).toEqual({ loaders: 1, unpatched: 1 });
    expect(inspectChunk('export const x = 1;')).toEqual({ loaders: 0, unpatched: 0 });
  });

  it('should pass a build whose client ships the patched loader', async () => {
    const directory = await writeBuild({ 'entry.client-a1b2c3d4.js': patchedChunk, 'root-a1b2c3d4.js': '' });

    expect(checkBuild(directory)).toEqual([]);
  });

  it('should fail a build that ships the loader unpatched, or no loader at all', async () => {
    const unpatched = await writeBuild({ 'entry.client-a1b2c3d4.js': unpatchedChunk });
    expect(checkBuild(unpatched)).toEqual([expect.stringContaining("without Tau's route-module patch")]);
    await rm(unpatched, { recursive: true, force: true });

    const empty = await writeBuild({ 'root-a1b2c3d4.js': '' });
    expect(checkBuild(empty)).toEqual([expect.stringContaining('no loadRouteModule found')]);
  });

  it('should fail a build that never ran', async () => {
    const directory = await writeBuild({});

    expect(checkBuild(join(directory, 'missing'))).toEqual([
      expect.stringContaining('is missing: run the build first'),
    ]);
  });

  it('should exit 1 and name the chunk on an unpatched build', async () => {
    const directory = await writeBuild({ 'entry.client-a1b2c3d4.js': unpatchedChunk });

    const { status, stderr } = spawnSync(process.execPath, [scriptPath, directory], { encoding: 'utf8' });

    expect(status).toBe(1);
    expect(stderr).toContain("entry.client-a1b2c3d4.js: loadRouteModule without Tau's route-module patch");
  });

  it('should find the patch in both build files of the installed React Router', () => {
    // The install applies `tools/pnpm/patches/react-router@<version>.patch`; the package's exports pick the development or
    // production file by condition, so both must carry it.
    const require = createRequire(import.meta.url);
    const packageDirectory = dirname(require.resolve('react-router/package.json'));
    for (const condition of ['development', 'production']) {
      const loader = readFileSync(join(packageDirectory, 'dist', condition, 'lib/dom/ssr/routeModules.js'), 'utf8');
      expect(inspectChunk(loader), condition).toEqual({ loaders: 1, unpatched: 0 });
    }
  });
});
