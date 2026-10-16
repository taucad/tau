/**
 * Report whether every payload a `tau-plugin.json` pins is still served as pinned, without downloading a payload.
 *
 * The weekly `pin-freshness.yml` job (charter W15, D27, R1) runs this read-only: it never edits a pin (I1). For every
 * pinned URL it sends a HEAD and compares `Content-Length` with the pinned `byteLength`. For each payload it then asks
 * the publisher's own metadata: PyPI's JSON API for a wheel's `yanked` flag and `digests.sha256`, python-build-
 * standalone's release `SHA256SUMS` for an interpreter archive, and Microsoft's `releases.json` for a .NET runtime
 * archive's hash. A payload pinned to the digest of zero bytes is a fail-closed placeholder and is skipped.
 *
 * Usage: node scripts/src/check-pin-freshness.ts [--summary <file>] <tau-plugin.json>…
 *   --summary <file>   Append a Markdown report (for `$GITHUB_STEP_SUMMARY`).
 * Exit codes: 0 every pin is fresh; 1 drift was found or a manifest is unreadable; 2 usage.
 */
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isPlaceholderIntegrity, pinnedUrls } from '#check-payload-urls.js';
import type { PinnedUrl } from '#check-payload-urls.js';

/** One observation of one pin. */
export type FreshnessRow = {
  /** `<dependency>/<payload>`, as `check-payload-urls` names it. */
  readonly payload: string;
  readonly check: 'content-length' | 'pypi' | 'pbs-sha256sums' | 'dotnet-releases';
  readonly status: 'fresh' | 'drift';
  readonly url: string;
  readonly detail: string;
};

const sriPattern = /^(?<algorithm>sha256|sha384|sha512)-(?<digest>[A-Za-z\d+/]+={0,2})$/u;

const hexOf = (integrity: string): { readonly algorithm: string; readonly hex: string } => {
  const { algorithm, digest } = sriPattern.exec(integrity)!.groups!;
  return { algorithm: algorithm!, hex: Buffer.from(digest!, 'base64').toString('hex') };
};

const lastSegment = (url: string): string => decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '');

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const contentRangePattern = /^bytes \d+-\d+\/(?<total>\d+)$/u;

/**
 * Ask for the first byte and read the total length from `Content-Range`. Some CDNs (such as
 * `builds.dotnet.microsoft.com`) answer HEAD with a short placeholder body length instead of the object's.
 * @param url - The pinned URL.
 * @param transport - The `fetch` to use.
 * @returns The advertised length, or `undefined` when the answer carries none.
 */
const rangedLength = async (url: string, transport: typeof fetch): Promise<number | undefined> => {
  const response = await transport(url, { headers: { range: 'bytes=0-0' }, redirect: 'follow' });
  await response.body?.cancel();
  const total = contentRangePattern.exec(response.headers.get('content-range') ?? '')?.groups?.['total'];
  return response.status === 206 && total !== undefined ? Number(total) : undefined;
};

/**
 * HEAD one URL and compare its `Content-Length` with the pinned byte length, confirming a disagreement with
 * a one-byte ranged GET before calling it drift.
 * @param pin - The URL and its pin.
 * @param transport - The `fetch` to use.
 * @returns One row.
 */
export const checkContentLength = async (pin: PinnedUrl, transport: typeof fetch): Promise<FreshnessRow> => {
  const row = (status: FreshnessRow['status'], detail: string): FreshnessRow => ({
    payload: pin.payload,
    check: 'content-length',
    status,
    url: pin.url,
    detail,
  });
  let response: Response;
  try {
    response = await transport(pin.url, { method: 'HEAD', redirect: 'follow' });
  } catch (error) {
    return row('drift', `HEAD failed: ${errorText(error)}`);
  }
  if (!response.ok) {
    return row('drift', `HEAD answered HTTP ${String(response.status)}`);
  }
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) === pin.byteLength) {
    return row('fresh', `${length} bytes`);
  }
  let ranged: number | undefined;
  try {
    ranged = await rangedLength(pin.url, transport);
  } catch (error) {
    return row('drift', `HEAD Content-Length ${length ?? 'absent'}; ranged GET failed: ${errorText(error)}`);
  }
  if (ranged === pin.byteLength) {
    return row('fresh', `${String(ranged)} bytes (Content-Range)`);
  }
  return row(
    'drift',
    `Content-Length ${length ?? 'absent'}, Content-Range ${ranged === undefined ? 'absent' : String(ranged)}, pinned ${String(pin.byteLength)}`,
  );
};

const wheelPattern = /^(?<name>[^-]+)-(?<version>[^-]+)(?:-\d[^-]*)?-[^-]+-[^-]+-[^-]+\.whl$/u;

/**
 * Ask PyPI's JSON API whether a pinned wheel is yanked and still carries the pinned sha256.
 * @param pin - A `files.pythonhosted.org` wheel URL and its pin.
 * @param transport - The `fetch` to use.
 * @returns One row.
 */
