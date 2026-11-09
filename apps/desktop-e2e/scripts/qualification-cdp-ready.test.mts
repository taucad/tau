/* oxlint-disable no-await-in-loop -- A bounded wait for the browser to publish its port. */
/** Purpose: Prove the attach readiness gate waits for a committed document and gives up at its deadline. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';
import { afterEach, expect, test } from 'vitest';
/* oxlint-disable-next-line no-restricted-imports -- Test the owning attach readiness seam. */
import { waitForCommittedDocument } from './qualification-cdp-ready.mjs';

const document = 'data:text/html,%3Ctitle%3Eready%3C%2Ftitle%3E';
let child: ChildProcess | undefined;
let profile: string | undefined;

/** Launch a browser on its own debugging port, as the installed app is launched, and return that port. */
const launch = async (): Promise<number> => {
  profile = await mkdtemp(join(tmpdir(), 'tau-cdp-ready-'));
  child = spawn(
    chromium.executablePath(),
    ['--headless=new', '--no-sandbox', `--user-data-dir=${profile}`, '--remote-debugging-port=0', document],
    { stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      const published = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      return Number(published.split('\n')[0]);
    } catch {
      await wait(20);
    }
  }
  throw new Error('Browser did not publish its debugging port');
};

afterEach(async () => {
  child?.kill('SIGKILL');
  child = undefined;
  if (profile) {
    await rm(profile, { recursive: true, force: true });
    profile = undefined;
  }
});

test('returns the committed document, after which the attach reports that page', async () => {
  const port = await launch();
  const href = await waitForCommittedDocument({
    port,
    accept: (value) => value.startsWith('data:'),
    deadline: Date.now() + 30_000,
  });
  expect(href).toBe(document);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000 });
  try {
    const urls = browser.contexts().flatMap((context) => context.pages().map((page) => page.url()));
    expect(urls).toContain(document);
  } finally {
    await browser.close();
  }
}, 60_000);

test('gives up at its deadline and names what it saw', async () => {
  const port = await launch();
  await expect(
    waitForCommittedDocument({ port, accept: (value) => value.startsWith('app://tau/'), deadline: Date.now() + 1500 }),
  ).rejects.toThrow(/last seen: \[.*data:text\/html/u);
}, 30_000);
