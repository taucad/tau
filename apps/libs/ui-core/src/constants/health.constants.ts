/**
 * Heap threshold (bytes) for the SSR Node process serving the UI.
 *
 * The UI runs via an Express server (`apps/ui/server.ts`) on Fly.io with the same 2 GiB VM
 * allocation as the API. Use 80 % of that as the soft ceiling so the
 * `/health/live` probe trips before V8 OOM-aborts the process.
 *
 * Mirrors `apps/api/app/api/health/health.controller.ts:heapThresholdBytes`.
 * Lifted to a constant so the value is asserted against a single source of
 * truth in tests instead of duplicating the magic number per route.
 *
 * Kept in one place so UI health routes and tests share the same threshold.
 */
export const heapThresholdBytes = 2 * 1024 * 1024 * 1024 * 0.8;
