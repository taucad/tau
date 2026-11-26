/**
 * Prove that a deployed UI answers React Router data requests with data, not with an HTML document.
 *
 * A `.data` request that gets the static shell's HTML makes the page fail with `Unable to decode turbo-stream
 * response` and replaces the app with the error page (chat observability program L5, defect D3; launch audit N-3:
 * the project `.data` request answered `200 text/html` on tau.new and taucad.dev). `deploy-ui.yml` runs this against
 * the environment it just deployed, so a routing rule that sends data requests to a static file turns the deploy red.
 *
 * Checked paths: the project route's root data request, a nested project route's data request and the sign-in data
 * request. The slugs need not exist: the function answers a data request for an unknown project with data too.
 *
 * Usage: node scripts/src/check-route-data.ts <origin> [--retries <n>]
 * Exit codes: 0 every path answered `text/x-script`; 1 a path did not; 2 usage.
 */
import { pathToFileURL } from 'node:url';

/** The data requests a deploy must answer with data. */
export const routeDataPaths = [
  '/w/route-check/route-check.data?_routes=root',
  '/w/route-check/route-check/preview.data',
  '/auth/sign-in.data',
] as const;

/** The content type React Router's single fetch answers a data request with. */
export const dataContentType = 'text/x-script';

/** One checked path and what it answered. */
export type RouteDataResult = {
  readonly path: string;
  readonly status: number | undefined;
  readonly contentType: string | undefined;
  readonly ok: boolean;
};

/**
 * Whether a response is a data response: any status, since a data request for an unknown project may answer 404 with
 * data, but always the turbo-stream content type.
 * @param contentType - The response's `content-type` header.
 * @returns True when the media type is `text/x-script`.
 */
export const isDataResponse = (contentType: string | undefined): boolean =>
  contentType?.split(';')[0]?.trim().toLowerCase() === dataContentType;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** How to reach the deployed site. */
export type CheckOptions = {
  /** Extra attempts per path after a network failure or a 5xx. */
  readonly retries: number;
  /** The fetch implementation. */
  readonly fetcher?: Fetch;
  /** The pause between attempts. Milliseconds. */
  readonly retryDelay?: number;
};

const wait = async (duration: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
};

const requestOnce = async (url: string, path: string, fetcher: Fetch): Promise<RouteDataResult> => {
  try {
    const response = await fetcher(url, { redirect: 'manual', headers: { accept: '*/*' } });
    await response.body?.cancel();
    const contentType = response.headers.get('content-type') ?? undefined;
    return { path, status: response.status, contentType, ok: isDataResponse(contentType) };
  } catch {
    return { path, status: undefined, contentType: undefined, ok: false };
  }
};

/**
 * Request one path, retrying a network failure or a 5xx, not a wrong content type: a deploy that serves HTML serves it
 * every time.
 * @param origin - The deployed site's origin.
 * @param path - The data request path.
 * @param options - Retries, fetch implementation and pause.
 * @returns The path's result.
 */
export const checkPath = async (origin: string, path: string, options: CheckOptions): Promise<RouteDataResult> => {
  const { retries, fetcher = fetch, retryDelay = 5000 } = options;
  const result = await requestOnce(new URL(path, origin).toString(), path, fetcher);
  if ((result.status !== undefined && result.status < 500) || retries <= 0) {
    return result;
  }
  await wait(retryDelay);
  return checkPath(origin, path, { retries: retries - 1, fetcher, retryDelay });
};

/**
 * Check every data path against one origin.
 * @param origin - The deployed site's origin.
 * @param options - Retries, fetch implementation and pause.
 * @returns One result per path, in {@link routeDataPaths} order.
 */
export const checkRouteData = async (origin: string, options: CheckOptions): Promise<RouteDataResult[]> =>
  Promise.all(routeDataPaths.map(async (path) => checkPath(origin, path, options)));

export const main = async (argv: readonly string[]): Promise<number> => {
  const [origin, flag, value] = argv;
  if (!origin || !/^https?:\/\//u.test(origin) || (flag !== undefined && flag !== '--retries')) {
    console.error('Usage: node scripts/src/check-route-data.ts <origin> [--retries <n>]');
    return 2;
  }
  const retries = flag ? Number(value) : 4;
  if (!Number.isInteger(retries) || retries < 0) {
    console.error('--retries takes a whole number');
    return 2;
  }
  const results = await checkRouteData(origin, { retries });
  for (const result of results) {
    const answer = `${result.status ?? 'no response'} ${result.contentType ?? 'no content type'}`;
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.path}: ${answer}`);
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(
      `::error::${failed.length} data request(s) on ${origin} did not answer ${dataContentType}. The page cannot decode HTML as data and shows the error page (launch audit N-3).`,
    );
    return 1;
  }
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
