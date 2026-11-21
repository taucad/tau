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
 * When it reveals the strip it also sends one stall report, so a request that never completed (the network) can be
 * told apart from an app that loaded and hung (P12-F1b). The report is built and sent by the same script, because the
 * bundle may be what never arrived:
 *
 * - **What is still loading.** From the top of `<head>` the script records every element whose `load` or `error`
 *   event it sees (one capturing listener per type on `document`; load events do not bubble, but they are captured).
 *   At the deadline, each same-origin `modulepreload`, `preload` and stylesheet link and each external script the
 *   document declares that has fired neither, and has no Resource Timing entry either, is reported by its path, with
 *   no query string or fragment. Limits: there is no web API for requests in flight, so a module the document does
 *   not declare (a static import deeper than the preloads) or a request the browser never started is not named; such
 *   a stall reads `none-pending`.
 * - **Where the page got to.** `document.readyState`, whether hydration started (React's container key on
 *   `document`), how many route modules React Router loaded, `homeReady`, the time since navigation start,
 *   `navigator.onLine`, the effective connection type and `document.fonts.status`.
 * - **Where it goes.** One Sentry event (`tau_event: boot-watchdog`, fingerprinted by stall kind) posted with
 *   `navigator.sendBeacon` to the same-origin Sentry tunnel ({@link bootStallReportPath}), as the bundle's own
 *   errors go, with the page's `window.ENV` DSN, environment and `tau-ui@<build id>` release. Nothing is sent without
 *   a DSN. Like every Sentry error on the web it does not wait for cookie consent (browser observability D1, SB8):
 *   it stores nothing on the device and carries no cookie, storage, user id or query string; only the page path
 *   (invitation tokens redacted) and the `User-Agent`, as the bundle's events carry them.
 *
 * Before the deadline the script only adds elements to a `WeakSet` as their load events fire; when the shell mounts
 * in time, the deadline removes the listeners and sends nothing.
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
 * Where the stall report is posted: the same-origin Sentry tunnel (`sentryTunnelPath`, `routes/api.monitoring`). A
 * literal here, so the root document does not import the Sentry event library; a test keeps the two equal.
 *
 * @public
 */
export const bootStallReportPath = '/api/monitoring';

/* Declared resources the report names at most; the count is reported in full. */
const pendingListLimit = 20;

/* The document's own resource declarations the report checks. */
const declaredResources = 'link[rel=modulepreload],link[rel=preload],link[rel=stylesheet],script[src]';

/*
 * The stall report, run once as the strip is revealed (see the module comment). `d` is the document, `f` the elements
 * whose load or error event was seen, `b` the boot global. Every read is guarded: it must never break the page.
 */
const stallReport =
  `const q=()=>{try{const E=globalThis.ENV||{},k=E.SENTRY_DSN,N=navigator;if(!k||!N.sendBeacon)return;` +
  `const o=location.origin,n={};try{for(const r of performance.getEntriesByType('resource'))n[r.name]=1}catch(e){}` +
  `const p=[];let c=0;for(const e of d.querySelectorAll(${JSON.stringify(declaredResources)})){` +
  `const u=new URL(e.href||e.src,o);if(u.origin!==o)continue;c++;if(!f.has(e)&&!n[u.href])p.push(u.pathname)}` +
  `const y=d.readyState,s=p.length?'resource-pending':y==='loading'?'document-loading':'none-pending',` +
  `C=N.connection,v=E.SENTRY_ENVIRONMENT||E.NODE_ENV,B=Number(E.TAU_BUILD_ID),t=Date.now(),` +
  `i=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>(x+256).toString(16).slice(1)).join('');` +
  `N.sendBeacon(${JSON.stringify(bootStallReportPath)},JSON.stringify({event_id:i,sent_at:new Date(t).toISOString(),dsn:k})` +
  `+'\\n{"type":"event"}\\n'+JSON.stringify({event_id:i,timestamp:t/1e3,platform:'javascript',logger:'boot-watchdog',` +
  `level:s==='none-pending'?'error':'warning',message:'Boot watchdog: shell not mounted ('+s+')',` +
  `fingerprint:['boot-watchdog',s],environment:v&&N.webdriver&&!/-e2e$/.test(v)?v+'-e2e':v,` +
  `release:B?'tau-ui@'+B:void 0,tags:{tau_event:'boot-watchdog',stall:s,` +
  `hydration_started:String(Object.keys(d).some(x=>x.indexOf('__reactContainer$')===0)),online:String(N.onLine),` +
  `effective_type:C&&C.effectiveType||'unknown',ready_state:y},contexts:{boot_watchdog:{pending:p.slice(0,${pendingListLimit}),` +
  `pending_count:p.length,declared:c,elapsed_ms:Math.round(performance.now()),home_ready:!!b.homeReady,` +
  `route_modules:Object.keys(globalThis.__reactRouterRouteModules||{}).length,fonts:d.fonts&&d.fonts.status}},` +
  `request:{url:o+location.pathname.replace(/\\/invitations\\/[^/]+/gi,'/invitations/[redacted]'),` +
  `headers:{'User-Agent':N.userAgent}}}))}catch(e){}};`;

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
    : `(()=>{try{const b=globalThis.${bootGlobalName}=globalThis.${bootGlobalName}||{},d=document,f=new WeakSet,` +
      `h=e=>{f.add(e.target)},z=()=>{d.removeEventListener('load',h,true);d.removeEventListener('error',h,true)};` +
      `d.addEventListener('load',h,true);d.addEventListener('error',h,true);${stallReport}` +
      `const w=()=>{if(b.shellMounted){z();return}const s=d.getElementById(${JSON.stringify(bootStripId)});` +
      `if(!s){setTimeout(w,${bootStripRetry});return}const r=s.querySelector('[data-boot-action=${bootReloadAction}]');` +
      `if(r)r.addEventListener('click',()=>{let l=0;const g=()=>{if(!l){l=1;location.reload()}};` +
      `const n=navigator.serviceWorker;if(!n||!n.controller){g();return}setTimeout(g,${bootReloadCleanupLimit});` +
      `const p=new RegExp(${JSON.stringify(bootWorkerCachePattern)});Promise.all([` +
      `n.getRegistrations().then(a=>Promise.all(a.map(x=>x.unregister()))),` +
      `caches.keys().then(k=>Promise.all(k.filter(c=>p.test(c)).map(c=>caches.delete(c))))]).then(g,g)});` +
      `s.hidden=false;q();z()};setTimeout(w,${bootWatchdogDeadline})` +
      `}catch(e){}})()`;
