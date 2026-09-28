/** Byte-only, debug-only GeoSpec evaluation in the existing services utility. */
import { toNodeFsPort } from '@taucad/filesystem/backend/node';
import { z } from 'zod';
import type { UtilityPort } from '#tau/services-host.impl.js';
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source shared with the browser; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug-only utility shares the private benchmark runner.
import {
  parsePerformanceLabRunInput,
  runPerformanceLabCell,
} from '../../../../packages/geospec-engine-native/bench/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */

const requestSchema = z.object({
  type: z.literal('run'),
  id: z.number().int().nonnegative(),
  input: z.unknown(),
});

/**
 * Serve sequential ordinary comparisons without filesystem or arbitrary code authority.
 * @param port - The debug concern's dedicated services channel.
 * @returns Close admission and await the current run's normal cleanup.
 */
export const serveGeoSpecPerformance = (port: UtilityPort): (() => Promise<void>) => {
  const channel = toNodeFsPort(port);
  let closing = false;
  let active: Promise<void> | undefined;
  const run = async (id: number, value: unknown): Promise<void> => {
    try {
      const input = await parsePerformanceLabRunInput(value);
      if (input.engine !== 'native-desktop') {
        throw new TypeError('The desktop native concern only runs native-desktop requests.');
      }
      const result = await runPerformanceLabCell(
        { ...input, cache: 'host-module-cache' },
        {
          native: async () => {
            const module = await import('@taucad/geospec-engine-native/node');
            // The lab passes a WASM execution choice to Engine; native uses its own cache options.
            class NativeLabEngine extends module.Engine {
              public constructor() {
                super();
              }
            }
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
            return { ...module, Engine: NativeLabEngine };
          },
        },
      );
      channel.postMessage({ id, type: 'result', result });
    } catch (error) {
      channel.postMessage({
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      active = undefined;
    }
  };
  const handleMessage = ({ data }: { data: unknown }): void => {
    const parsed = requestSchema.safeParse(data);
    if (!parsed.success || closing) {
      return;
    }
    const { id, input } = parsed.data;
    if (active !== undefined) {
      channel.postMessage({
        id,
        type: 'error',
        message: 'A GeoSpec comparison is already running.',
      });
      return;
    }
    active = run(id, input);
  };
  channel.addEventListener('message', handleMessage);
  channel.start?.();
  return async () => {
    // Stop admission, then settle the accepted request before closing its reply channel.
    closing = true;
    channel.removeEventListener?.('message', handleMessage);
    await active;
    channel.close?.();
  };
};
