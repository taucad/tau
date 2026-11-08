import { scrubUrl } from '#lib/sentry-event.lib.js';

/*
 * Chromium Reporting API reports (browser observability SB6): the `crash` report a tab's next load delivers after
 * the renderer died (out of memory, unresponsive), and CSP violations from the report-only policy (G24). The browser
 * posts them, batched and without cookies, to the `default` endpoint the document names.
 */

/** Where the browser delivers reports: the same-origin receiver route. */
export const reportsPath = '/api/reports';

/** The `Reporting-Endpoints` header value every document is sent with. */
export const reportingEndpoints = `default="${reportsPath}"`;

/** One report as the Reporting API delivers it. */
export type BrowserReport = {
  readonly type: string;
  readonly url: string;
  readonly age?: number;
  readonly user_agent?: string;
  readonly body: Readonly<Record<string, unknown>>;
};

/** Reports read from one delivery, at most; a browser batches a handful. */
export const reportsPerDelivery = 20;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read a Reporting API delivery: a JSON array of reports, each with a string `type` and `url` and an object `body`.
 *
 * @param text - The posted body.
 * @returns The well-formed reports (at most {@link reportsPerDelivery}), or `undefined` when the body is not an array.
 */
export const parseReports = (text: string): BrowserReport[] | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  const reports: BrowserReport[] = [];
  for (const entry of parsed.slice(0, reportsPerDelivery)) {
    if (
      isRecord(entry) &&
      typeof entry['type'] === 'string' &&
      typeof entry['url'] === 'string' &&
      isRecord(entry['body'])
    ) {
      reports.push({
        type: entry['type'],
        url: entry['url'],
        body: entry['body'],
        ...(typeof entry['age'] === 'number' ? { age: entry['age'] } : {}),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Reporting API wire name.
        ...(typeof entry['user_agent'] === 'string' ? { user_agent: entry['user_agent'] } : {}),
      });
    }
  }
  return reports;
};

/**
 * Whether a report was made by a page of this origin. Anyone can post here; a report about another site is noise.
 *
 * @param report - The report.
 * @param origin - This deployment's origin, from the request.
 * @returns True when the report's page is on `origin`.
 */
export const isFromOrigin = (report: BrowserReport, origin: string): boolean => {
  try {
    return new URL(report.url).origin === origin;
  } catch {
    return false;
  }
};

/**
 * The editor routes a crash is most likely on, by path, so a crash carries the same `route` tag as the editor's
 * errors and kills and falls to the same issue owner (SB14). Other pages report no route.
 */
const editorRoutes: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/w\/[^/]+\/[^/]+\/?$/u, 'routes/w.$workspace.$project'],
  [/^\/w\/[^/]+\/[^/]+\/preview\/?$/u, 'routes/w.$workspace.$project_.preview'],
];

/**
 * The route id of a page URL, for the editor routes.
 *
 * @param url - The page URL.
 * @returns The React Router route id, or `undefined`.
 */
export const routeIdForUrl = (url: string): string | undefined => {
  let pathname: string;
  try {
    ({ pathname } = new URL(url));
  } catch {
    return undefined;
  }
  return editorRoutes.find(([pattern]) => pattern.test(pathname))?.[1];
};

/** A crash report, read into what its Sentry event carries. */
export type BrowserCrash = {
  /** `oom`, `unresponsive`, or `unknown` when the browser gave none or one this receiver does not know. */
  readonly reason: string;
  /** `visible` or `hidden` when the browser said; a visible crash is one the user saw. */
  readonly visibility?: 'visible' | 'hidden';
  readonly isTopLevel?: boolean;
  /** The page URL without its query string, fragment or invitation tokens. */
  readonly url: string;
  readonly routeId?: string;
  readonly userAgent?: string;
};

/** Crash reasons Chromium reports today; anything else is filed as `unknown` so a tag cannot be made up. */
const knownCrashReasons: ReadonlySet<string> = new Set(['oom', 'unresponsive']);

/**
 * Read a `crash` report.
 *
 * @param report - A report whose `type` is `crash`.
 * @returns The crash as its Sentry event reports it.
 */
export const browserCrashFromReport = (report: BrowserReport): BrowserCrash => {
  const { reason, is_top_level: isTopLevel, page_visibility: visibility } = report.body;
  const routeId = routeIdForUrl(report.url);
  return {
    reason: typeof reason === 'string' && knownCrashReasons.has(reason) ? reason : 'unknown',
    ...(visibility === 'visible' || visibility === 'hidden' ? { visibility } : {}),
    ...(typeof isTopLevel === 'boolean' ? { isTopLevel } : {}),
    url: scrubUrl(report.url),
    ...(routeId === undefined ? {} : { routeId }),
    ...(report.user_agent === undefined ? {} : { userAgent: report.user_agent }),
  };
};

/** CSP report fields that hold a URL. */
const cspUrlFields = ['documentURL', 'referrer', 'blockedURL', 'sourceFile'] as const;

/**
 * Scrub a `csp-violation` report before it leaves for Sentry: every URL without its query string, fragment or
 * invitation tokens, and no `sample` (the start of the blocked script or style, which can be user content).
 *
 * @param report - A report whose `type` is `csp-violation`.
 * @returns The scrubbed report, in the same wire format.
 */
export const scrubCspReport = (report: BrowserReport): BrowserReport => {
  const body: Record<string, unknown> = { ...report.body };
  for (const field of cspUrlFields) {
    const value = body[field];
    if (typeof value === 'string' && value !== '') {
      // `blockedURL` can also be a keyword such as `inline` or `eval`, which has nothing to scrub.
      body[field] = scrubUrl(value);
    }
  }
  delete body['sample'];
  return { ...report, url: scrubUrl(report.url), body };
};
