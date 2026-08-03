import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { afterEach, describe, expect, it } from 'vitest';

import {
  captureHtmlReference,
  convertHtmlSnapshot,
  createHtmlSnapshotFromHtml,
  createLegacyHtmlSnapshot,
  readHtmlSnapshot,
} from '#reference-html.js';
import type { PublicRequestOptions } from '#reference-download.js';
import type { HtmlCaptureReport, ReferencePaths } from '#reference-to-md.js';

const temporaryDirectories: string[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];
const expectedMarkdown = readFileSync(join(import.meta.dirname, 'fixtures/reference-html/expected.md'), 'utf8');
const fixtureFont = readFileSync(join(import.meta.dirname, '../../apps/ui/public/fonts/Geist-Variable.woff2'));

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const report = (overrides: Partial<HtmlCaptureReport> = {}): HtmlCaptureReport => ({
  profile: 'html-v1',
  chromiumVersion: '149.0.0.0',
  finalUrl: 'https://fixture.test/page',
  semanticRoot: 'main',
  completeness: 'standards-complete',
  discovered: 0,
  visited: 0,
  empty: 0,
  failed: 0,
  skipped: 0,
  ...overrides,
});

const temporaryHtmlPaths = (): Extract<ReferencePaths, { format: 'html' }> => {
  const root = mkdtempSync(join(tmpdir(), 'tau-html-reference-test-'));
  temporaryDirectories.push(root);
  return {
    format: 'html',
    artifact: join(root, 'paper.pdf'),
    artifactDisplay: 'docs/reference/pdf/paper.pdf',
    snapshot: join(root, 'paper.snapshot.html'),
    snapshotDisplay: 'docs/reference/source/paper.snapshot.html',
    markdown: join(root, 'paper.md'),
    markdownDisplay: 'docs/reference/paper.md',
  };
};

const successfulPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: 800px 1000px; margin: 0; }
      @font-face { font-family: Fixture; src: url('/font.woff2') format('woff2'); }
      body { margin: 0; font-family: Fixture, sans-serif; }
      main { padding: 20px; }
      .visual { display: inline-block; width: 100px; height: 100px; margin-right: 16px; }
      .spacer { height: 900px; }
      .pulse { width: 20px; height: 20px; background: #ffff00; animation: pulse 1s infinite; }
      @keyframes pulse { from { opacity: .8; } to { opacity: 1; } }
    </style>
  </head>
  <body>
    <nav>Navigation noise</nav>
    <main>
      <h1>HTML Reference<br>Fixture</h1>
      <p id="delayed"></p>
      <p>Rendered introduction with a <a href="/safe-link">safe link</a>.</p>
      <figure>
        <img alt="A semantic diagram">
        <figcaption>Semantic figure caption</figcaption>
      </figure>
      <svg class="visual" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000"></rect></svg>
      <canvas id="canvas" class="visual" width="100" height="100"></canvas>
      <canvas id="webgl" class="visual" width="100" height="100"></canvas>
      <div class="pulse"></div>
      <details name="exclusive">
        <summary>Native details one</summary>
        <p>Native details content one.</p>
      </details>
      <details name="exclusive">
        <summary>Native details two</summary>
        <p>Native details content two.</p>
      </details>
      <button id="accordion" aria-expanded="false" aria-controls="accordion-panel">Accordion label</button>
      <section id="accordion-panel" hidden></section>
      <div role="tablist">
        <button role="tab" aria-selected="true" aria-controls="tab-one">Tab one</button>
        <button role="tab" aria-selected="false" aria-controls="tab-two">Tab two</button>
      </div>
      <section id="tab-one" role="tabpanel"><p>First tab content.</p></section>
      <section id="tab-two" role="tabpanel" hidden></section>
      <button id="arbitrary">Arbitrary button must stay untouched</button>
      <h2>Structured evidence</h2>
      <ul><li>First item</li><li>Second item<ul><li>Nested item</li></ul></li></ul>
      <dl><dt>Term</dt><dd>Definition</dd></dl>
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>Alpha</td><td>1</td></tr></tbody>
      </table>
      <table>
        <tr><th colspan="2">Complex table</th></tr>
        <tr><td>Left</td><td>Right</td></tr>
      </table>
      <pre><button class="copy-button">Copy</button><code>const answer = 42;</code></pre>
      <section><h2>Responsive evidence</h2><p>This repeated section is deliberately long enough for the semantic deduplicator to recognize an identical mobile and desktop rendering of the same article content.</p></section>
      <section><h2>Responsive evidence</h2><p>This repeated section is deliberately long enough for the semantic deduplicator to recognize an identical mobile and desktop rendering of the same article content.</p></section>
      <div class="spacer"></div>
      <p id="lazy"></p>
    </main>
    <header style="position: fixed; font-size: 1px; line-height: 1px">Persistent header</header>
    <footer>Footer noise</footer>
    <script>
      const canvas = document.querySelector('#canvas');
      const context = canvas.getContext('2d');
      context.fillStyle = '#00ff00';
      context.fillRect(0, 0, 100, 100);
      const webglCanvas = document.querySelector('#webgl');
      const gl = webglCanvas.getContext('webgl');
      if (gl) {
        gl.clearColor(0, 0, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        const fallback = webglCanvas.getContext('2d');
        fallback.fillStyle = '#0000ff';
        fallback.fillRect(0, 0, 100, 100);
      }
      document.addEventListener('scroll', () => {
        document.querySelector('#lazy').textContent = 'Below-the-fold lazy evidence.';
      }, { once: true });
      setTimeout(() => {
        document.querySelector('#delayed').textContent = 'Delayed client-rendered evidence.';
      }, 50);
      document.querySelectorAll('details').forEach((details, index) => {
        details.addEventListener('toggle', () => {
          if (details.open && !details.querySelector('.loaded')) {
            const loaded = document.createElement('p');
            loaded.className = 'loaded';
            loaded.textContent = 'Lazy details evidence ' + (index + 1) + '.';
            details.append(loaded);
          }
        });
      });
      document.querySelector('#accordion').addEventListener('click', (event) => {
        const control = event.currentTarget;
        const expanded = control.getAttribute('aria-expanded') === 'true';
        control.setAttribute('aria-expanded', String(!expanded));
        const panel = document.querySelector('#accordion-panel');
        panel.hidden = expanded;
        if (!expanded && panel.textContent === '') {
          panel.innerHTML = '<p>Lazy accordion evidence.</p>';
        }
      });
      document.querySelectorAll('[role=tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('[role=tab]').forEach((candidate) => {
            const selected = candidate === tab;
            candidate.setAttribute('aria-selected', String(selected));
            const panel = document.querySelector('#' + candidate.getAttribute('aria-controls'));
            panel.hidden = !selected;
          });
          if (tab.textContent.includes('two')) {
            document.querySelector('#tab-two').innerHTML = '<p>Lazy second tab evidence.</p>';
          }
        });
      });
      document.querySelector('#arbitrary').addEventListener('click', () => {
        document.body.dataset.arbitraryClicked = 'true';
      });
    </script>
  </body>
</html>`;

const nestedArticlePage = `<!doctype html>
<main>
  <article>
    <h1>Article evidence</h1>
    <button aria-expanded="false" aria-controls="missing-panel">Malformed accordion</button>
  </article>
  <p>Main-only noise</p>
  <iframe src="/frame"></iframe>
