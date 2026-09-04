import { setTimeout } from 'node:timers/promises';

export const waitForUrl = async (url: string, interval = 100): Promise<void> => {
  try {
    await fetch(url);
  } catch {
    await setTimeout(interval);
    await waitForUrl(url, interval);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await waitForUrl(process.argv[2]!);
}
