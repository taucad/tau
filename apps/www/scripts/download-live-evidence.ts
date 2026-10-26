/**
 * Live download evidence: open the real deployed download page in a real browser on a Mac, record what a visitor sees,
 * click the Apple silicon and Intel buttons, and qualify the bytes the browser actually saved against the published
 * installer catalog. Disk images keep the browser's quarantine attribute and pass through Apple's own tools.
 *
 * Usage: CHROME_CHANNEL=chrome PAGE_URL=https://taucad.dev/download/ EXPECT=dmg EVIDENCE_DIR=out/evidence node apps/www/scripts/download-live-evidence.ts
 *
 * `EXPECT=zip` records today's archive-first page as a baseline and requires its Mac buttons to say ZIP truthfully.
 * The summary (`summary.json`) lists every failure; the process exits non-zero when there is one.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { loadPlaywright } from '#tools/tooling.js';

const run = promisify(execFile);

// Driver types come through the tooling boundary, which owns the only runtime driver import.
type Page = Awaited<
  ReturnType<Awaited<ReturnType<Awaited<ReturnType<typeof loadPlaywright>>['chromium']['launch']>>['newPage']>
>;

const pageUrl = new URL(process.env['PAGE_URL'] ?? 'https://taucad.dev/download/');
const expected = process.env['EXPECT'] ?? 'dmg';
if (expected !== 'dmg' && expected !== 'zip') {
  throw new Error(`EXPECT must be dmg or zip, not ${expected}`);
}
const format = expected === 'dmg' ? 'DMG' : 'ZIP';
const extension = `.${expected}`;
const output = resolve(process.env['EVIDENCE_DIR'] ?? 'out/desktop-download-live-evidence');
const downloadsOrigin =
  pageUrl.hostname === 'taucad.dev' ? 'https://downloads.taucad.dev' : 'https://downloads.tau.new';
const failures: string[] = [];

/**
 * Record a failed expectation without stopping, so one run captures all of the evidence.
 * @param condition - The expectation.
 * @param message - What failed.
 */
const check = (condition: boolean, message: string): void => {
  if (!condition) {
    failures.push(message);
  }
};

/**
 * @param path - A local file.
 * @returns Its size and SHA-256.
 */
const hashFile = async (path: string): Promise<{ bytes: number; sha256: string }> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  const { size } = await stat(path);
  return { bytes: size, sha256: hash.digest('hex') };
};

/**
 * Fetch a published URL in full, without caches, and hash every byte received.
 * @param url - A public download or feed URL.
 * @param keep - Also return the body, for small JSON documents.
 * @returns Status, final URL, headers of record, byte count and SHA-256.
 */
const fetchInFull = async (url: string, keep = false) => {
  try {
    const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    const hash = createHash('sha256');
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let bytes = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        hash.update(chunk);
        bytes += chunk.byteLength;
        if (keep) {
          chunks.push(chunk);
        }
      }
    }
    return {
      url,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      lastModified: response.headers.get('last-modified'),
      bytes,
      sha256: hash.digest('hex'),
      body: keep ? Buffer.concat(chunks) : undefined,
    };
  } catch (error) {
    return { url, status: 0, error: String(error), bytes: 0, sha256: undefined, body: undefined };
  }
};

/**
 * Run a read-only Apple verification tool and keep its full result.
 * @param command - The tool.
 * @param args - Its arguments.
 * @returns Exit code and output.
 */
const tool = async (command: string, args: readonly string[]) => {
  try {
    const { stdout, stderr } = await run(command, args, { maxBuffer: 16 * 1024 * 1024 });
    return { command: [command, ...args].join(' '), exitCode: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      command: [command, ...args].join(' '),
      exitCode: typeof failed.code === 'number' ? failed.code : -1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? String(error),
    };
  }
};

type CatalogArtifact = { kind: string; name: string; sha256: string; size: number };
type Catalog = {
  tag: string;
  version: string;
  sourceCommit: string;
  channel: string;
  routes: Array<{ route: string; target: string; artifacts: CatalogArtifact[] }>;
};

/** What a visitor sees for one download link. */
type Button = {
  role: string;
  text: string;
  ariaLabel: string | undefined;
  href: string;
  visible: boolean;
};

/**
 * @param page - The live download page.
 * @returns Every Mac download link and its visible label.
 */
