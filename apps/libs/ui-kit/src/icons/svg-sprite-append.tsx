/**
 * Append one SVG sprite's symbols to the document from code, for a sprite that arrives after the first paint (W9
 * report R3, defect D3): the Cloud chunk's payment artwork. The document's own sprites load through the inline script
 * of `svg-sprite-loader.tsx`, which runs only in the server-rendered HTML; a script React inserts on the client never
 * runs, so a sprite mounted later is appended here instead. The markup is bundled with its caller at build time (a
 * `?raw` import), so there is no request, no failure path and nothing to retry. Each sprite is appended once;
 * `<SvgIcon>` resolves its symbols as same-document references, wherever in the document they sit.
 */

/** The attribute naming the sprite a container holds. @public */
export const svgSpriteIdAttribute = 'data-tau-sprite';

/**
 * Append one sprite's symbols in a hidden container, once per id.
 *
 * @param id - The sprite's name, which marks its container.
 * @param markup - The sprite's SVG markup, bundled at build time.
 * @param target - The document; the page's by default.
 * @public
 */
export const appendSvgSprite = (id: string, markup: string, target: Document = globalThis.document): void => {
  if (target.querySelector(`[${svgSpriteIdAttribute}="${CSS.escape(id)}"]`) !== null) {
    return;
  }
  const container = target.createElement('div');
  container.setAttribute(svgSpriteIdAttribute, id);
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  container.innerHTML = markup;
  target.body.append(container);
};
