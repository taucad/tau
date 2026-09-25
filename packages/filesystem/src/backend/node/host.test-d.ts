/**
 * Compile-time guarantee for the node filesystem host's option pair (G0b-6).
 *
 * `allowRoot` decides that a renderer-named root is served at all; `policy` is
 * what stops an ordinary name resolving through a symlink into the reserved
 * layout under it (G0-6). Serving the first without the second is fail-open, so
 * the two are stated together or not at all.
 */

import { describe, it } from 'vitest';
import { serveNodeFsProvider } from '#backend/node/host.js';
import type { NodeFsPort } from '#backend/node/port.js';
import { tauPathPolicy } from '#path-registry.js';

declare const port: NodeFsPort;

describe('serveNodeFsProvider options — type guarantees', () => {
  it('requires the reserved layout beside the root gate', () => {
    // @ts-expect-error A host that admits a root states the layout an ordinary name may not reach.
    serveNodeFsProvider(port, { allowRoot: () => true });
    serveNodeFsProvider(port, { allowRoot: () => true, policy: tauPathPolicy });
  });
});