const readMacButtons = async (page: Page): Promise<Button[]> =>
  page
    .locator(
      'a[data-host-download="direct"], a[data-download-platform="mac"], a[data-download-platform="macIntel"], a[data-download-alternative]',
    )
    .evaluateAll((links) =>
      links.map((link) => {
        const anchor = link as HTMLAnchorElement;
        const role = anchor.dataset['downloadAlternative']
          ? `alternative:${anchor.dataset['downloadAlternative']}`
          : anchor.dataset['hostDownload'] === 'direct'
            ? 'host'
            : `${anchor.closest('#downloads') ? 'list' : 'hero'}:${anchor.dataset['downloadPlatform']}`;
        return {
          role,
          text: anchor.textContent.trim(),
          ariaLabel: anchor.getAttribute('aria-label') ?? undefined,
          href: anchor.href,
          visible: anchor.checkVisibility(),
        };
      }),
    );

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const capturedAt = new Date().toISOString();

const catalogUrl = `${downloadsOrigin}/latest/installers.json`;
const catalogResponse = await fetchInFull(catalogUrl, true);
let catalog: Catalog | undefined;
if (catalogResponse.status === 200 && catalogResponse.body) {
  await writeFile(join(output, 'installers.json'), catalogResponse.body);
  try {
    catalog = JSON.parse(catalogResponse.body.toString('utf8')) as Catalog;
  } catch {
    failures.push('latest/installers.json is not JSON');
  }
}
check(expected === 'zip' || catalog !== undefined, `${catalogUrl} returned ${catalogResponse.status}, not a catalog`);
const catalogArtifacts = new Map(
  (catalog?.routes ?? []).flatMap((route) => route.artifacts.map((artifact) => [artifact.name, artifact] as const)),
);
const releaseBase = catalog ? `${downloadsOrigin}/releases/${encodeURIComponent(catalog.tag)}` : undefined;

/**
 * Compare received bytes from an immutable release URL with the catalog entry for that file name.
 * A `latest/` archive is recorded but not compared: it follows the update feed, not the installer catalog.
 * @param file - The file name, where it came from, its size and digest, and whether it must be a catalog release
 * artifact.
 * @param file.name - The file name.
 * @param file.url - Where it came from.
 * @param file.received - Its size and digest.
 * @param file.required - Whether the file must be a catalog release artifact.
 * @returns The catalog entry, if any.
 */
const compareWithCatalog = ({
  name,
  url,
  received,
  required,
}: {
  name: string;
  url: string;
  received: { bytes: number; sha256: string | undefined };
  required: boolean;
}) => {
  const entry = catalogArtifacts.get(name);
  const immutable = releaseBase !== undefined && url === `${releaseBase}/${name}`;
  check(!required || (entry !== undefined && immutable), `${url} is not the catalog release artifact ${name}`);
  if (!entry || !immutable) {
    return undefined;
  }
  check(entry.size === received.bytes, `${name}: received ${received.bytes} bytes, catalog says ${entry.size}`);
  check(entry.sha256 === received.sha256, `${name}: SHA-256 ${received.sha256} differs from catalog ${entry.sha256}`);
  return entry;
};

