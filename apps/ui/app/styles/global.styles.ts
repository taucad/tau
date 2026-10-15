import type { LinkDescriptor } from 'react-router';
import allotmentStylesUrl from 'allotment/dist/style.css?url';
import dockviewStylesUrl from 'dockview-react/dist/styles/dockview.css?url';
import globalStylesUrl from '#styles/global.css?url';

/**
 * A stylesheet link React 19 treats as a stylesheet resource.
 *
 * React writes `precedence` stylesheets into the head ahead of the module
 * preloads `<Scripts />` hoists for the route graph. A plain stylesheet link is
 * written after them, so on a slow link the render-blocking CSS queued behind
 * hundreds of preloaded chunks and delayed first paint. One shared precedence
 * keeps these sheets in declaration order, which the dockview overrides in
 * `global.css` depend on.
 */
type StylesheetDescriptor = LinkDescriptor & { readonly precedence: string };

const stylesheetPrecedence = 'default';

/*
 * Only the sans face is preloaded: it sets almost every first-paint glyph. The
 * mono face loads from its `@font-face` rule when code or identifiers first
 * render, instead of competing for bandwidth on every page.
 */
const fonts: LinkDescriptor[] = [
  {
    rel: 'preload',
    href: '/fonts/Geist-Variable.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
];

const styleSheets: StylesheetDescriptor[] = [
  {
    rel: 'stylesheet',
    href: allotmentStylesUrl,
    precedence: stylesheetPrecedence,
  },
  {
    rel: 'stylesheet',
    href: dockviewStylesUrl,
    precedence: stylesheetPrecedence,
  },
  {
    rel: 'stylesheet',
    href: globalStylesUrl,
    precedence: stylesheetPrecedence,
  },
];

export const globalStylesLinks: LinkDescriptor[] = [...fonts, ...styleSheets];
