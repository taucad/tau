import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Result } from 'lighthouse';

const run = promisify(execFile);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env['WWW_REPORT_DIR'] ?? 'out/reports/www');
await mkdir(output, { recursive: true });
const port = process.env['PORT'] ?? '4173';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(appRoot, 'scripts/serve.ts')], {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await new Promise<void>((resolve, reject) => {
    const startupTimeout = setTimeout(() => {
      reject(new Error('SSR server did not start'));
    }, 30_000);
    server.once('error', (error: Error) => {
      clearTimeout(startupTimeout);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(startupTimeout);
      reject(new Error(`SSR server exited: ${code}`));
    });
    server.stdout.once('data', () => {
      clearTimeout(startupTimeout);
      resolve();
    });
  });
  const response = await fetch(origin);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1[ >]/u);
  assert.match(html, /rel="canonical" href="https:\/\/tau.new\/"/u);
  assert.match(html, /content="index,follow"/u);
  assert.match(response.headers.get('content-security-policy') ?? '', /nonce-/u);
  const missing = await fetch(`${origin}/missing-page`);
  assert.equal(missing.status, 404);
  const sitemap = await fetch(`${origin}/sitemap.xml`);
  assert.match(await sitemap.text(), /https:\/\/tau.new\/pricing\//u);
  const agentPage = await fetch(`${origin}/llms.txt`);
  assert.equal(agentPage.status, 200);
  assert.equal(agentPage.headers.get('content-type'), 'text/plain; charset=utf-8');
  const agentText = await agentPage.text();
  assert.match(agentText, /^# Tau\n/u);
  const plugin = JSON.parse(await readFile(resolve(appRoot, '../../packages/agent-plugin/package.json'), 'utf8')) as {
    version: string;
  };
  assert.ok(
    agentText.includes(`Current release: ${plugin.version} (npm tag \`beta\`).`),
    'Agent page names the plugin release',
  );
  const serverFiles = await readdir(resolve(appRoot, 'build/server/_www/bundles'));
  assert.equal(
    serverFiles.some((file) => /live-|scene-|\.map$/u.test(file)),
    false,
    'SSR must not ship graphics or source maps',
  );
  for (const script of ['browser-check', 'check-story']) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Browser suites share the same machine; run sequentially for reproducible timing.
    const result = await run(process.execPath, [resolve(appRoot, `scripts/${script}.ts`)], {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
      env: { ...process.env, WWW_TEST_URL: origin, WWW_REPORT_DIR: resolve(output, script) },
      timeout: 600_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    console.log(result.stdout);
  }
  const scores: Array<{ profile: string; categories: Record<string, number>; runs: Array<Record<string, number>> }> =
    [];
  const lighthouse = fileURLToPath(new URL('../cli/index.js', import.meta.resolve('lighthouse')));
  for (const profile of ['mobile', 'desktop']) {
    const runs: Array<Record<string, number>> = [];
    // Three cold runs distinguish a repeatable regression from scheduler/network variance.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const reportPath = resolve(output, `lighthouse-${profile}-${attempt}`);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Lighthouse must run without competing browser workloads.
      await run(
        process.execPath,
        [
          lighthouse,
          origin,
          '--quiet',
          '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
          '--output=json',
          '--output=html',
          `--output-path=${reportPath}`,
          ...(profile === 'desktop' ? ['--preset=desktop'] : []),
        ],
        { env: process.env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- Record every attempt, including regressions.
      const report = JSON.parse(await readFile(`${reportPath}.report.json`, 'utf8')) as Result;
      runs.push(
        Object.fromEntries(Object.entries(report.categories).map(([name, category]) => [name, category.score ?? 0])),
      );
    }
    const categories = Object.fromEntries(
      Object.keys(runs[0] ?? {}).map((name) => {
        const values = runs.map((run) => run[name] ?? 0).sort((a, b) => a - b);
        return [name, name === 'performance' ? (values[1] ?? 0) : (values[0] ?? 0)];
      }),
    );
    scores.push({ profile, categories, runs });
  }
  await writeFile(resolve(output, 'scores.json'), JSON.stringify(scores, undefined, 2));
  console.log(JSON.stringify(scores));
  for (const { profile, categories } of scores) {
    for (const [name, score] of Object.entries(categories)) {
      assert.ok(score >= (name === 'performance' ? 0.95 : 1), `${profile} ${name}: ${score}`);
    }
  }
} finally {
  server.kill('SIGTERM');
}