</main>
<script>navigator.sendBeacon = () => true;</script>`;

const startFixtureServer = async (): Promise<{
  request(options: PublicRequestOptions): Promise<IncomingMessage>;
}> => {
  const server = createServer((request, response) => {
    if (request.url === '/font.woff2') {
      response.writeHead(200, {
        'content-type': 'font/woff2',
        'content-length': fixtureFont.byteLength,
      });
      response.end(fixtureFont);
      return;
    }
    if (request.url === '/downgrade') {
      response.writeHead(302, { location: 'http://fixture.test/insecure' });
      response.end();
      return;
    }
    const capability = request.url?.split('/capability/')[1];
    const capabilityScript = {
      websocket: 'new WebSocket("wss://fixture.test/socket")',
      worker: 'new Worker("/worker.js")',
      popup: 'window.open("https://fixture.test/popup")',
      serviceworker: 'navigator.serviceWorker.register("/sw.js")',
      dialog: 'alert("forbidden")',
      download:
        '(() => { const link = document.createElement("a"); link.href = "data:text/plain,forbidden"; link.download = "forbidden.txt"; document.body.append(link); link.click(); })()',
    }[capability ?? ''];
    const body =
      request.url === '/forbidden'
        ? '<main><h1>Forbidden request</h1></main><script>fetch("/post", { method: "POST" }).catch(() => undefined)</script>'
        : request.url === '/nested-article'
          ? nestedArticlePage
          : capabilityScript
            ? `<main><h1>Forbidden capability</h1></main><script>${capabilityScript}</script>`
            : successfulPage;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    request: async (options) =>
      new Promise<IncomingMessage>((resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path: options.url.pathname,
            method: options.method,
            headers: options.headers,
          },
          resolve,
        );
        outgoing.once('error', reject);
        outgoing.end();
      }),
  };
};

describe('HTML semantic snapshot', () => {
  it('should preserve structural evidence and remove active or resource-loading markup', () => {
    const snapshot = createHtmlSnapshotFromHtml({
      baseUrl: 'https://fixture.test/article',
      report: report(),
      html: `
        <main>
          <script>bad()</script>
          <style>body { display: none }</style>
          <nav>Noise</nav>
          <h1>Evidence</h1>
          <p>Text <a href="/safe">safe link</a> <a href="javascript:bad()">unsafe link</a>.</p>
          <figure><img src="https://tracker.test/pixel" alt="Diagram"><figcaption>Caption</figcaption></figure>
          <table><tr><th colspan="2">Complex</th></tr><tr><td>A</td><td>B</td></tr></table>
        </main>
      `,
    });
    expect(snapshot).toContain('<h1>Evidence</h1>');
    expect(snapshot).toContain('https://fixture.test/safe');
    expect(snapshot).toContain('<img alt="Diagram">');
    expect(snapshot).toContain('<figcaption>Caption</figcaption>');
    expect(snapshot).toContain('<ul>');
    expect(snapshot).not.toMatch(/script|style|tracker|javascript:|Navigation noise/u);
  });

  it('should reject active markup added to a cached snapshot', () => {
    const paths = temporaryHtmlPaths();
    writeFileSync(
      paths.snapshot,
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: report(),
        html: '<main><h1>Evidence</h1></main>',
      }).replace('</main>', '<script>bad()</script></main>'),
    );
    expect(() => readHtmlSnapshot(paths.snapshot)).toThrow('unsupported element (script)');
  });

  it('should preserve locally migrated Markdown exactly in a legacy inert snapshot', async () => {
    const paths = temporaryHtmlPaths();
    const markdown = '# Existing body\n\n```json\n{"kept": true}\n```\n';
    writeFileSync(
      paths.snapshot,
      createLegacyHtmlSnapshot({
        markdown,
        report: report({
          semanticRoot: 'legacy-markdown',
          completeness: 'legacy-pdf-only',
        }),
      }),
    );
    await expect(convertHtmlSnapshot(paths.snapshot)).resolves.toMatchObject({ markdown });
  });
});

describe('HTML browser capture', () => {
  it('should capture visual pixels, standardized interaction states, and legible Markdown', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'fixture',
      url: 'https://fixture.test/page',
      paths,
      dependencies: { request: fixture.request },
    });

    const snapshot = readHtmlSnapshot(paths.snapshot);
    expect(snapshot.report).toMatchObject({
      profile: 'html-v1',
      semanticRoot: 'main',
      completeness: 'standards-complete',
      discovered: 5,
      visited: 5,
      failed: 0,
      skipped: 0,
    });
    expect(snapshot.html).toContain('Lazy details evidence 1.');
    expect(snapshot.html).toContain('Lazy accordion evidence.');
    expect(snapshot.html).toContain('Lazy second tab evidence.');
    expect(snapshot.html).toContain('Below-the-fold lazy evidence.');
    expect(snapshot.html).not.toMatch(
      /Navigation noise|Footer noise|copy-button|Arbitrary button must stay untouched/u,
    );

    const converted = await convertHtmlSnapshot(paths.snapshot);
    expect(converted.markdown).toBe(expectedMarkdown);
    expect(converted.markdown).not.toContain('HTML Reference');
    expect(converted.markdown).toContain('Delayed client-rendered evidence.');
    expect(converted.markdown).toContain('*Image: A semantic diagram*');
    expect(converted.markdown).toContain('Lazy accordion evidence.');
    expect(converted.markdown).toContain('Lazy second tab evidence.');
    expect(converted.markdown).toContain('``` text\nconst answer = 42;\n```');
    expect(converted.markdown.match(/## Responsive evidence/gu)).toHaveLength(1);
    expect(converted.markdown.match(/## Native details one/gu)).toHaveLength(1);
    expect(converted.markdown).not.toContain('Copy');

    const parser = new PDFParse({ data: readFileSync(paths.artifact) });
    try {
      const info = await parser.getInfo();
      expect(info.info?.Creator).toBe('Chromium');
      expect(info.info?.Producer).toMatch(/Skia/u);
      const text = await parser.getText();
      expect(text.text.match(/Persistent header/gu)).toHaveLength(1);
      const screenshots = await parser.getScreenshot({ first: 1, scale: 1 });
      const first = screenshots.pages[0];
      expect(first).toBeDefined();
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(`<canvas></canvas><img src="${first?.dataUrl ?? ''}">`);
        const colors = await page.evaluate(async () => {
          const image = document.querySelector('img');
          if (!image) {
            throw new Error('screenshot image missing');
          }
          await image.decode();
          const canvas = document.querySelector('canvas');
          if (!canvas) {
            throw new Error('pixel canvas missing');
          }
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('pixel context missing');
          }
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const counts = { red: 0, green: 0, blue: 0 };
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index] ?? 0;
            const green = pixels[index + 1] ?? 0;
            const blue = pixels[index + 2] ?? 0;
            if (red > 200 && green < 80 && blue < 80) {
              counts.red += 1;
            }
            if (green > 200 && red < 80 && blue < 80) {
              counts.green += 1;
            }
            if (blue > 200 && red < 80 && green < 80) {
              counts.blue += 1;
            }
          }
          return counts;
        });
        expect(colors.red).toBeGreaterThan(100);
        expect(colors.green).toBeGreaterThan(100);
        expect(colors.blue).toBeGreaterThan(100);
      } finally {
        await browser.close();
      }
    } finally {
      await parser.destroy();
    }
  }, 120_000);

  it('should prefer article content and skip blocked frames and malformed controls', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'nested-article',
      url: 'https://fixture.test/nested-article',
      paths,
      dependencies: { request: fixture.request },
    });

    const snapshot = readHtmlSnapshot(paths.snapshot);
    expect(snapshot.report).toMatchObject({
      semanticRoot: 'article',
      completeness: 'partial',
      discovered: 1,
      visited: 0,
      failed: 0,
      skipped: 1,
    });
    expect(snapshot.html).toContain('Article evidence');
    expect(snapshot.html).not.toContain('Main-only noise');
  }, 120_000);

  it('should block non-reading requests without failing the capture', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'forbidden',
      url: 'https://fixture.test/forbidden',
      paths,
      dependencies: { request: fixture.request },
    });
    expect(() => readFileSync(paths.artifact)).not.toThrow();
    expect(() => readFileSync(paths.snapshot)).not.toThrow();
  }, 120_000);

  it.each([
    ['websocket', 'WebSocket'],
    ['worker', 'Worker'],
    ['popup', 'window.open'],
    ['serviceworker', 'ServiceWorker'],
    ['dialog', 'browser dialog is forbidden'],
    ['download', 'browser download is forbidden'],
  ])(
    'should fail closed when page JavaScript attempts %s',
    async (path, diagnostic) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await expect(
        captureHtmlReference({
          id: path,
          url: `https://fixture.test/capability/${path}`,
          paths,
          dependencies: { request: fixture.request },
        }),
      ).rejects.toThrow(diagnostic);
      expect(() => readFileSync(paths.artifact)).toThrow();
      expect(() => readFileSync(paths.snapshot)).toThrow();
    },
    120_000,
  );

  it('should reject an HTTPS downgrade without durable output', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await expect(
      captureHtmlReference({
        id: 'downgrade',
        url: 'https://fixture.test/downgrade',
        paths,
        dependencies: { request: fixture.request },
      }),
    ).rejects.toThrow('browser redirect target is forbidden');
    expect(() => readFileSync(paths.artifact)).toThrow();
    expect(() => readFileSync(paths.snapshot)).toThrow();
  });
});
