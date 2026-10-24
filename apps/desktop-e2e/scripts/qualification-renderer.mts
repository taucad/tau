/* oxlint-disable no-await-in-loop -- Observe sequential UI saves and bounded filesystem polling. */
/** Drive the installed renderer over loopback CDP; no main inspector, fixture gateway, or injected filesystem. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { z } from 'zod';
/* oxlint-disable-next-line no-restricted-imports -- Installed qualification owns the bounded native close driver. */
import { requestQualificationQuit } from './qualification-quit.mjs';

const source =
  'from dataclasses import dataclass\nfrom build123d import Box, Shape\n\n@dataclass(frozen=True)\nclass Params:\n    width: float = 12\n    depth: float = 18\n    height: float = 6\n\ndef main(params: Params) -> Shape:\n    return Box(params.width, params.depth, params.height)\n';
const readNativeClipboard = async (): Promise<string> => {
  const command =
    process.platform === 'darwin'
      ? { executable: '/usr/bin/pbpaste', args: [] }
      : process.platform === 'win32'
        ? {
            executable: 'powershell.exe',
            args: ['-NoProfile', '-NonInteractive', '-Command', '[Console]::Write((Get-Clipboard -Raw))'],
          }
        : { executable: 'xclip', args: ['-selection', 'clipboard', '-o'] };
  const { stdout } = await promisify(execFile)(command.executable, command.args, {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const findSource = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await findSource(path)));
    } else if (entry.name === 'main.py') {
      result.push(path);
    }
  }
  return result;
};
const exportGeometry = async (
  page: Page,
  projectRoot: string,
): Promise<{ path: string; sha256: string; vertices: number }> => {
  const directory = join(projectRoot, 'exports');
  const previousNames = await readdir(directory).catch(() => []);
  const before = new Map(
    await Promise.all(
      previousNames.map(async (name) => {
        const entry = await stat(join(directory, name));
        return [name, entry.mtimeMs] as const;
      }),
    ),
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const formats = page.getByRole('region', { name: 'Formats' });
  await formats.waitFor({ state: 'visible' });
  for (const selected of await formats.locator('button[aria-pressed="true"]').all()) {
    const selectedText = await selected.textContent();
    if (selectedText?.trim().toLowerCase() !== 'glb') {
      await selected.click();
    }
  }
  const glb = formats.getByRole('button', { name: 'glb', exact: true });
  if ((await glb.getAttribute('aria-pressed')) !== 'true') {
    await glb.click();
  }
  const download = page.getByLabel('Download to disk');
  if (await download.isChecked()) {
    await download.click();
  }
  const save = page.getByLabel('Save to project');
  if (!(await save.isChecked())) {
    await save.click();
  }
  await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    for (const name of await readdir(directory).catch(() => [])) {
      const path = join(directory, name);
      const entry = await stat(path);
      if (!name.endsWith('.glb') || entry.mtimeMs === before.get(name)) {
        continue;
      }
      const bytes = await readFile(path);
      if (
        bytes.length < 20 ||
        bytes.readUInt32LE(0) !== 0x46_54_6c_67 ||
        bytes.readUInt32LE(4) !== 2 ||
        bytes.readUInt32LE(8) !== bytes.length ||
        bytes.readUInt32LE(16) !== 0x4e_4f_53_4a
      ) {
        throw new Error('Export is not a complete GLB');
      }
      const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
        meshes?: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
        accessors?: Array<{ count: number }>;
      };
      const vertices = (document.meshes ?? [])
        .flatMap((mesh) => mesh.primitives)
        .reduce((total, primitive) => total + (document.accessors?.[primitive.attributes.POSITION]?.count ?? 0), 0);
      if (!Number.isSafeInteger(vertices) || vertices < 3) {
        throw new Error('Export contains no actual geometry');
      }
      return { path, sha256: createHash('sha256').update(bytes).digest('hex'), vertices };
    }
    await wait(250);
  }
  throw new Error('Installed renderer did not produce a fresh geometry export');
};
const main = async (): Promise<void> => {
  if (process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1') {
    throw new Error('Renderer qualification requires an explicitly disposable host');
  }
  const profile = resolve(process.env['TAU_QUALIFICATION_PROFILE'] ?? '');
  const output = process.env['TAU_QUALIFICATION_RENDERER_OUTPUT'];
  const stage = process.env['TAU_QUALIFICATION_STAGE'];
  if (!output || !['a', 'b', 'c'].includes(stage ?? '') || !process.env['TAU_QUALIFICATION_PROFILE']) {
    throw new Error('Qualification profile, stage and output are required');
  }
  const portText = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
  const port = Number(portText.split('\n')[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid renderer debugging port');
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    let page: Page | undefined;
    const rendererDeadline = Date.now() + 120_000;
    while (!page && Date.now() < rendererDeadline) {
      page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().startsWith('app://tau/'));
      if (!page) {
        await wait(100);
      }
    }
    if (!page) {
      throw new Error('Installed app renderer unavailable');
    }
    page.setDefaultTimeout(120_000);
    const action = process.env['TAU_QUALIFICATION_RENDERER_ACTION'];
    if (action === 'uri' || action === 'file') {
      if (action === 'uri') {
        await page.waitForURL((url) => url.protocol === 'app:' && url.host === 'tau' && url.pathname === '/machines');
      } else {
        const filename = process.env['TAU_QUALIFICATION_OPEN_FILE'];
        if (!filename || basename(filename) !== filename || !filename.endsWith('.glb')) {
          throw new Error('Expected an exported GLB basename');
        }
        await page.waitForURL(
          (url) =>
            url.protocol === 'app:' &&
            url.host === 'tau' &&
            url.pathname === '/import' &&
            url.searchParams.get('desktop-open') === '1',
        );
        await page.getByText(filename, { exact: true }).first().waitFor({ state: 'visible' });
      }
      await writeFile(
        output,
        JSON.stringify({
          stage,
          action,
          url: page.url(),
          filename: process.env['TAU_QUALIFICATION_OPEN_FILE'],
          observedAt: new Date().toISOString(),
        }),
        { flag: 'wx' },
      );
      return;
    }
    if (action === 'offline' || action === 'check' || action === 'retry') {
      const interrupted = page.getByRole('button', { name: 'Update interrupted', exact: true });
      await interrupted.waitFor({ state: 'visible', timeout: 600_000 });
      if (action === 'check' || action === 'retry') {
        await interrupted.click();
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        if (action === 'check') {
          await page
            .getByRole('button', { name: 'Update ready', exact: true })
            .waitFor({ state: 'visible', timeout: 600_000 });
        }
      }
      await writeFile(
        output,
        JSON.stringify({ stage, action, url: page.url(), observedAt: new Date().toISOString() }),
        { flag: 'wx' },
      );
      return;
    }
    if (action === 'quit' || action === 'quit-ready' || action === 'reinstall-quit') {
      if (action === 'quit-ready') {
        await page
          .getByRole('button', { name: 'Update ready', exact: true })
          .waitFor({ state: 'visible', timeout: 600_000 });
      }
      const session = await browser.newBrowserCDPSession();
      const { processInfo } = await session.send('SystemInfo.getProcessInfo');
      const mainProcess = processInfo.find((entry) => entry.type === 'browser');
      if (!mainProcess) {
        throw new Error('CDP did not identify its browser process');
      }
      const expectedPid =
        action === 'reinstall-quit'
          ? z.coerce.number().int().positive().parse(process.env['TAU_QUALIFICATION_EXPECTED_PID'])
          : undefined;
      await requestQualificationQuit(profile, mainProcess.id, expectedPid);
      return;
    }
    if (action === 'reinstall-ui') {
      const expectedPid = z.coerce.number().int().positive().parse(process.env['TAU_QUALIFICATION_EXPECTED_PID']);
      const session = await browser.newBrowserCDPSession();
      const { processInfo } = await session.send('SystemInfo.getProcessInfo');
      if (!processInfo.some((entry) => entry.type === 'browser' && entry.id === expectedPid)) {
        throw new Error('Reinstalled browser PID mismatch');
      }
    }
    const logOffset = Number(process.env['TAU_QUALIFICATION_LOG_OFFSET']);
    if (!Number.isSafeInteger(logOffset) || logOffset < 0) {
      throw new Error('Fresh process log offset required');
    }
    if (stage !== 'a' || process.env['TAU_QUALIFICATION_PROJECT_URL']) {
      const projectUrl = process.env['TAU_QUALIFICATION_PROJECT_URL'];
      if (!projectUrl?.startsWith('app://tau/w/')) {
        throw new Error('Retained project route required');
      }
      await page.goto(projectUrl);
    }
    if (stage === 'a' && !process.env['TAU_QUALIFICATION_PROJECT_URL']) {
      await page.goto('app://tau/projects/new');
      await page.getByLabel('Project Name *', { exact: true }).fill('Qualification retained project');
      await page.locator('label[for="kernel-build123d"]').click();
      await page.getByRole('button', { name: /^Create Project/u }).click();
      await page.getByRole('tab', { name: 'main.py', exact: true }).last().click();
      await page.locator('.monaco-editor').first().waitFor({ state: 'visible' });
      await page.locator('.monaco-editor').first().locator('.native-edit-context, textarea.inputarea').last().focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
      const previousClipboard = await readNativeClipboard();
      try {
        await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
      } finally {
        await page.evaluate(async (text) => navigator.clipboard.writeText(text), previousClipboard);
      }
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
    }
    const projectMatch = /^\/w\/home\/([a-z0-9-]+)$/u.exec(new URL(page.url()).pathname);
    if (!projectMatch?.[1]) {
      throw new Error('Qualification must retain the shipping Home project route');
    }
    const activeProjectRoot = join(profile, 'home', projectMatch[1]);
    let savedPath: string | undefined;
    const deadline = Date.now() + 120_000;
    while (!savedPath && Date.now() < deadline) {
      for (const candidate of await findSource(activeProjectRoot)) {
        if (sha256(await readFile(candidate, 'utf8')) === sha256(source)) {
          savedPath = candidate;
          break;
        }
      }
      if (!savedPath) {
        await wait(250);
      }
    }
    if (!savedPath) {
      throw new Error('Shipping renderer did not retain the expected project bytes');
    }
    await page
      .getByTestId('cad-viewer-canvas-region')
      .locator('canvas')
      .waitFor({ state: 'visible', timeout: 900_000 });
    if (await page.getByRole('alert', { name: 'CAD runtime error' }).isVisible()) {
      throw new Error('Native CAD runtime failed');
    }
    const exported = await exportGeometry(page, dirname(savedPath));
    const logBytes = await readFile(join(profile, 'logs', 'desktop.log'));
    const log = logBytes.subarray(logOffset).toString();
    const native = log.split('\n').filter((line) => {
      const match = /^\S+ INFO (native\.store|native\.prepared) (\{.*\})$/u.exec(line);
      if (!match?.[2]) {
        return false;
      }
      const data = z.record(z.string(), z.unknown()).parse(JSON.parse(match[2]));
      return match[1] === 'native.store'
        ? z.array(z.string()).parse(data['kernels']).includes('build123d')
        : data['status'] === 'ready' && data['kernel'] === 'build123d';
    });
    if (native.length === 0) {
      throw new Error('Installed renderer produced no fresh admitted Build123d payload record');
    }
    await page.screenshot({ path: `${output}.png`, fullPage: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          schemaVersion: 1,
          stage,
          url: page.url(),
          project: { path: relative(profile, savedPath), sha256: sha256(source) },
          nativeEngineLogs: native,
          exported,
          logOffset,
          observedAt: new Date().toISOString(),
        },
        undefined,
        2,
      ),
      { flag: 'wx' },
    );
  } finally {
    // CDP disconnect leaves the shipping process alive for the actual updater.
    await browser.close();
  }
};
await main();