const { chromium } = await loadPlaywright();
// The workflow uses the runner's installed Google Chrome (`CHROME_CHANNEL=chrome`), the browser a visitor uses.
const browser = await chromium.launch({ channel: process.env['CHROME_CHANNEL'] ?? 'chromium', headless: true });
const downloadDirectory = await mkdtemp(join(tmpdir(), 'tau-live-downloads-'));
const evidence: Record<string, unknown> = {};
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  const catalogRequests: Array<{ url: string; status: number }> = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/latest/installers.json')) {
      catalogRequests.push({ url: response.url(), status: response.status() });
    }
  });
  const response = await page.goto(pageUrl.href, { waitUntil: 'networkidle' });
  check(response?.status() === 200, `${pageUrl.href} returned ${response?.status()}`);
  const host = page.locator('a[data-host-download="direct"]');
  // The catalog upgrade is asynchronous: wait for the expected label, and record the page as it is if it never comes.
  await host
    .filter({ hasText: new RegExp(`Download ${format} for`, 'u') })
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await page.screenshot({ path: join(output, 'download-page.png'), fullPage: true });
  const buttons = await readMacButtons(page);
  const pageText = (await page.locator('body').textContent()) ?? '';
  const instructions = await page.locator('[data-install-instructions]').textContent();
  const note = await page.locator('[data-platform-note]').textContent();
  const details = await page.locator('[data-download-detail]').evaluateAll((elements) =>
    elements.map((element) => ({
      platform: (element as HTMLElement).dataset['downloadDetail'],
      text: element.textContent.trim(),
    })),
  );
  const others = await page
    .locator('a[data-download-platform="windows"], a[data-download-platform="linux"]')
    .evaluateAll((links) =>
      links.map((link) => ({ text: link.textContent.trim(), href: (link as HTMLAnchorElement).href })),
    );

  const primary = buttons.filter((button) => !button.role.startsWith('alternative:') && button.visible);
  for (const role of ['host', 'list:mac', 'list:macIntel', 'hero:macIntel']) {
    check(
      primary.some((button) => button.role === role),
      `No visible Mac button ${role}`,
    );
  }
  for (const button of primary) {
    const path = new URL(button.href).pathname;
    check(
      new RegExp(`^Download ${format} for (?:Apple silicon|Intel Mac)$`, 'u').test(button.text),
      `${button.role} reads "${button.text}", not a ${format} label`,
    );
    check(path.endsWith(extension), `${button.role} points to ${button.href}, not a ${format}`);
    check(
      button.ariaLabel === undefined || button.ariaLabel.includes(format),
      `${button.role} aria-label hides ${format}`,
    );
  }
  for (const button of buttons) {
    if (/DMG/u.test(button.text)) {
      check(new URL(button.href).pathname.endsWith('.dmg'), `${button.role} says DMG over ${button.href}`);
    }
  }
  if (expected === 'dmg') {
    check(
      /mount/iu.test(instructions ?? '') &&
        /Applications/u.test(instructions ?? '') &&
        /eject/iu.test(instructions ?? ''),
      `Installation instructions do not describe a disk image: "${instructions}"`,
    );
    for (const platform of ['mac', 'macIntel']) {
      check(
        buttons.some(
          (button) =>
            button.role === `alternative:${platform}` &&
            button.visible &&
            new URL(button.href).pathname.endsWith('.zip'),
        ),
        `No visible ZIP alternative for ${platform}`,
      );
    }
  } else {
    check(!/\bDMG\b/u.test(pageText), 'The ZIP baseline page mentions a DMG');
  }

  // The real buttons, clicked as a visitor clicks them; the browser's own downloads are qualified in place.
  const clicks = [
    { architecture: 'arm64', selector: '#downloads a[data-download-platform="mac"]' },
    { architecture: 'x64', selector: '#downloads a[data-download-platform="macIntel"]' },
  ];
  const downloads: unknown[] = [];
  for (const { architecture, selector } of clicks) {
    const link = page.locator(selector);
    // oxlint-disable-next-line no-await-in-loop -- One real browser download at a time keeps each capture attributable.
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), link.click()]);
    // oxlint-disable-next-line no-await-in-loop -- The download must finish before its bytes are qualified.
    const failure = await download.failure();
    const name = download.suggestedFilename();
    // oxlint-disable-next-line no-await-in-loop -- As above.
    const path = failure ? undefined : await download.path();
    const record: Record<string, unknown> = {
      architecture,
      button: buttons.find((button) => button.href === download.url() && button.role.startsWith('list:'))?.text,
      url: download.url(),
      filename: name,
      failure,
    };
    downloads.push(record);
    check(!failure && path !== undefined, `${architecture} download failed: ${failure}`);
    check(name.endsWith(extension), `${architecture} download saved ${name}, not a ${format}`);
    check(name.includes(`-${architecture}.`), `${architecture} button downloaded ${name}`);
    if (!path) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Sequential qualification of one saved file.
    const received = await hashFile(path);
    Object.assign(record, received);
    record['catalog'] = compareWithCatalog({
      name,
      url: download.url(),
      received,
      required: expected === 'dmg',
    });
    // The browser's quarantine attribute is recorded and never removed: Gatekeeper sees what a visitor's Mac sees.
    // oxlint-disable-next-line no-await-in-loop -- As above.
    const quarantine = await tool('xattr', ['-p', 'com.apple.quarantine', path]);
    record['quarantine'] = { present: quarantine.exitCode === 0, value: quarantine.stdout.trim() };
    if (expected !== 'dmg') {
      continue;
    }
    const mount = join(downloadDirectory, `mount-${architecture}`);
    const trust: Array<Awaited<ReturnType<typeof tool>>> = [];
    // oxlint-disable-next-line no-await-in-loop -- Apple's tools inspect the one saved image in order.
    trust.push(await tool('hdiutil', ['verify', path]));
    // oxlint-disable-next-line no-await-in-loop -- As above.
    trust.push(await tool('spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', path]));
    // oxlint-disable-next-line no-await-in-loop -- As above.
    trust.push(await tool('xcrun', ['stapler', 'validate', path]));
    // oxlint-disable-next-line no-await-in-loop -- As above.
    const attach = await tool('hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-noautoopen',
      '-mountpoint',
      mount,
      path,
    ]);
    trust.push(attach);
    if (attach.exitCode === 0) {
      // oxlint-disable-next-line no-await-in-loop -- As above.
      const listing = await tool('ls', ['-la', mount]);
      record['layout'] = listing.stdout;
      check(/ Applications -> \/Applications/u.test(listing.stdout), `${name} has no Applications shortcut`);
      // oxlint-disable-next-line no-await-in-loop -- As above.
      trust.push(await tool('codesign', ['--verify', '--deep', '--strict', '--verbose=2', join(mount, 'Tau.app')]));
      // oxlint-disable-next-line no-await-in-loop -- As above.
      trust.push(await tool('codesign', ['-dv', '--verbose=2', join(mount, 'Tau.app')]));
      // oxlint-disable-next-line no-await-in-loop -- As above.
      trust.push(await tool('hdiutil', ['detach', mount]));
    }
    record['trust'] = trust;
    for (const result of trust) {
      check(result.exitCode === 0, `${name}: ${result.command} exited ${result.exitCode}`);
    }
  }

  // ZIP alternatives and the updater feeds, fetched in full: the updater keeps ZIPs whatever the website shows.
  const archives = [
    ...new Set(buttons.filter((button) => button.role.startsWith('alternative:')).map((button) => button.href)),
  ];
  const zipAlternatives: unknown[] = [];
  for (const href of archives) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential full downloads bound the runner's bandwidth and disk.
    const result = await fetchInFull(href);
    const name = basename(new URL(href).pathname);
    check(result.status === 200, `${href} returned ${result.status}`);
    check(name.endsWith('.zip'), `Alternative ${href} is not a ZIP`);
    zipAlternatives.push({
      ...result,
      body: undefined,
      catalog: compareWithCatalog({ name, url: href, received: result, required: expected === 'dmg' }),
    });
  }
  const updaterFeeds: unknown[] = [];
  for (const architecture of ['arm64', 'x64']) {
    const url = `${downloadsOrigin}/latest/desktop-update-darwin-${architecture}.json`;
    // oxlint-disable-next-line no-await-in-loop -- Two small sequential reads.
    const result = await fetchInFull(url, true);
    check(result.status === 200, `${url} returned ${result.status}`);
    if (result.body) {
      // oxlint-disable-next-line no-await-in-loop -- As above.
      await writeFile(join(output, `desktop-update-darwin-${architecture}.json`), result.body);
    }
    let feed: unknown;
    try {
      feed = result.body ? (JSON.parse(result.body.toString('utf8')) as unknown) : undefined;
    } catch {
      feed = undefined;
    }
    // A DMG never enters the update payload.
    check(!JSON.stringify(feed ?? '').includes('.dmg'), `${url} names a DMG`);
    updaterFeeds.push({ ...result, body: undefined, feed });
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(pageUrl.href, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: join(output, 'download-page-mobile.png'), fullPage: true });
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!mobileOverflow, 'The download page scrolls horizontally at 390 px');
  await mobile.close();

  Object.assign(evidence, {
    page: {
      status: response?.status(),
      headers: Object.fromEntries(
        Object.entries(response?.headers() ?? {}).filter(([name]) =>
          ['date', 'etag', 'age', 'last-modified', 'cache-status', 'x-nf-request-id', 'server'].includes(name),
        ),
      ),
      catalogRequests,
      consoleErrors,
      instructions,
      note,
      details,
      otherPlatforms: others,
      mobileOverflow,
    },
    buttons,
    downloads,
    zipAlternatives,
    updaterFeeds,
  });
  await context.close();
} catch (error) {
  // An unreachable page or a broken flow still leaves a summary that says what failed.
  failures.push(`Evidence capture stopped: ${String(error)}`);
} finally {
  await browser.close();
  await rm(downloadDirectory, { recursive: true, force: true });
}

const productVersion = await tool('sw_vers', ['-productVersion']);
const summary = {
  schemaVersion: 1,
  capturedAt,
  completedAt: new Date().toISOString(),
  pageUrl: pageUrl.href,
  expect: expected,
  runner: {
    platform: platform(),
    arch: arch(),
    release: release(),
    productVersion: productVersion.stdout.trim(),
    github: {
      runId: process.env['GITHUB_RUN_ID'],
      runUrl: process.env['GITHUB_RUN_ID']
        ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
        : undefined,
      sha: process.env['GITHUB_SHA'],
    },
  },
  catalog: {
    url: catalogUrl,
    status: catalogResponse.status,
    bytes: catalogResponse.bytes,
    sha256: catalogResponse.sha256,
    tag: catalog?.tag,
    version: catalog?.version,
    sourceCommit: catalog?.sourceCommit,
    channel: catalog?.channel,
  },
  ...evidence,
  failures,
  passed: failures.length === 0,
};
await writeFile(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
// Log the full public evidence so reviewers can inspect it without downloading the artifact.
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
