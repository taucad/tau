import { execFileSync } from 'node:child_process';

/**
 * Answer whether a Brain-relative path is tracked, from the index rather than the disk: a sparse
 * mount leaves most of `research/artifacts/` unmaterialised, yet a `related:` entry into it is valid.
 * A directory counts when any tracked path lies under it. Without a Brain checkout nothing is tracked.
 */
export const createBrainIndex = (brainRoot: string): ((path: string) => boolean) => {
  let tracked: Set<string> | undefined;
  return (path) => {
    if (!tracked) {
      try {
        const listing = execFileSync('git', ['-C', brainRoot, 'ls-files', '-z'], {
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        tracked = new Set(listing.split('\0').filter(Boolean));
      } catch {
        tracked = new Set();
      }
    }

    const normalized = path.replace(/\/+$/, '');
    if (tracked.has(normalized)) {
      return true;
    }

    const prefix = `${normalized}/`;
    for (const entry of tracked) {
      if (entry.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  };
};
