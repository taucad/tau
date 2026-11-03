/** Private supervisor preload: record OS lifetime RSS high-water on orderly exit, without changing its protocol. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = new URL(import.meta.url).searchParams.get('directory');
if (!directory) {
  throw new Error('Supervisor resource qualification requires a receipt directory.');
}
const baselineRssBytes = process.memoryUsage().rss;
process.once('exit', (exitCode) => {
  writeFileSync(
    join(directory, `${String(process.pid)}.json`),
    JSON.stringify({
      pid: process.pid,
      exitCode,
      baselineRssBytes,
      // Node normalizes resourceUsage().maxRSS to KiB on every supported platform.
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
    { flag: 'wx' },
  );
});
