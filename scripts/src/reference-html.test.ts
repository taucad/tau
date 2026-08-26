import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { PDFParse } from 'pdf-parse';
import { afterEach, describe, expect, it } from 'vitest';

import {
  captureHtmlReference,
  convertHtmlSnapshot,
  createHtmlSnapshotFromHtml,
  createLegacyHtmlSnapshot,
  readHtmlSnapshot,
} from '#reference-html.js';
import { PublicRequestError } from '#reference-download.js';
import type { PublicRequestOptions } from '#reference-download.js';
import type { HtmlCaptureOmissions, HtmlCaptureReport, ReferencePaths } from '#reference-to-md.js';

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

const omissions = (overrides: Partial<HtmlCaptureOmissions> = {}): HtmlCaptureOmissions => ({
  mediaRequests: 0,
  peripheralRequests: 0,
  blockedCapabilities: 0,
  failedSubresources: 0,
  subframes: 0,
  nonReadingRequests: 0,
  failedImages: 0,
  ...overrides,
});

const v3Report = (overrides: Partial<HtmlCaptureReport> = {}): HtmlCaptureReport =>
  report({ profile: 'html-v3', requestAttempts: 1, omissions: omissions(), ...overrides });

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

const launchWithoutCapabilityInitScript = async (): Promise<Browser> => {
  const browser = await chromium.launch({ headless: true });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    context.addInitScript = async () => ({
      dispose: async () => undefined,
      [Symbol.asyncDispose]: async () => undefined,
      [Symbol.dispose]: () => undefined,
    });
    return context;
  };
  return browser;
};

const successfulPage = `<!doctype html>
	<html>
	  <head>
	    <meta charset="utf-8">
	    <link rel="manifest" href="/ignored-manifest.webmanifest">
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
      <figure>
        <video controls preload="metadata" src="/ignored-video.mp4"></video>
        <track default kind="captions" src="/ignored-track.vtt">
        <figcaption>Caption survives omitted video.</figcaption>
      </figure>
      <video><track id="forced-track" default kind="captions" src="/forced-track.vtt"></video>
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
      document.querySelector('#forced-track').track.mode = 'showing';
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

const mediaStormPage = `<!doctype html>
<main>
  <h1>Bounded media storm</h1>
  ${Array.from({ length: 500 }, (_, index) => `<video preload="metadata" src="/storm-${index}.mp4"></video>`).join('')}
</main>
<script>document.querySelectorAll('video').forEach((video) => video.load())</script>`;

const requestStormPage = (kind: 'post' | 'subframe' | 'mixed'): string => `<!doctype html>
<main><h1>Bounded ${kind} storm</h1></main>
<script>
  const main = document.querySelector('main');
  const posts = ${kind === 'post' ? 500 : kind === 'mixed' ? 250 : 0};
  const frames = ${kind === 'subframe' ? 500 : kind === 'mixed' ? 125 : 0};
  const media = ${kind === 'mixed' ? 125 : 0};
  for (let index = 0; index < posts; index += 1) fetch('/storm-post-' + index, { method: 'POST' }).catch(() => undefined);
  for (let index = 0; index < frames; index += 1) {
    const frame = document.createElement('iframe');
    frame.src = '/storm-frame-' + index;
    main.append(frame);
  }
  for (let index = 0; index < media; index += 1) {
    const video = document.createElement('video');
    video.src = '/storm-media-' + index + '.mp4';
    main.append(video);
    video.load();
  }
</script>`;

const partialEvidencePage = `<!doctype html>
<main>
  <h1>Partial evidence</h1>
  <p>Baseline evidence survives local failures.</p>
  <figure><img src="/missing-image" alt="Broken diagram"><figcaption>Broken figure caption.</figcaption></figure>
  <button disabled aria-expanded="false" aria-controls="failed-panel">Unavailable accordion</button>
  <section id="failed-panel" hidden><p>Unavailable panel evidence.</p></section>
  <iframe src="/frame"></iframe>