export const checkPypi = async (pin: PinnedUrl, transport: typeof fetch): Promise<FreshnessRow> => {
  const filename = lastSegment(pin.url);
  const parsed = wheelPattern.exec(filename)?.groups;
  const metadataUrl =
    parsed === undefined
      ? ''
      : `https://pypi.org/pypi/${parsed['name']!.replaceAll('_', '-')}/${parsed['version']!}/json`;
  const row = (status: FreshnessRow['status'], detail: string): FreshnessRow => ({
    payload: pin.payload,
    check: 'pypi',
    status,
    url: metadataUrl || pin.url,
    detail,
  });
  if (parsed === undefined) {
    return row('drift', `${filename} is not a wheel filename`);
  }
  try {
    const response = await transport(metadataUrl);
    if (!response.ok) {
      return row('drift', `PyPI answered HTTP ${String(response.status)}`);
    }
    const metadata = (await response.json()) as {
      readonly urls?: ReadonlyArray<{
        readonly filename?: string;
        readonly yanked?: boolean;
        readonly yanked_reason?: string;
        readonly digests?: { readonly sha256?: string };
      }>;
    };
    const file = metadata.urls?.find((entry) => entry.filename === filename);
    if (file === undefined) {
      return row('drift', `PyPI no longer lists ${filename}`);
    }
    if (file.yanked === true) {
      return row('drift', `yanked${file.yanked_reason ? `: ${file.yanked_reason}` : ''}`);
    }
    const { algorithm, hex } = hexOf(pin.integrity);
    if (algorithm !== 'sha256') {
      return row('fresh', `not yanked (pin is ${algorithm}, PyPI publishes sha256)`);
    }
    return file.digests?.sha256 === hex
      ? row('fresh', 'not yanked; sha256 matches')
      : row('drift', `PyPI sha256 ${file.digests?.sha256 ?? 'missing'}, pinned ${hex}`);
  } catch (error) {
    return row('drift', `PyPI metadata unreadable: ${errorText(error)}`);
  }
};

const pbsPattern = /^https:\/\/github\.com\/astral-sh\/python-build-standalone\/releases\/download\/(?<tag>[^/]+)\//u;

/**
 * Compare a python-build-standalone archive's pin with its release's `SHA256SUMS`.
 * @param pin - The archive URL and its pin.
 * @param transport - The `fetch` to use.
 * @returns One row.
 */
export const checkPbs = async (pin: PinnedUrl, transport: typeof fetch): Promise<FreshnessRow> => {
  const tag = pbsPattern.exec(pin.url)?.groups?.['tag'] ?? '';
  const sumsUrl = `https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/SHA256SUMS`;
  const filename = lastSegment(pin.url);
  const row = (status: FreshnessRow['status'], detail: string): FreshnessRow => ({
    payload: pin.payload,
    check: 'pbs-sha256sums',
    status,
    url: sumsUrl,
    detail,
  });
  try {
    const response = await transport(sumsUrl, { redirect: 'follow' });
    if (!response.ok) {
      return row('drift', `SHA256SUMS answered HTTP ${String(response.status)}`);
    }
    const sums = await response.text();
    const published = sums
      .split('\n')
      .map((line) => line.trim().split(/\s+/u))
      .find(([, name]) => name === filename)?.[0];
    if (published === undefined) {
      return row('drift', `SHA256SUMS of ${tag} does not list ${filename}`);
    }
    const { hex } = hexOf(pin.integrity);
    return published === hex ? row('fresh', 'sha256 matches') : row('drift', `published ${published}, pinned ${hex}`);
  } catch (error) {
    return row('drift', `SHA256SUMS unreadable: ${errorText(error)}`);
  }
};

const dotnetPattern =
  /^https:\/\/builds\.dotnet\.microsoft\.com\/dotnet\/Runtime\/(?<major>\d+)\.(?<minor>\d+)\.[^/]+\//u;

/**
 * Compare a .NET runtime archive's pin with the hash Microsoft's `releases.json` publishes for it.
 * @param pin - The archive URL and its pin.
 * @param transport - The `fetch` to use.
 * @returns One row.
 */
