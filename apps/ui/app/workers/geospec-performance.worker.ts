/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug worker executes the private benchmark runner shared with desktop.
import {
  parsePerformanceLabRunInput,
  runPerformanceLabCell,
} from '../../../../packages/geospec-engine/experiments/performance-lab/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */
import type { PerformanceLabPortRequest } from '#services/geospec-performance.js';

globalThis.addEventListener('message', async (event: MessageEvent<PerformanceLabPortRequest>): Promise<void> => {
  const { id, input } = event.data;
  try {
    const parsed = await parsePerformanceLabRunInput(input);
    if (parsed.engine === 'native-desktop') {
      throw new Error('Native engine runs only in the desktop utility.');
    }
    const result = await runPerformanceLabCell(parsed, {
      combined: async () => import('@taucad/geospec-engine-native/wasm'),
    });
    globalThis.postMessage({ id, type: 'result', result });
  } catch (error) {
    globalThis.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
