/**
 * Private supervisor preload: record OS lifetime RSS high-water on orderly exit, without changing its protocol.
 *
 * Two baselines are recorded. `baselineRssBytes` is taken here, before the supervisor's own module graph loads.
 * `readyRssBytes` is taken when the supervisor writes its first stdout line, its one `ready`/`unavailable` reply,
 * which it sends only after loading the sandbox runtime and initializing it for the launch. The workload's bytes never
 * pass through the supervisor (the shell writes to the host directly), so growth over `readyRssBytes` is what a
 * workload can add; growth before it is the supervisor's fixed start-up cost.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = new URL(import.meta.url).searchParams.get('directory');
if (!directory) {
  throw new Error('Supervisor resource qualification requires a receipt directory.');
}
const baselineRssBytes = process.memoryUsage().rss;
let readyRssBytes: number | undefined;
const write = process.stdout.write.bind(process.stdout) as (...parameters: unknown[]) => boolean;
process.stdout.write = ((...parameters: unknown[]): boolean => {
  readyRssBytes ??= process.memoryUsage().rss;
  return write(...parameters);
}) as typeof process.stdout.write;
process.once('exit', (exitCode) => {
  writeFileSync(
    join(directory, `${String(process.pid)}.json`),
    JSON.stringify({
      pid: process.pid,
      exitCode,
      baselineRssBytes,
      readyRssBytes,
      // Node normalizes resourceUsage().maxRSS to KiB on every supported platform.
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
    { flag: 'wx' },
  );
});
