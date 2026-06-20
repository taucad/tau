import { test, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const filename = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(dirname(filename), '..');
const MAIN_ENTRY = resolve(APP_ROOT, 'dist/main/index.js');

test('probe', async () => {
  test.setTimeout(80_000);
  const log: string[] = [];
  const app = await electron.launch({
    args: [MAIN_ENTRY],
    cwd: APP_ROOT,
    env: { ...process.env, TAU_ELECTRON_DEBUG: '1' },
    timeout: 60_000,
  });
  const proc = app.process();
  proc.stderr?.on('data', (c: Uint8Array<ArrayBuffer>) => log.push(`[stderr] ${c.toString()}`));
  proc.stdout?.on('data', (c: Uint8Array<ArrayBuffer>) => log.push(`[stdout] ${c.toString()}`));
  log.push(`[host] launched, pid=${proc.pid}\n`);
  try {
    type FirstWindowRace = { ok: true; win: Awaited<ReturnType<typeof app.firstWindow>> } | { ok: false };

    const win = await Promise.race<FirstWindowRace>([
      app.firstWindow().then((w) => ({ ok: true, win: w })),
      new Promise<FirstWindowRace>((resolve) => {
        setTimeout(() => {
          resolve({ ok: false });
        }, 8000);
      }),
    ]);
    log.push(`[host] firstWindow result ok=${win.ok}\n`);
    if (win.ok) {
      win.win.on('console', (m) => log.push(`[renderer:${m.type()}] ${m.text()}\n`));
      win.win.on('pageerror', (error: unknown) => {
        if (error instanceof Error) {
          log.push(`[renderer:err] ${error.message}\n${error.stack}\n`);
        } else {
          log.push(`[renderer:err] ${String(error)}\n`);
        }
      });
      try {
        const url = win.win.url();
        log.push(`[host] url=${url}\n`);
        await win.win
          .waitForLoadState('domcontentloaded', { timeout: 5000 })
          .catch((error: unknown) => log.push(`[host] domcontent err ${String(error)}\n`));
        const html = await win.win.content().catch((error: unknown) => `<err: ${String(error)}>`);
        log.push(`[host] html-len=${html.length}\n`);
        log.push(`[host] html-head=${html.slice(0, 500)}\n`);
      } catch (error) {
        log.push(`[host] window probe error ${String(error)}\n`);
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3000);
      });
    }
  } finally {
    writeFileSync('/tmp/tau-probe.log', log.join(''));
    await app.close().catch((error: unknown) => log.push(`[host] close err ${String(error)}\n`));
  }
});
