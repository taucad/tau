/**
 * The web build's boot watchdog (desktop resilient startup blueprint, D0 "Web"; R12, B28).
 *
 * The web has no main process to notice a page that never mounts, so the server-rendered document carries a small
 * inline script and a hidden static strip. The script starts a timer; if the app has not reported `shell-mounted`
 * (`globalThis.__tauBoot.shellMounted`, written by `lib/boot-signals.ts`) after {@link bootWatchdogDeadline}, it
 * reveals the strip with **Reload** and **Open in safe mode**, looking again each second while the strip has not yet
 * reached the document. Neither depends on the bundle, so they still work when the bundle throws before hydration or
 * never loads.
 *
 * **Under a service worker** (FP5 of Brain `research/pl7-service-worker-staging-defects-blueprint.md`), Reload first
 * unregisters the worker and deletes its caches, so the reload reaches the network as if no worker were there: a worker
 * that stalls the page (D5) would otherwise answer the reload the same way. The reload happens after
 * {@link bootReloadCleanupLimit} at the latest, whatever the cleanup does. Safe mode (`/?safe=1`) is never answered by
 * the worker (`service-worker.ts`) and its page unregisters it (`use-pwa.ts`).
 *
 * The desktop build emits neither: main owns its watchdog and the recovery window there.
 */
import { bootGlobalName, bootStripId, safeModeHref } from '#lib/boot-signals.js';
import { isDesktopTarget } from '#lib/build-target.js';

/** How long the page may take to mount its shell before the strip is shown. Milliseconds. @public */
export const bootWatchdogDeadline = 20_000;

/* A strip not yet in the document at the deadline (a body still streaming) is looked for again this often. */
const bootStripRetry = 1000;

/**
 * The web app's service worker caches (`isWorkerCache` in `offline/pwa-caches.ts`) as a regular expression's source, for
 * Reload's cleanup. A literal, not an import: the desktop build carries this module and must carry no web worker
 * surface (`check-desktop-payload.mts`). `boot-watchdog.test.ts` holds it to `isWorkerCache`. @public
 */
export const bootWorkerCachePattern = String.raw`^tau-(?:precache-|runtime-|offline-shell-|assets(?:-v\d+)?$|state-v\d+$)`;

/** Longest wait for Reload's worker cleanup before reloading anyway. Milliseconds. @public */
export const bootReloadCleanupLimit = 3000;

/** The `data-boot-action` value of the strip's Reload button, which the script wires. @public */
export const bootReloadAction = 'reload';

/**
 * The strip's markup: hidden until the script reveals it. Inline styles only, so it renders even when no stylesheet
 * loaded; the flex layout sits on an inner element, because an inline `display` on the element that carries `hidden`
 * would override it. Reload is a button the script wires (no inline handler, which the content security policy would
 * report); safe mode is a plain link.
 *
 * @public
 */
export const bootWatchdogStripHtml =
  `<div id="${bootStripId}" role="alert" hidden style="position:fixed;inset:auto 0 0 0;z-index:2147483647;` +
  `font:14px/1.4 system-ui,sans-serif;background:#18181b;color:#fafafa">` +
  `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:12px 16px">` +
  `<span>Tau is taking longer than expected to start.</span>` +
  `<button type="button" data-boot-action="${bootReloadAction}" style="font:inherit;padding:4px 12px;` +
  `border-radius:6px;border:1px solid #52525b;background:#fafafa;color:#18181b">Reload</button>` +
  `<a href="${safeModeHref}" style="color:inherit;text-decoration:underline">Open in safe mode</a>` +
  `</div></div>`;

/**
 * The watchdog's inline script, or `undefined` on the desktop build, which emits none.
 *
 * @returns The script's source.
 * @public
 */
export const buildBootWatchdogScript = (): string | undefined =>
  isDesktopTarget()
    ? undefined
    : `(()=>{try{const b=globalThis.${bootGlobalName}=globalThis.${bootGlobalName}||{};` +
      `const w=()=>{if(b.shellMounted)return;const s=document.getElementById(${JSON.stringify(bootStripId)});` +
      `if(!s){setTimeout(w,${bootStripRetry});return}const r=s.querySelector('[data-boot-action=${bootReloadAction}]');` +
      `if(r)r.addEventListener('click',()=>{let d=0;const g=()=>{if(!d){d=1;location.reload()}};` +
      `const n=navigator.serviceWorker;if(!n||!n.controller){g();return}setTimeout(g,${bootReloadCleanupLimit});` +
      `const p=new RegExp(${JSON.stringify(bootWorkerCachePattern)});Promise.all([` +
      `n.getRegistrations().then(a=>Promise.all(a.map(x=>x.unregister()))),` +
      `caches.keys().then(k=>Promise.all(k.filter(c=>p.test(c)).map(c=>caches.delete(c))))]).then(g,g)});` +
      `s.hidden=false};setTimeout(w,${bootWatchdogDeadline})` +
      `}catch(e){}})()`;