</main>
<script>fetch('/post', { method: 'POST' }).catch(() => undefined)</script>`;

const optionalFailurePage = (path: string): string => `<!doctype html>
<main><h1>Optional failure</h1><p>Ordinary evidence remains.</p><img alt="Optional image" src="/${path}"></main>`;

const aggregateFailurePage = `<!doctype html>
<main><h1>Aggregate failure</h1>${Array.from(
  { length: 5 },
  (_, index) => `<img alt="Oversized ${index}" src="/oversized-${index}">`,
).join('')}</main>`;

const oversizedBody = Buffer.alloc(20 * 1024 * 1024 + 1);

const startFixtureServer = async (): Promise<{
  requestedPaths: string[];
  request(options: PublicRequestOptions): Promise<IncomingMessage>;
}> => {
  const requestedPaths: string[] = [];
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/oversized-')) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(oversizedBody);
      return;
    }
    if (request.url === '/missing-image') {
      response.writeHead(404, { 'content-type': 'image/png', 'content-length': '0' });
      response.end();
      return;
    }
    if (request.url === '/unsupported-encoding') {
      response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': '1' });
      response.end('x');
      return;
    }
    if (request.url === '/invalid-length') {
      response.writeHead(200, { 'content-length': String(20 * 1024 * 1024 + 1) });
      response.end();
      return;
    }
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
      eventsource: 'new EventSource("/events")',
      worker: 'new Worker("/worker.js")',
      sharedworker: 'new SharedWorker("/worker.js")',
      webtransport: 'new WebTransport("https://fixture.test/transport")',
      webrtc: 'new RTCPeerConnection()',
      popup: 'window.open("https://fixture.test/popup")',
      serviceworker: 'navigator.serviceWorker.register("/sw.js")',
      beacon: 'document.querySelector("main").append(String(navigator.sendBeacon("/beacon", "x")))',
      dialog: 'alert("forbidden")',
      download:
        '(() => { const link = document.createElement("a"); link.href = "data:text/plain,forbidden"; link.download = "forbidden.txt"; document.body.append(link); link.click(); })()',
      filechooser:
        '(() => { const details = document.createElement("details"); details.innerHTML = "<summary>Choose file</summary><input type=file>"; document.querySelector("main").append(details); details.querySelector("summary").addEventListener("click", () => details.querySelector("input").click()); })()',
    }[capability ?? ''];
    const optionalFailure = request.url?.match(/^\/optional-(.+)$/u)?.[1];
    const body =
      request.url === '/forbidden'
        ? '<main><h1>Forbidden request</h1></main><script>fetch("/post", { method: "POST" }).catch(() => undefined)</script>'
        : request.url === '/nested-article'
          ? nestedArticlePage
          : request.url === '/partial-evidence'
            ? partialEvidencePage
            : request.url === '/aggregate-failure'
              ? aggregateFailurePage
              : request.url === '/post-storm'
                ? requestStormPage('post')
                : request.url === '/subframe-storm'
                  ? requestStormPage('subframe')
                  : request.url === '/mixed-storm'
                    ? requestStormPage('mixed')
                    : request.url === '/capability-storm'
                      ? '<main><h1>Capability storm</h1></main><script>for (let index = 0; index < 501; index += 1) navigator.sendBeacon("/beacon-" + index, "x")</script>'
                      : request.url === '/binding-forgery'
                        ? '<main><h1>Binding isolation</h1></main><script>const leaked = Object.getOwnPropertyNames(globalThis).filter((name) => name.startsWith("__tauReferenceDenied_")); for (const name of leaked) globalThis[name]("sendBeacon"); document.querySelector("main").append("Reporter leaks: " + leaked.length)</script>'
                        : optionalFailure
                          ? optionalFailurePage(optionalFailure)
                          : request.url === '/media-storm'
                            ? mediaStormPage
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
    requestedPaths,
    request: async (options) => {
      requestedPaths.push(options.url.pathname);
      if (options.url.pathname === '/private-address') {
        throw new PublicRequestError('unsafe-address', 'fixture resolved to a private address');
      }
      if (options.url.pathname === '/transport-failure') {
        throw new PublicRequestError('transport', 'fixture transport failed');
      }
      if (options.url.pathname === '/unknown-failure') {
        throw new Error('unknown injected failure');
      }
      return new Promise<IncomingMessage>((resolve, reject) => {
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
      });
    },
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

  it('should require bounded media omission provenance for html-v2 snapshots', () => {
    const paths = temporaryHtmlPaths();
    const oldSnapshot = createHtmlSnapshotFromHtml({
      baseUrl: 'https://fixture.test/page',
      report: report(),
      html: '<main><h1>Evidence</h1></main>',
    });
    writeFileSync(paths.snapshot, oldSnapshot);
    expect(readHtmlSnapshot(paths.snapshot).report.omittedMediaRequests).toBeUndefined();

    writeFileSync(paths.snapshot, oldSnapshot.replace('content="html-v1"', 'content="html-v2"'));
    expect(() => readHtmlSnapshot(paths.snapshot)).toThrow('html-v2 requires a media omission count');

    for (const omittedMediaRequests of [-1, 1.5, 501]) {
      expect(() =>
        createHtmlSnapshotFromHtml({
          baseUrl: 'https://fixture.test/page',
          report: report({ profile: 'html-v2', omittedMediaRequests }),
          html: '<main><h1>Evidence</h1></main>',
        }),
      ).toThrow('media omission count is invalid');
    }

    writeFileSync(
      paths.snapshot,
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: report({ profile: 'html-v2', omittedMediaRequests: 2 }),
        html: '<main><h1>Evidence</h1></main>',
      }),
    );
    expect(readHtmlSnapshot(paths.snapshot).report.omittedMediaRequests).toBe(2);
  });

  it('should validate complete and internally consistent html-v3 provenance', () => {
    const paths = temporaryHtmlPaths();
    expect(() =>
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: report({ profile: 'html-v3' }),
        html: '<main><h1>Evidence</h1></main>',
      }),
    ).toThrow('html-v3 requires request and omission counts');

    for (const requestAttempts of [-1, 1.5, 501]) {
      expect(() =>
        createHtmlSnapshotFromHtml({
          baseUrl: 'https://fixture.test/page',
          report: v3Report({ requestAttempts }),
          html: '<main><h1>Evidence</h1></main>',
        }),
      ).toThrow('request attempt count is invalid');
    }
    for (const failedSubresources of [-1, 1.5, 501]) {
      expect(() =>
        createHtmlSnapshotFromHtml({
          baseUrl: 'https://fixture.test/page',
          report: v3Report({
            requestAttempts: 500,
            omissions: omissions({ failedSubresources }),
          }),
          html: '<main><h1>Evidence</h1></main>',
        }),
      ).toThrow('failedSubresources count is invalid');
    }

    expect(() =>
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: v3Report({ requestAttempts: 1, omissions: omissions({ mediaRequests: 2 }) }),
        html: '<main><h1>Evidence</h1></main>',
      }),
    ).toThrow('request omission counts are inconsistent');
    expect(() =>
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: v3Report({ omissions: omissions({ failedSubresources: 1 }) }),
        html: '<main><h1>Evidence</h1></main>',
      }),
    ).toThrow('cannot claim standards-complete with evidence loss');
    expect(() =>
      createHtmlSnapshotFromHtml({
        baseUrl: 'https://fixture.test/page',
        report: v3Report({ semanticRoot: 'body' }),
        html: '<main><h1>Evidence</h1></main>',
      }),
    ).toThrow('cannot claim standards-complete with evidence loss');

    const snapshot = createHtmlSnapshotFromHtml({
      baseUrl: 'https://fixture.test/page',
      report: v3Report({
        requestAttempts: 2,
        omissions: omissions({ mediaRequests: 1, peripheralRequests: 1 }),
      }),
      html: '<main><h1>Evidence</h1></main>',
    });
    writeFileSync(paths.snapshot, snapshot.replace('<meta name="tau-reference-images-failed" content="0">', ''));
    expect(() => readHtmlSnapshot(paths.snapshot)).toThrow('html-v3 requires request and omission counts');
    writeFileSync(paths.snapshot, snapshot);
    expect(readHtmlSnapshot(paths.snapshot).report).toMatchObject({
      profile: 'html-v3',
      requestAttempts: 2,
      omissions: { mediaRequests: 1, peripheralRequests: 1 },
    });
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
    const before = readFileSync(paths.snapshot);
    await expect(convertHtmlSnapshot(paths.snapshot)).resolves.toMatchObject({ markdown });
    expect(readFileSync(paths.snapshot)).toEqual(before);
  });

  it('should read and convert html-v1 and html-v2 snapshots without rewriting them', async () => {
    await Promise.all(
      [report(), report({ profile: 'html-v2', omittedMediaRequests: 0 })].map(async (capture) => {
        const paths = temporaryHtmlPaths();
        writeFileSync(
          paths.snapshot,
          createHtmlSnapshotFromHtml({
            baseUrl: 'https://fixture.test/page',
            report: capture,
            html: '<main><h1>Evidence</h1><p>Old profile body.</p></main>',
          }),
        );
        const before = readFileSync(paths.snapshot);
        await convertHtmlSnapshot(paths.snapshot);
        expect(readFileSync(paths.snapshot)).toEqual(before);
      }),
    );
  });
});

describe('HTML browser capture', () => {
  it('should keep browser failures fatal and leave no temporary output', async () => {
    const paths = temporaryHtmlPaths();
    await expect(
      captureHtmlReference({
        id: 'browser-failure',
        url: 'https://fixture.test/browser-failure',
        paths,
        dependencies: {
          launchBrowser: async () => {
            throw new Error('browser launch failed');
          },
        },
      }),
    ).rejects.toThrow('browser launch failed');
    expect(readdirSync(dirname(paths.artifact))).toEqual([]);
  });

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
      profile: 'html-v3',
      semanticRoot: 'main',
      completeness: 'standards-complete',
      discovered: 5,
      visited: 5,
      failed: 0,
      skipped: 0,
      omissions: {
        mediaRequests: 2,
        peripheralRequests: 2,
        blockedCapabilities: 0,
        failedSubresources: 0,
        subframes: 0,
        nonReadingRequests: 0,
        failedImages: 0,
      },
    });
    expect(snapshot.report.requestAttempts).toBe(6);
    expect(snapshot.html).toContain('Lazy details evidence 1.');
    expect(snapshot.html).toContain('Lazy accordion evidence.');
    expect(snapshot.html).toContain('Lazy second tab evidence.');
    expect(snapshot.html).toContain('Below-the-fold lazy evidence.');
    expect(snapshot.html).toContain('Caption survives omitted video.');
    expect(snapshot.html).not.toContain('<video');
    expect(snapshot.html).not.toContain('ignored-video.mp4');
    expect(fixture.requestedPaths).not.toContain('/ignored-video.mp4');
    expect(fixture.requestedPaths).not.toContain('/ignored-manifest.webmanifest');
    expect(fixture.requestedPaths).not.toContain('/ignored-track.vtt');
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
    expect(converted.markdown).toContain('Caption survives omitted video.');
    expect(converted.markdown).not.toContain('ignored-video.mp4');
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
      expect(text.text).toContain('Caption survives omitted video.');
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

  it.each(['media-storm', 'post-storm', 'subframe-storm', 'mixed-storm'])(
    'should count every %s route before classification and clean up at the shared request limit',
    async (path) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await expect(
        captureHtmlReference({
          id: path,
          url: `https://fixture.test/${path}`,
          paths,
          dependencies: { request: fixture.request },
        }),
      ).rejects.toThrow('browser request count exceeds 500');
      expect(() => readFileSync(paths.artifact)).toThrow();
      expect(() => readFileSync(paths.snapshot)).toThrow();
      expect(readdirSync(dirname(paths.artifact))).toEqual([]);
    },
    120_000,
  );

  it('should bound ambient capability attempts and leave no output', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await expect(
      captureHtmlReference({
        id: 'capability-storm',
        url: 'https://fixture.test/capability-storm',
        paths,
        dependencies: { request: fixture.request },
      }),
    ).rejects.toThrow('browser capability attempt count exceeds 500');
    expect(readdirSync(dirname(paths.artifact))).toEqual([]);
  }, 120_000);

  it('should keep the code-owned capability reporter unavailable to page scripts', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'binding-forgery',
      url: 'https://fixture.test/binding-forgery',
      paths,
      dependencies: { request: fixture.request },
    });
    const snapshot = readHtmlSnapshot(paths.snapshot);
    expect(snapshot.report).toMatchObject({
      completeness: 'standards-complete',
      omissions: { blockedCapabilities: 0 },
    });
    expect(snapshot.html).toContain('Reporter leaks: 0');
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
      requestAttempts: 2,
      semanticRoot: 'article',
      completeness: 'partial',
      discovered: 1,
      visited: 0,
      failed: 0,
      skipped: 1,
      omissions: { subframes: 1 },
    });
    expect(snapshot.html).toContain('Article evidence');
    expect(snapshot.html).not.toContain('Main-only noise');
  }, 120_000);

  it('should block and disclose non-reading requests without discarding the capture', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'forbidden',
      url: 'https://fixture.test/forbidden',
      paths,
      dependencies: { request: fixture.request },
    });
    expect(readHtmlSnapshot(paths.snapshot).report).toMatchObject({
      requestAttempts: 2,
      completeness: 'partial',
      omissions: { nonReadingRequests: 1 },
    });
    expect(() => readFileSync(paths.artifact)).not.toThrow();
  }, 120_000);

  it.each([
    ['private-address', 'unsafe-address'],
    ['transport-failure', 'transport'],
    ['downgrade', 'unsafe-redirect'],
    ['unsupported-encoding', 'content-encoding'],
    ['invalid-length', 'content-length'],
    ['oversized-0', 'response-size'],
  ])(
    'should keep main document %s failures fatal',
    async (path, reason) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await expect(
        captureHtmlReference({
          id: path,
          url: `https://fixture.test/${path}`,
          paths,
          dependencies: { request: fixture.request },
        }),
      ).rejects.toThrow(`browser main document resource failed (${reason})`);
      expect(readdirSync(dirname(paths.artifact))).toEqual([]);
    },
    120_000,
  );

  it.each(['websocket', 'worker'])(
    'should keep the Playwright %s defense effective if init-script shims are bypassed',
    async (path) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await captureHtmlReference({
        id: `route-${path}`,
        url: `https://fixture.test/capability/${path}`,
        paths,
        dependencies: { request: fixture.request, launchBrowser: launchWithoutCapabilityInitScript },
      });
      expect(readHtmlSnapshot(paths.snapshot).report).toMatchObject({
        requestAttempts: path === 'worker' ? 2 : 1,
        completeness: 'partial',
        omissions: { blockedCapabilities: 1 },
      });
      if (path === 'worker') {
        expect(fixture.requestedPaths).toContain('/worker.js');
      }
    },
    120_000,
  );

  it.each([
    'private-address',
    'transport-failure',
    'downgrade',
    'unsupported-encoding',
    'invalid-length',
    'oversized-0',
  ])(
    'should preserve ordinary evidence when optional subresource %s fails safely',
    async (path) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await captureHtmlReference({
        id: `optional-${path}`,
        url: `https://fixture.test/optional-${path}`,
        paths,
        dependencies: { request: fixture.request },
      });
      const snapshot = readHtmlSnapshot(paths.snapshot);
      expect(snapshot.report).toMatchObject({
        requestAttempts: 2,
        completeness: 'partial',
        omissions: { failedSubresources: 1, failedImages: 1 },
      });
      expect(snapshot.html).toContain('Ordinary evidence remains.');
      expect(snapshot.html).not.toContain(`/${path}`);
    },
    120_000,
  );

  it('should keep unknown optional request errors fatal', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await expect(
      captureHtmlReference({
        id: 'optional-unknown-failure',
        url: 'https://fixture.test/optional-unknown-failure',
        paths,
        dependencies: { request: fixture.request },
      }),
    ).rejects.toThrow('unknown injected failure');
    expect(readdirSync(dirname(paths.artifact))).toEqual([]);
  }, 120_000);

  it('should charge bytes from failed subresources against the aggregate limit', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await expect(
      captureHtmlReference({
        id: 'aggregate-failure',
        url: 'https://fixture.test/aggregate-failure',
        paths,
        dependencies: { request: fixture.request },
      }),
    ).rejects.toThrow('browser aggregate response bytes exceed 104857600');
    expect(readdirSync(dirname(paths.artifact))).toEqual([]);
  }, 120_000);

  it('should retain baseline, alt, caption, PDF, and exact partial provenance across local evidence loss', async () => {
    const fixture = await startFixtureServer();
    const paths = temporaryHtmlPaths();
    await captureHtmlReference({
      id: 'partial-evidence',
      url: 'https://fixture.test/partial-evidence',
      paths,
      dependencies: { request: fixture.request },
    });

    const snapshot = readHtmlSnapshot(paths.snapshot);
    expect(snapshot.report).toMatchObject({
      requestAttempts: 4,
      completeness: 'partial',
      discovered: 1,
      visited: 1,
      failed: 1,
      skipped: 0,
      omissions: {
        failedSubresources: 0,
        subframes: 1,
        nonReadingRequests: 1,
        failedImages: 1,
      },
    });
    expect(snapshot.html.match(/<img alt="Broken diagram">/gu)).toHaveLength(1);
    expect(snapshot.html).toContain('Baseline evidence survives local failures.');
    expect(snapshot.html).toContain('Broken figure caption.');
    expect(snapshot.html).not.toMatch(/<iframe|<button|missing-image/u);
    const converted = await convertHtmlSnapshot(paths.snapshot);
    expect(converted.markdown).toBe(
      'Baseline evidence survives local failures.\n\n*Image: Broken diagram*\n\nBroken figure caption.\n',
    );
    const parser = new PDFParse({ data: readFileSync(paths.artifact) });
    try {
      const text = await parser.getText();
      expect(text.text).toContain('Broken figure caption.');
      const screenshots = await parser.getScreenshot({ first: 1, scale: 1 });
      const first = screenshots.pages[0];
      expect(first?.width).toBeGreaterThan(0);
      expect(first?.height).toBeGreaterThan(0);
    } finally {
      await parser.destroy();
    }
  }, 120_000);

  it.each(['websocket', 'eventsource', 'worker', 'sharedworker', 'webtransport', 'webrtc', 'serviceworker', 'beacon'])(
    'should block and disclose ambient page capability %s',
    async (path) => {
      const fixture = await startFixtureServer();
      const paths = temporaryHtmlPaths();
      await captureHtmlReference({
        id: path,
        url: `https://fixture.test/capability/${path}`,
        paths,
        dependencies: { request: fixture.request },
      });
      const snapshot = readHtmlSnapshot(paths.snapshot);
      expect(snapshot.report).toMatchObject({
        requestAttempts: 1,
        completeness: 'partial',
        omissions: { blockedCapabilities: 1 },
      });
      if (path === 'beacon') {
        expect(snapshot.html).toContain('false');
      }
      expect(fixture.requestedPaths).not.toContain('/events');
      expect(fixture.requestedPaths).not.toContain('/worker.js');
      expect(fixture.requestedPaths).not.toContain('/beacon');
    },
    120_000,
  );

  it.each([
    ['popup', 'window.open'],
    ['dialog', 'dialog'],
    ['download', 'download'],
    ['filechooser', 'filechooser'],
  ])(
    'should fail closed when page JavaScript attempts disruptive capability %s',
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
    ).rejects.toThrow('browser main document resource failed (unsafe-redirect)');
    expect(() => readFileSync(paths.artifact)).toThrow();
    expect(() => readFileSync(paths.snapshot)).toThrow();
  });
});
