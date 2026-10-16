/**
 * The served view of a UI build that carries the daemon's client environment (`tau serve --ui` under
 * `TAU_ACQUISITION`): served through `@taucad/host`'s own static handler, the shell sets `window.ENV.TAU_ACQUISITION`
 * before anything else runs, every asset is the build's byte, and the build itself is never written.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { serveStaticUi } from '@taucad/host';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { injectClientEnvironment, stageUiEnvironment } from '#ui-environment.js';

/* eslint-disable @typescript-eslint/naming-convention -- window.ENV keys keep their environment variable names. */

const shell =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head><body><script>window.ENV = { ...{"TAU_ACQUISITION":"open","TAU_API_URL":"https://api.tau.new"}, ...(window.ENV ?? {}) }</script></body></html>';
const chunk = 'export const ready = true;\n';

describe('stageUiEnvironment', () => {
  let build: string;

  beforeEach(async () => {
    build = await mkdtemp(join(tmpdir(), 'tau-ui-build-'));
    await mkdir(join(build, 'assets'));
    await writeFile(join(build, 'index.html'), shell);
    await writeFile(join(build, 'assets', 'entry.js'), chunk);
  });

  afterEach(async () => {
    await rm(build, { recursive: true, force: true });
  });

  it('should serve a shell whose window.ENV carries the locked profile over the build value, and the build assets', async () => {
    const staged = await stageUiEnvironment(build, { TAU_ACQUISITION: 'locked' });
    const ui = serveStaticUi({ root: staged.root, cookieName: 'tau_host_session', cookieValue: 'secret' });
    const server = createServer((request, response) => {
      ui.handle(request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const { port } = server.address() as AddressInfo;
      const shellResponse = await fetch(`http://127.0.0.1:${String(port)}/projects/demo`);
      const page = await shellResponse.text();
      const asset = await fetch(`http://127.0.0.1:${String(port)}/assets/entry.js`);
      const scripts = [...page.matchAll(/<script>(?<body>.*?)<\/script>/gu)].map((match) => match.groups?.['body']);
      const window: { ENV?: Record<string, string> } = {};
      for (const body of scripts) {
        runInNewContext(body ?? '', { window });
      }

      expect(page.indexOf('<script>')).toBe(page.indexOf('<head>') + '<head>'.length);
      expect(window.ENV).toEqual({ TAU_ACQUISITION: 'locked', TAU_API_URL: 'https://api.tau.new' });
      expect(asset.status).toBe(200);
      expect(asset.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
      expect(await asset.text()).toBe(chunk);
      expect(await readFile(join(build, 'index.html'), 'utf8')).toBe(shell);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      await staged.dispose();
    }

    await expect(stat(staged.root)).rejects.toThrow('ENOENT');
    expect(await readFile(join(build, 'assets', 'entry.js'), 'utf8')).toBe(chunk);
  });

  it('should serve the build itself when the daemon sets no client key', async () => {
    const staged = await stageUiEnvironment(build, { TAU_ACQUISITION: undefined });

    expect(staged.root).toBe(build);
    await staged.dispose();
    expect(await readFile(join(build, 'index.html'), 'utf8')).toBe(shell);
  });

  it('should escape a value that would close the script element', () => {
    const html = injectClientEnvironment('<html><head></head></html>', { TAU_ACQUISITION: '</script><b>' });

    expect(html).toBe(
      String.raw`<html><head><script>window.ENV = { ...(window.ENV ?? {}), ...{"TAU_ACQUISITION":"</script><b>"} }</script></head></html>`,
    );
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the file */
