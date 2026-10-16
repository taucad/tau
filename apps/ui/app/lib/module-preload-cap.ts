import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type { EntryContext } from 'react-router';

/** Route id of the catch-all page every unknown path renders. */
export const notFoundRouteId = 'routes/$';

const headClose = '</head>';
const modulePreloadPattern = /<link\b[^>]*\brel="modulepreload"[^>]*>/gu;
const hrefPattern = /\bhref="([^"]*)"/u;

/**
 * The module preloads a page keeps in its head: the client entry, the entry's
 * own imports and the module of every matched route.
 *
 * React Router preloads every chunk the matched routes import, about 250 on
 * the home page. The origin serves them all at once regardless of request
 * priority, so they share the first round trips with the stylesheets that
 * gate first paint. The browser still finds every other chunk from the static
 * imports of the modules kept here.
 *
 * @param context - The React Router entry context of the request.
 * @returns The hrefs whose preload links stay in the document.
 */
export const criticalModuleHrefs = (context: EntryContext): ReadonlySet<string> => {
  const { manifest, staticHandlerContext } = context;
  const routeModules = staticHandlerContext.matches.flatMap((match) => {
    const route = manifest.routes[match.route.id];
    return route ? [route.module] : [];
  });
  return new Set([manifest.entry.module, ...manifest.entry.imports, ...routeModules]);
};

/**
 * Whether the request rendered the catch-all page for an unknown path.
 *
 * @param context - The React Router entry context of the request.
 * @returns True when the deepest matched route is the catch-all page.
 */
export const isNotFoundRender = (context: EntryContext): boolean =>
  context.staticHandlerContext.matches.at(-1)?.route.id === notFoundRouteId;

/**
 * Drop every module preload link of an HTML head whose href is not kept.
 *
 * @param head - The document text up to and including the closing head tag.
 * @param keep - The hrefs whose preload links stay.
 * @returns The head without the dropped links.
 */
export const capModulePreloads = (head: string, keep: ReadonlySet<string>): string =>
  head.replaceAll(modulePreloadPattern, (link) => {
    const href = hrefPattern.exec(link)?.[1];
    return href !== undefined && keep.has(href) ? link : '';
  });

/**
 * A pass-through for the rendered document that caps the module preloads of
 * its head with {@link capModulePreloads}. It holds the text back until the
 * head closes, so a link split across two rendered chunks is still seen
 * whole, then streams the body untouched.
 *
 * @param keep - The hrefs whose preload links stay.
 * @returns The transform to pipe the rendered document through.
 */
export const createModulePreloadCap = (keep: ReadonlySet<string>): Transform => {
  const decoder = new StringDecoder('utf8');
  let head: string | undefined = '';
  return new Transform({
    transform(chunk: Uint8Array<ArrayBuffer> | string, _encoding: BufferEncoding, callback: TransformCallback) {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      if (head === undefined) {
        callback(null, text);
        return;
      }
      head += text;
      const end = head.indexOf(headClose);
      if (end === -1) {
        callback();
        return;
      }
      const capped = capModulePreloads(head.slice(0, end + headClose.length), keep);
      const rest = head.slice(end + headClose.length);
      head = undefined;
      callback(null, capped + rest);
    },
    flush(callback: TransformCallback) {
      callback(null, `${head ?? ''}${decoder.end()}` || undefined);
    },
  });
};
