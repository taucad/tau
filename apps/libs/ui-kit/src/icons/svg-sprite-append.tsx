/**
 * Append one SVG sprite's symbols to the document from code, for a sprite that arrives after the first paint (W9
 * report R3, defect D3): the Cloud chunk's payment artwork. The document's own sprites load through the inline script
 * of `svg-sprite-loader.tsx`, which runs only in the server-rendered HTML; a script React inserts on the client never
 * runs, so a sprite mounted later loads here instead. Each URL is appended once; `<SvgIcon>` resolves its symbols as
 * same-document references, wherever in the document they sit.
 */

/** The attribute naming the sprite URL a container holds. @public */
export const svgSpriteUrlAttribute = 'data-tau-sprite';

const pending = new Map<string, Promise<void>>();

/**
 * Fetch one sprite and append its symbols in a hidden container, once per URL.
 *
 * @param url - The hashed sprite asset URL.
 * @param options - The document and fetch to use; the page's by default.
 * @returns Settles once the symbols are in the document, or the fetch failed (a later call tries again).
 * @public
 */
export const appendSvgSprite = async (
  url: string,
  options: Readonly<{ document?: Document; fetch?: typeof globalThis.fetch }> = {},
): Promise<void> => {
  const target = options.document ?? globalThis.document;
  if (target.querySelector(`[${svgSpriteUrlAttribute}="${CSS.escape(url)}"]`) !== null) {
    return;
  }
  const inFlight = pending.get(url);
  if (inFlight !== undefined) {
    return inFlight;
  }
  const load = (async (): Promise<void> => {
    try {
      const response = await (options.fetch ?? globalThis.fetch)(url);
      if (!response.ok) {
        return;
      }
      const container = target.createElement('div');
      container.setAttribute(svgSpriteUrlAttribute, url);
      container.setAttribute('aria-hidden', 'true');
      container.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      container.innerHTML = await response.text();
      target.body.append(container);
    } catch {
      // A missing sprite leaves its icons blank; the next mount tries again.
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, load);
  return load;
};
