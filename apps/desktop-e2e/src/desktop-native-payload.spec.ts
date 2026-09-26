/* oxlint-disable no-await-in-loop -- Each negative case temporarily withholds one payload and must restore it before the next. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron } from 'playwright';
import { expect, test } from 'vitest';

import { desktopE2EPackagedExecutable } from '#support/config.js';
import type { ElectronApplication } from 'playwright';

type UtilityProbeResult =
  | {
      readonly esbuildExecutable: string;
      readonly esbuildVersion: string;
      readonly nanorasterAddon: string;
      readonly nanorasterBackend: string;
      readonly ok: true;
      readonly opaquePixels: number;
      readonly optionRenderedBytes: number;
      readonly renderedBytes: number;
      readonly transparentPixels: number;
    }
  | { readonly error: string; readonly ok: false };

const workspaceRoot = resolvePath(import.meta.dirname, '../../..');

const runUtilityProbe = async (
  application: ElectronApplication,
  options: Readonly<{ cwd: string; entry: string; esbuildExecutable: string }>,
): Promise<UtilityProbeResult> =>
  application.evaluate(
    async ({ utilityProcess }, options) =>
      new Promise<UtilityProbeResult>((resolve) => {
        const utility = utilityProcess.fork(options.entry, [], {
          cwd: options.cwd,
          env: {
            LANG: 'C.UTF-8',
            PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
            TMPDIR: options.cwd,
            ESBUILD_BINARY_PATH: options.esbuildExecutable,
          },
          serviceName: 'tau-native-package-probe',
        });
        let settled = false;
        utility.once('message', (message: UtilityProbeResult) => {
          settled = true;
          resolve(message);
          utility.kill();
        });
        utility.once('exit', (code) => {
          if (!settled) {
            resolve({ error: `utility exited before reporting: ${String(code)}`, ok: false });
          }
        });
      }),
    options,
  );

test('[completed-artifact] loads native esbuild and nanoraster inside an Electron utility process', async () => {
  const executable = desktopE2EPackagedExecutable();
  const sourceApp = resolvePath(dirname(executable), '../..');
  const runRoot = await mkdtemp(join(tmpdir(), 'tau-native-payload-'));
  const app = join(runRoot, 'Tau.app');
  const utilityEntry = join(runRoot, 'native-payload-probe.mjs');
  const fixture = await readFile(join(workspaceRoot, 'packages/plugins/gltf/src/fixtures/cube.glb'));
  /* APFS clones through BSD `cp -c`, as `copyTree` in apps/desktop/scripts/runtime-closure.mts does:
   * `fs.cp` with COPYFILE_FICLONE byte-copies the whole 1.3 GB bundle on macOS. */
  await promisify(execFile)('/bin/cp', ['-c', '-R', `${sourceApp}/`, app]);

  const asarRoot = join(app, 'Contents/Resources/app.asar/node_modules');
  const esbuildEntry = join(asarRoot, 'esbuild/lib/main.js');
  const esbuildExecutable = join(
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/@esbuild/darwin-arm64/bin/esbuild',
  );
  const nanorasterEntry = join(asarRoot, 'nanoraster/dist/index.node.mjs');
  const nanorasterAddon = join(
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/nanoraster-darwin-arm64/nanoraster.darwin-arm64.node',
  );
  await writeFile(
    utilityEntry,
    `
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

const parentPort = process.parentPort;
if (!parentPort) throw new Error('native payload probe requires an Electron utility process');
try {
  const require = createRequire(import.meta.url);
  const esbuild = require(${JSON.stringify(esbuildEntry)});
  const transformed = await esbuild.transform('const answer: number = 42', { loader: 'ts' });
  if (!transformed.code.includes('answer = 42')) throw new Error('esbuild returned unexpected output');
  const processes = execFileSync('/bin/ps', ['-axo', 'ppid=,comm='], { encoding: 'utf8' });
  const esbuildExecutable = processes.split('\\n').map((line) => /^\\s*(\\d+)\\s+(.+)$/u.exec(line))
    .find((row) => row?.[1] === String(process.pid) && row[2]?.endsWith('/bin/esbuild'))?.[2];
  if (!esbuildExecutable) throw new Error('normal esbuild loader started no adjacent platform executable');
  const resolvedEsbuildExecutable = realpathSync(esbuildExecutable);
  esbuild.stop();

  const nanoraster = await import(${JSON.stringify(nanorasterEntry)});
  const adapter = await nanoraster.describeAdapter();
  const image = await nanoraster.renderImage(
    Uint8Array.from(Buffer.from(${JSON.stringify(fixture.toString('base64'))}, 'base64')),
    { width: 32, height: 32, format: 'raw' },
  );
  const optionImage = await nanoraster.renderImage(
    Uint8Array.from(Buffer.from(${JSON.stringify(fixture.toString('base64'))}, 'base64')),
    {
      width: 48,
      height: 24,
      format: 'raw',
      background: '#00000000',
      camera: {
        framing: 'fit',
        direction: [0, 1, 0],
        up: [0, 0, 1],
        margin: 0.2,
        projection: { kind: 'orthographic' },
      },
    },
  );
  const renderedBytes = image.bytes.byteLength;
  const optionRenderedBytes = optionImage.bytes.byteLength;
  let transparentPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < optionImage.bytes.byteLength; offset += 4) {
    if (optionImage.bytes[offset] === 0) transparentPixels += 1;
    if (optionImage.bytes[offset] === 255) opaquePixels += 1;
  }
  if (transparentPixels === 0 || opaquePixels === 0) {
    throw new Error('nondefault transparent render did not contain both background and geometry pixels');
  }
  const nanorasterAddon = process.report.getReport().sharedObjects
    .find((path) => path.endsWith('/nanoraster.darwin-arm64.node'));
  if (!nanorasterAddon) throw new Error('nanoraster loaded no adjacent platform addon');
  parentPort.postMessage({
    esbuildExecutable: resolvedEsbuildExecutable,
    esbuildVersion: esbuild.version,
    nanorasterAddon: realpathSync(nanorasterAddon),
    nanorasterBackend: adapter.backend,
    ok: true,
    opaquePixels,
    optionRenderedBytes,
    renderedBytes,
    transparentPixels,
  });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.stack ?? error.message : String(error), ok: false });
}
`,
  );

  const application = await electron.launch({
    executablePath: join(app, 'Contents/MacOS/Tau'),
    args: [`--user-data-dir=${join(runRoot, 'user-data')}`],
    env: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TAU_E2E_KEEP_PATH: '1', TMPDIR: runRoot },
  });
  try {
    const positive = await runUtilityProbe(application, { cwd: runRoot, entry: utilityEntry, esbuildExecutable });
    if (!positive.ok) {
      throw new Error(`Packaged native payload probe failed:\n${positive.error}`);
    }
    expect(positive).toMatchObject({
      esbuildExecutable: await realpath(esbuildExecutable),
      nanorasterAddon: await realpath(nanorasterAddon),
      nanorasterBackend: 'metal',
      ok: true,
      optionRenderedBytes: 48 * 24 * 4,
      renderedBytes: 32 * 32 * 4,
    });
    expect(positive.opaquePixels).toBeGreaterThan(0);
    expect(positive.transparentPixels).toBeGreaterThan(0);

    for (const nativePayload of [esbuildExecutable, nanorasterAddon]) {
      const withheld = `${nativePayload}.withheld`;
      await rename(nativePayload, withheld);
      try {
        const missing = await runUtilityProbe(application, { cwd: runRoot, entry: utilityEntry, esbuildExecutable });
        expect(missing.ok).toBe(false);
        expect(missing).toHaveProperty('error');
      } finally {
        await rename(withheld, nativePayload);
      }
    }
  } finally {
    await application.close();
    await rm(runRoot, { force: true, recursive: true });
  }
});
