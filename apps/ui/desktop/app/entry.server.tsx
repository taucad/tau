/**
 * The SPA builds' server entry, which prerenders `index.html` with an unstarted app runtime (D5). Present only
 * because React Router looks `entry.server` up inside `appDirectory`, which the desktop build relocates.
 */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the relocated appDirectory's one entry.
export { default } from '#runtime/app-runtime-spa-entry.server.js';
