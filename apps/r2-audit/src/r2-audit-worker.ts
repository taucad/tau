/**
 * `tau-r2-audit-<env>`: the Worker module tau-cloud deploys as `worker.mjs` (`modules/cloudflare-r2-audit`).
 *
 * Only the default export: workerd reads a module's named exports as entrypoints, so the handler
 * factory lives in `worker.ts`. No `fetch` handler: the Worker has no HTTP surface.
 */

import { createAuditWorker } from '#worker.js';

const auditWorker = createAuditWorker();

export default auditWorker;