export const checkDotnet = async (pin: PinnedUrl, transport: typeof fetch): Promise<FreshnessRow> => {
  const groups = dotnetPattern.exec(pin.url)?.groups;
  const channel = `${groups?.['major'] ?? ''}.${groups?.['minor'] ?? ''}`;
  const releasesUrl = `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${channel}/releases.json`;
  const filename = lastSegment(pin.url);
  const row = (status: FreshnessRow['status'], detail: string): FreshnessRow => ({
    payload: pin.payload,
    check: 'dotnet-releases',
    status,
    url: releasesUrl,
    detail,
  });
  try {
    const response = await transport(releasesUrl);
    if (!response.ok) {
      return row('drift', `releases.json answered HTTP ${String(response.status)}`);
    }
    const releases = (await response.json()) as {
      readonly releases?: ReadonlyArray<{
        readonly runtime?: { readonly files?: ReadonlyArray<{ readonly url?: string; readonly hash?: string }> };
      }>;
    };
    const file = (releases.releases ?? [])
      .flatMap((release) => release.runtime?.files ?? [])
      .find((entry) => entry.url !== undefined && lastSegment(entry.url) === filename);
    if (file?.hash === undefined) {
      return row('drift', `releases.json for ${channel} does not list ${filename}`);
    }
    const { algorithm, hex } = hexOf(pin.integrity);
    // Microsoft publishes sha512; a pin in another algorithm cannot be compared, so it is reported, not passed.
    if (algorithm !== 'sha512') {
      return row('drift', `pin is ${algorithm}; releases.json publishes sha512`);
    }
    return file.hash.toLowerCase() === hex
      ? row('fresh', 'sha512 matches')
      : row('drift', `published ${file.hash.toLowerCase()}, pinned ${hex}`);
  } catch (error) {
    return row('drift', `releases.json unreadable: ${errorText(error)}`);
  }
};

/**
 * Every freshness row for some manifests: one Content-Length row per URL and one publisher row per payload whose
 * first URL a publisher check recognises.
 * @param paths - `tau-plugin.json` paths.
 * @param transport - The `fetch` to use.
 * @returns The rows, in manifest order.
 */
export const checkPinFreshness = async (paths: readonly string[], transport: typeof fetch): Promise<FreshnessRow[]> => {
  const rows: FreshnessRow[] = [];
  for (const path of paths) {
    // oxlint-disable-next-line no-await-in-loop -- manifests are checked one at a time
    const pins = pinnedUrls(JSON.parse(await readFile(path, 'utf8'))).filter(
      (pin) => !isPlaceholderIntegrity(pin.integrity),
    );
    const seen = new Set<string>();
    const publisher = pins.filter((pin) => {
      const key = `${pin.payload}\0${pin.integrity}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    // oxlint-disable-next-line no-await-in-loop -- each manifest's checks run together
    const results = await Promise.all([
      ...pins.map(async (pin) => checkContentLength(pin, transport)),
      ...publisher.flatMap((pin) => {
        const host = new URL(pin.url).hostname;
        if (host === 'files.pythonhosted.org' && pin.url.endsWith('.whl')) {
          return [checkPypi(pin, transport)];
        }
        if (pbsPattern.test(pin.url)) {
          return [checkPbs(pin, transport)];
        }
        if (dotnetPattern.test(pin.url)) {
          return [checkDotnet(pin, transport)];
        }
        return [];
      }),
    ]);
    rows.push(...results);
  }
  return rows;
};

/**
 * A Markdown report: totals per check, then every drifted row.
 * @param rows - From {@link checkPinFreshness}.
 * @returns The report.
 */
export const freshnessReport = (rows: readonly FreshnessRow[]): string => {
  const checks = [...new Set(rows.map(({ check }) => check))];
  const drift = rows.filter(({ status }) => status === 'drift');
  const lines = [
    '### Pin freshness',
    '',
    '| Check | Fresh | Drift |',
    '| --- | ---: | ---: |',
    ...checks.map((check) => {
      const of = rows.filter((row) => row.check === check);
      return `| ${check} | ${String(of.filter(({ status }) => status === 'fresh').length)} | ${String(
        of.filter(({ status }) => status === 'drift').length,
      )} |`;
    }),
    '',
  ];
  if (drift.length === 0) {
    lines.push('Every pin is fresh. No pin was changed: this job only reports.');
  } else {
    lines.push(
      `**${String(drift.length)} drifted pin checks.** No pin was changed: this job only reports.`,
      '',
      '| Payload | Check | URL | Detail |',
      '| --- | --- | --- | --- |',
      ...drift.map(({ payload, check, url, detail }) => `| ${payload} | ${check} | ${url} | ${detail} |`),
    );
  }
  return `${lines.join('\n')}\n`;
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  let summary: string | undefined;
  if (argv[0] === '--summary') {
    summary = argv[1];
    argv.splice(0, 2);
  }
  if (argv.length === 0 || summary === '') {
    console.error('Usage: node scripts/src/check-pin-freshness.ts [--summary <file>] <tau-plugin.json>…');
    process.exitCode = 2;
    return;
  }
  const rows = await checkPinFreshness(
    argv.map((path) => resolve(path)),
    fetch,
  );
  const report = freshnessReport(rows);
  console.log(report);
  if (summary !== undefined) {
    await appendFile(summary, report);
  }
  const drifted = rows.filter(({ status }) => status === 'drift');
  for (const { payload, check, detail } of drifted) {
    console.log(`::warning title=Pin drift (${check})::${payload}: ${detail}`);
  }
  process.exitCode = drifted.length === 0 ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
