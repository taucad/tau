import dockviewStylesUrl from 'dockview-react/dist/styles/dockview.css?url';
import { vendorStylesheetPrecedence } from '#styles/global.styles.js';

/**
 * Dockview's own stylesheet, loaded by the layouts that render it rather than
 * by every page.
 *
 * React 19 hoists the link into the head and orders it by precedence: the
 * vendor group was first seen in the root's links, so this sheet lands ahead
 * of `global.css` and its dockview overrides keep winning. On a client
 * navigation React holds the layout's commit until the sheet has loaded.
 *
 * @returns The hoisted stylesheet link.
 */
export function DockviewStyles(): React.JSX.Element {
  return <link rel='stylesheet' href={dockviewStylesUrl} precedence={vendorStylesheetPrecedence} />;
}
