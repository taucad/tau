/**
 * `files.<zone>`: the Worker module tau-cloud deploys as `files-worker.mjs`.
 *
 * Only the default export: workerd reads a module's named exports as
 * entrypoints, so the handler factory lives in `worker.ts`.
 */

import { createFilesWorker } from '#worker.js';

const filesWorker = { fetch: createFilesWorker() };

export default filesWorker;
