/**
 * Server-side work behind the agent's `web_search` and `web_browser` tools (server-agent regression review R1).
 *
 * Both ran inside the API in the former server-side agent loop. The Pi agent host runs on the device, so the tools call these
 * functions through `POST /v1/llm/tools/*`: the search key stays on the server, and page fetches leave from the API.
 * Because the API fetches URLs the model chose, every hop is checked to resolve to a public address first.
 *
 * @module
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { z } from 'zod';

/** Search results returned per query. */
export const maxSearchResults = 5;
/** Characters of extracted text kept per page; the rest is cut with a note, so one page cannot flood the context. */
export const maxPageCharacters = 40_000;
/** Bytes read from one response before it is refused. */
export const maxResponseBytes = 10 * 1024 * 1024;
/** Milliseconds one search or page fetch may take. */
export const fetchTimeout = 30_000;
const maxRedirects = 5;
const userAgent = 'TauCAD-Agent/1.0';
const tavilySearchUrl = 'https://api.tavily.com/search';

/** One resolved address, as `dns.lookup(host, { all: true })` returns it. */
export type ResolvedAddress = Readonly<{ address: string; family: number }>;

/** Injected I/O, so tests run without the network. */
export type WebResearchDependencies = Readonly<{
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  lookup: (hostname: string) => Promise<readonly ResolvedAddress[]>;
}>;

/** The default dependencies: the platform fetch and the system resolver. */
export const defaultWebResearchDependencies: WebResearchDependencies = {
  fetch: async (url, init) => globalThis.fetch(url, init),
  lookup: async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
};

/** The coded refusals the web tools return to the model. */
export const webResearchErrorCode = {
  searchUnavailable: 'WEB_SEARCH_UNAVAILABLE',
  searchFailed: 'WEB_SEARCH_FAILED',
  browserNoResults: 'WEB_BROWSER_NO_RESULTS',
} as const;

/** A refusal the tool returns to the model as a coded error. */
export type WebResearchFailure = Readonly<{
  success: false;
  errorCode: string;
  message: string;
}>;
export type WebSearchOutcome =
  | Readonly<{
      success: true;
      results: ReadonlyArray<Readonly<{ title: string; url: string; content: string }>>;
    }>
  | WebResearchFailure;
export type WebBrowseOutcome =
  | Readonly<{
      success: true;
      pages: ReadonlyArray<Readonly<{ url: string; content: string }>>;
    }>
  | WebResearchFailure;

const tavilyResponseSchema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })),
});

const withTimeout = (signal: AbortSignal): AbortSignal => AbortSignal.any([signal, AbortSignal.timeout(fetchTimeout)]);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Run one web search through Tavily.
 *
 * @param request - The query, the configured key (absent when the deployment has none) and the caller's signal.
 * @param dependencies - Injected fetch.
 * @returns The results, or a coded refusal.
 */
export const searchWeb = async (
  request: Readonly<{
    query: string;
    apiKey: string | undefined;
    signal: AbortSignal;
  }>,
  dependencies: Pick<WebResearchDependencies, 'fetch'> = defaultWebResearchDependencies,
): Promise<WebSearchOutcome> => {
  if (request.apiKey === undefined || request.apiKey === '') {
    return {
      success: false,
      errorCode: webResearchErrorCode.searchUnavailable,
      message: 'Web search is not configured on this Tau server.',
    };
  }
  try {
    const response = await dependencies.fetch(tavilySearchUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        query: request.query,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Tavily's wire field name.
        max_results: maxSearchResults,
        topic: 'general',
      }),
      signal: withTimeout(request.signal),
    });
    if (!response.ok) {
      return {
        success: false,
        errorCode: webResearchErrorCode.searchFailed,
        message: `The search provider answered HTTP ${String(response.status)}. Try again or rephrase the query.`,
      };
    }
    const { results } = tavilyResponseSchema.parse(await response.json());
    return {
      success: true,
      results: results.slice(0, maxSearchResults).map(({ title, url, content }) => ({ title, url, content })),
    };
  } catch (error) {
    request.signal.throwIfAborted();
    return {
      success: false,
      errorCode: webResearchErrorCode.searchFailed,
      message: `Web search failed: ${messageOf(error)}`,
    };
  }
};

/* Every range a model-chosen URL must not reach from inside Tau's network. */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether an address is publicly routable: not loopback, private, link-local (cloud metadata), CGNAT, multicast or
 * reserved. An IPv4-mapped IPv6 address is judged as its IPv4 address.
 *
 * @param address - A literal IPv4 or IPv6 address.
 * @returns `true` only for a public address.
 */
