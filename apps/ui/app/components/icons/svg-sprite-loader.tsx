/** Id of the hidden element the sprite symbols are injected into. */
export const svgSpriteElementId = 'tau-svg-sprite';

/**
 * The inline script that fetches the sprite files and appends their symbols to
 * the document in one hidden element.
 *
 * The element lives outside the React tree, so hydration never compares it,
 * and React 19 skips an unexpected trailing node of `<body>`. As an inline
 * script it runs once the render-blocking stylesheets have loaded, so the
 * sprite's bytes never compete with first-paint CSS.
 *
 * @param urls - The hashed sprite asset URLs, in document order.
 * @returns The script source.
 */
export const buildSvgSpriteScript = (urls: readonly string[]): string =>
  `(()=>{if(document.getElementById(${JSON.stringify(svgSpriteElementId)}))return;` +
  `Promise.all(${JSON.stringify(urls)}.map((u)=>fetch(u).then((r)=>r.ok?r.text():'')))` +
  `.then((t)=>{const m=document.createElement('div');m.id=${JSON.stringify(svgSpriteElementId)};` +
  `m.setAttribute('aria-hidden','true');m.style.cssText='position:absolute;width:0;height:0;overflow:hidden';` +
  `m.innerHTML=t.join('');document.body.append(m);}).catch(()=>{});})();`;

/**
 * Loads the generated SVG icon sprites once per document so every
 * `<SvgIcon>` `<use href="#id" />` resolves as a same-document reference.
 *
 * Same-document references avoid the cross-document
 * `<use href="external.svg#id">` path, where Safari (and other engines, less
 * aggressively) silently drop `<filter>`, `<mask>`, `<clipPath>` and
 * `<linearGradient>` definitions, breaking icons such as `opencascadejs`,
 * `meta` and `autodesk`. The sprites are hashed, cached assets rather than
 * markup inlined into every page and every client bundle.
 *
 * @param props - The component props.
 * @param props.urls - The hashed sprite asset URLs.
 * @returns The loader script.
 */
export function SvgSpriteLoader({ urls }: { readonly urls: readonly string[] }): React.JSX.Element {
  return (
    <script
      // oxlint-disable-next-line react/no-danger -- build-time asset URLs serialised as JSON.
      dangerouslySetInnerHTML={{ __html: buildSvgSpriteScript(urls) }}
    />
  );
}
