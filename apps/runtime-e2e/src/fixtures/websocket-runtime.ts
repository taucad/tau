/**
 * Runtime definition shared by the WebSocket API-server fixture (child
 * process) and the UI side of the two-process suite.
 *
 * Both halves must build the *same* definition or the E1/E7 parity
 * assertions ("socket bytes are byte-identical to an in-process render")
 * would be comparing two different pipelines.
 */

import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicad } from '@taucad/replicad';
import { defineRuntime } from '@taucad/runtime/worker';

/**
 * Replicad + caches + esbuild. `geometryCache`/`parameterCache` are what put
 * `.tau/cache/**` writes on the filesystem seam, which is what E3 proves
 * crosses the `/fs` socket.
 */
export const webSocketRuntime = defineRuntime({
  plugins: [replicad(), esbuild(), middleware({ preset: 'cache' })],
});

/**
 * Replicad source for a parameterised box.
 *
 * @param height - Default `height` parameter baked into the module.
 * @returns Module source text.
 */
export const boxSource = (height: number): string =>
  [
    "import { makeBaseBox } from 'replicad';",
    '',
    `export default function main({ height = ${String(height)} }) {`,
    '  return makeBaseBox(10, height, 30);',
    '}',
    '',
  ].join('\n');
