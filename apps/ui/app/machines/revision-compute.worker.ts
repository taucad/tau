/**
 * Revision Compute Worker
 *
 * The CPU half of the browser's revision store (charter D7): inflate, hashing,
 * pack indexing, delta resolution, zip decode and grep, off the file-manager
 * worker's event loop. It holds no state, so a crash loses only the calls in
 * flight, and the supervisor in `revision-compute.ts` starts another.
 */

import { serveComputeWorker } from '@taucad/revisions';

serveComputeWorker(globalThis as unknown as Parameters<typeof serveComputeWorker>[0]);