export const isPublicAddress = (address: string): boolean => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.[1];
  if (mapped !== undefined) {
    return isPublicAddress(mapped);
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

const assertPublicUrl = async (url: URL, lookup: WebResearchDependencies['lookup']): Promise<void> => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme ${url.protocol}`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('URLs with credentials are not fetched');
  }
  const host = url.hostname.replace(/^\[(.*)\]$/u, '$1');
  const addresses = isIP(host) === 0 ? await lookup(host) : [{ address: host, family: isIP(host) }];
  if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
    throw new Error(`${url.hostname} does not resolve to a public address`);
  }
};

const entities: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (text: string): string =>
  text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code =
        name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10_ff_ff
        ? String.fromCodePoint(code === 160 ? 32 : code)
        : whole;
    }
    return entities[name.toLowerCase()] ?? whole;
  });

/**
 * Reduce an HTML document to readable text: scripts, styles and the head are dropped, headings become `#` lines, list
 * items `- ` lines, and block elements paragraph breaks.
 *
 * @param html - The document.
 * @returns Its text, with runs of blank lines collapsed.
 */
export const htmlToText = (html: string): string => {
  let text = html
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/<(script|style|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1\s*>/giu, '')
    .replaceAll(/<h([1-6])\b[^>]*>/giu, (_whole, level: string) => `\n\n${'#'.repeat(Number(level))} `)
    .replaceAll(/<li\b[^>]*>/giu, '\n- ')
    .replaceAll(/<br\s*\/?>/giu, '\n')
    .replaceAll(
      /<\/?(p|div|section|article|header|footer|main|aside|nav|ul|ol|table|tr|blockquote|pre|h[1-6])\b[^>]*>/giu,
      '\n\n',
    )
    .replaceAll(/<\/?(td|th)\b[^>]*>/giu, ' ')
    .replaceAll(/<[^>]+>/gu, '');
  text = decodeEntities(text);
  return text
    .split('\n')
    .map((line) => line.replaceAll(/[ \t\f\v\r]+/gu, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
};

const readBounded = async (response: Response): Promise<Uint8Array<ArrayBuffer>> => {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (declared > maxResponseBytes) {
    throw new Error(`Content too large: ${String(declared)} bytes (limit ${String(maxResponseBytes)})`);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return new Uint8Array(new ArrayBuffer(0));
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read chunk by chunk.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxResponseBytes) {
      // oxlint-disable-next-line no-await-in-loop -- the over-long stream is cancelled once, then the loop throws.
      await reader.cancel();
      throw new Error(`Content too large: over ${String(maxResponseBytes)} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const extractPdfText = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const pdf = await import('pdf-parse');
  const parser = new pdf.PDFParse({ data: bytes });
  try {
    const parsed = await parser.getText();
    return parsed.text;
  } finally {
    await parser.destroy();
  }
};

const truncate = (content: string): string =>
  content.length > maxPageCharacters
    ? `${content.slice(0, maxPageCharacters)}\n\n[Truncated: ${String(content.length - maxPageCharacters)} more characters]`
    : content;

/**
 * Fetch one page, re-checking every redirect hop, and return its text.
 *
 * @param url - The model's URL.
 * @param signal - The caller's signal.
 * @param dependencies - Injected fetch and resolver.
 * @returns The final URL and its extracted text.
 */
const fetchPage = async (
  url: string,
  signal: AbortSignal,
  dependencies: WebResearchDependencies,
): Promise<Readonly<{ url: string; content: string }>> => {
  let current = new URL(url);
  const bounded = withTimeout(signal);
  for (let hop = 0; ; hop += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each redirect hop is checked before it is followed.
    await assertPublicUrl(current, dependencies.lookup);
    // oxlint-disable-next-line no-await-in-loop -- each redirect hop is checked before it is followed.
    const response = await dependencies.fetch(current.href, {
      redirect: 'manual',
      signal: bounded,
      headers: {
        'user-agent': userAgent,
        accept: 'text/html, text/markdown, application/pdf, text/*;q=0.9, */*;q=0.1',
      },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location !== null) {
      if (hop >= maxRedirects) {
        throw new Error(`Too many redirects (over ${String(maxRedirects)})`);
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)}${response.statusText === '' ? '' : ` ${response.statusText}`}`);
    }
    const mimeType = (response.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
    // oxlint-disable-next-line no-await-in-loop -- the final hop's body is read once.
    const bytes = await readBounded(response);
    let content: string;
    if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') {
      content = htmlToText(new TextDecoder().decode(bytes));
    } else if (mimeType === 'application/pdf') {
      // oxlint-disable-next-line no-await-in-loop -- the final hop's body is parsed once.
      content = await extractPdfText(bytes);
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === '') {
      content = new TextDecoder().decode(bytes);
    } else {
      throw new Error(`Unsupported content type: ${mimeType}`);
    }
    return { url: current.href, content: truncate(content) };
  }
};

/**
 * Extract up to five pages. A page that fails is reported in place; when every page fails the call is a refusal.
 *
 * @param request - The URLs and the caller's signal.
 * @param dependencies - Injected fetch and resolver.
 * @returns The pages, or a coded refusal.
 */
export const browseWeb = async (
  request: Readonly<{ urls: readonly string[]; signal: AbortSignal }>,
  dependencies: WebResearchDependencies = defaultWebResearchDependencies,
): Promise<WebBrowseOutcome> => {
  const settled = await Promise.allSettled(
    request.urls.map(async (url) => fetchPage(url, request.signal, dependencies)),
  );
  request.signal.throwIfAborted();
  const pages = settled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          url: request.urls[index] ?? '',
          content: `[Extraction failed] ${messageOf(result.reason)}. Try a different source via web_search.`,
        },
  );
  if (settled.every((result) => result.status === 'rejected')) {
    return {
      success: false,
      errorCode: webResearchErrorCode.browserNoResults,
      message: `Could not extract content from the requested URLs: ${pages.map((page) => page.content).join(' ')}`,
    };
  }
  return { success: true, pages };
};
