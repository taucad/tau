/**
 * The shared client entry, unchanged. Present only because React Router looks
 * `entry.client` up inside `appDirectory`, which the desktop build relocates.
 */
// oxlint-disable-next-line import/no-unassigned-import -- the shared entry is a side-effecting hydration bootstrap.
import '#entry.client.js';
