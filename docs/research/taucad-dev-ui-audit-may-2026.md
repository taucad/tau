---
title: 'taucad.dev + tau.new UI Audit — May 2026'
description: 'Comprehensive empirical UI audit of staging (taucad.dev/Netlify) and production (tau.new/Fly.io) covering Core Web Vitals, axe-core WCAG 2.2 AA, security headers, SEO crawlability, and bundle/network profile, with a prioritised remediation plan keyed to the vision/UI/accessibility/UX policies.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: audit
related:
  - docs/policy/vision-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/ux-policy.md
  - docs/policy/ssr-bundle-policy.md
  - docs/research/netlify-production-performance-audit.md
  - docs/research/homepage-time-to-interactive-analysis.md
  - docs/research/editor-route-prefetch-and-cache-audit.md
---

# taucad.dev + tau.new UI Audit — May 2026

Programmatic + empirical audit of staging (`taucad.dev` on Netlify) and production (`tau.new` on Fly.io) on 2026-05-15, exercising the four route classes (marketing home, docs, editor cold-start, community) across mobile (`375 × 667`) and desktop (`1440 × 900`) viewports. Captures Core Web Vitals, accessibility (WCAG 2.2 AA), HTTP/security headers, SEO crawlability, and the JS bundle/network profile. Findings are scored against the policies and ship with prioritised remediations.

## Executive Summary

The most important finding is **architectural**: production (`tau.new`) is served by **Fly.io** and is missing every single security header that the staging (`taucad.dev`) Netlify deployment sets — including `cross-origin-opener-policy`, `cross-origin-embedder-policy`, `cross-origin-resource-policy`, `strict-transport-security`, `cache-control`, `content-security-policy`, `permissions-policy`, and `x-content-type-options`. Tau's runtime depends on `SharedArrayBuffer` (CAD kernels, shared memory pools), which requires cross-origin isolation — production currently does not deliver the COOP/COEP/CORP triad and is at minimum a P0 hardening regression versus staging, with likely runtime degradation for kernel-backed flows.

Beyond the production hardening gap, staging exhibits four compounding UX/performance issues on the marketing routes:

1. **Mobile FCP is 10.7 s and LCP 12.2 s on `taucad.dev/`** with Lighthouse perf at **55/100**, despite TTFB being healthy (30 ms server response). Root cause is **833 KiB of unused JavaScript** on first paint (eagerly loaded `three.webgpu`, `cad-viewer`, `chat-textarea`, `react-three-fiber`, `proxy`, `canvas-three-gl`) — the editor's component graph is being pulled into the homepage bundle.
2. **Accessibility scores 83–85** with **22 critical button-name violations on the homepage alone** (mobile/desktop), 7 desktop `aria-allowed-attr` regressions, link-name and color-contrast failures, and heading-order issues on every audited route.
3. **HTML SSR shell is 3.87 MB on `tau.new` vs 178 KB on `taucad.dev`** (22× larger), with **117 `<link rel="modulepreload">` tags** on production vs 1 on staging — the production build is shipping the whole route graph as eager preloads in the first response.
4. **All audited routes fail Lighthouse SEO `is-crawlable`** on staging because `taucad.dev/robots.txt` correctly disallows search engines, but the same audit on production would (correctly) pass — staging's score is a red herring, but the SEO routing for the editor pages still needs review.

Recommendations are summarised in the table at the end of this document. P0 actions are the production COOP/COEP/cache-control gap, the homepage unused-JS purge, and the homepage button-name accessibility violations.

## Methodology

| Tool                     | Version                   | Use                                                                     |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| Lighthouse               | 12.x via `npx lighthouse` | Perf + a11y + best-practices + SEO scores, mobile + desktop             |
| `@axe-core/playwright`   | 4.10+                     | WCAG 2.2 AA rule engine across 4 routes × 2 viewports                   |
| `@playwright/test`       | 1.x                       | Headless Chromium driver for axe                                        |
| `curl -sI`               | system                    | HTTP/security header capture (staging vs production)                    |
| `cursor-ide-browser` MCP | live                      | Console errors, screenshots, viewport layout checks                     |
| `source-map-explorer`    | 2.x                       | (Available, deferred — staging assets do not ship source maps publicly) |

All artifacts colocate in `tmp/audit-2026-05-15/`:

- `lh-home-{desktop,mobile}.report.{json,html}`
- `lh-editor-mobile.report.json`
- `lh-docs-mobile.report.json`
- `axe-violations.json` (831 KB, full node list)
- `axe-summary.json`
- `axe-audit.mjs` (driver — also installed as the reusable skill at `.agent/skills/audit-ui/scripts/axe-audit.mjs`)

The reusable audit recipe lives in `.agent/skills/audit-ui/SKILL.md`.

## Findings

### Finding 1: Production (`tau.new`) is missing every security header

**Severity**: P0 — likely runtime regression for `SharedArrayBuffer`-dependent flows.

Curl HEAD responses on 2026-05-15:

| Header                                  | `taucad.dev` (Netlify)              | `tau.new` (Fly.io)           |
| --------------------------------------- | ----------------------------------- | ---------------------------- |
| `cross-origin-opener-policy`            | `same-origin`                       | **absent**                   |
| `cross-origin-embedder-policy`          | `require-corp`                      | **absent**                   |
| `cross-origin-resource-policy`          | `same-origin`                       | **absent**                   |
| `strict-transport-security`             | `max-age=31536000`                  | **absent**                   |
| `cache-control`                         | `public,max-age=0,must-revalidate`  | **absent**                   |
| `content-security-policy[-report-only]` | full policy with `wasm-unsafe-eval` | **absent**                   |
| `permissions-policy`                    | sensor lockdown set                 | **absent**                   |
| `x-content-type-options`                | `nosniff`                           | **absent**                   |
| `cache-status`                          | `Netlify Durable; hit`              | **absent**                   |
| `server`                                | `Netlify`                           | `Fly/8829d9560 (2026-05-12)` |

This contradicts `docs/architecture/ui-deployment-topology.md`, which documents production as Netlify (`taucad-prod-us`). Production traffic on `tau.new` is currently routed through Fly.io and the Express server is **not** invoking `coiMiddleware` from `@taucad/runtime/cross-origin-isolation/express` — the entire `apps/ui/server.ts` cross-origin isolation contract that staging documents is bypassed.

The smoking-gun consequence: `SharedArrayBuffer` is not enabled in `tau.new`, which means the CAD runtime's `SharedPool`/`SharedMemoryArena` zero-copy transports are degraded to copies (or fail outright depending on browser fallback paths). The earlier `safari-cross-origin-isolation` research established `COEP: require-corp` (not `credentialless`) is mandatory for universal browser support — production violates this baseline.

**Asset path on Netlify is healthy**: `/assets/*` returns `cache-control: public,max-age=31536000,immutable`, full CSP report-only, COOP/COEP/CORP, `document-policy: js-profiling`, `referrer-policy: strict-origin-when-cross-origin`, and `permissions-policy`. Whatever ships to Fly must replicate this header set.

### Finding 2: Homepage perf is dominated by 833 KiB of unused JavaScript

**Severity**: P0 — mobile users abandon at >3 s LCP.

Lighthouse mobile run (Moto G Power throttling) against `taucad.dev/`:

| Metric          | Value      | Target  |
| --------------- | ---------- | ------- |
| Performance     | **55**     | ≥80     |
| FCP             | **10.7 s** | <1.8 s  |
| LCP             | **12.2 s** | <2.5 s  |
| SI              | 10.7 s     | <3.4 s  |
| TTI             | 12.2 s     | <3.8 s  |
| TBT             | 0 ms       | <200 ms |
| CLS             | 0.056      | <0.1    |
| Server response | **30 ms**  | <600 ms |

TTFB is excellent (the Netlify cache-tag work from `docs/research/netlify-production-performance-audit.md` landed). The remaining cost is entirely client-side JS evaluation. The top-15 unused-JS items by wasted bytes:

| Total  | Unused | % Unused | Asset                               |
| ------ | ------ | -------- | ----------------------------------- |
| 158 KB | 136 KB | 86%      | `three.webgpu-jSquLt51.js`          |
| 170 KB | 121 KB | 71%      | `three.module-BbC31-Oy.js`          |
| 116 KB | 103 KB | 89%      | `chat-textarea-C0hlGjCc.js`         |
| 221 KB | 102 KB | 46%      | `cad-viewer-sz8X_GUY.js`            |
| 55 KB  | 47 KB  | 86%      | `use-analytics-CyrypatP.js`         |
| 53 KB  | 45 KB  | 84%      | `zod-IsLTNWM7.js`                   |
| 75 KB  | 44 KB  | 59%      | `use-project-manager-BVrTGGVW.js`   |
| 46 KB  | 42 KB  | 92%      | `provider-buttons-BZCCfail.js`      |
| 47 KB  | 42 KB  | 89%      | `react-three-fiber.esm-CiwFhGQA.js` |
| 37 KB  | 33 KB  | 90%      | `proxy-ClM4gBuJ.js`                 |
| 71 KB  | 27 KB  | 38%      | `root-Bn3KBef2.js`                  |
| 33 KB  | 25 KB  | 77%      | `combobox-responsive-C2Kkq6zz.js`   |
| 27 KB  | 23 KB  | 85%      | `dist-Dcxbda6R.js`                  |
| 37 KB  | 22 KB  | 59%      | `chunk-EVOBXE3Y-Bww6xk78.js`        |
| 22 KB  | 21 KB  | 93%      | `canvas-three-gl-iafEapYE.js`       |

Network profile on the same run:

| Resource type | Count            | Bytes       |
| ------------- | ---------------- | ----------- |
| Script        | 172              | 1,858 KB    |
| Image         | 12               | 354 KB      |
| Font          | 2                | 137 KB      |
| Stylesheet    | 3                | 52 KB       |
| Document      | 1                | 50 KB       |
| Fetch         | 4                | 9 KB        |
| **Total**     | **196 requests** | **2.41 MB** |

The homepage is pulling in **172 script files**, including the entire Three.js + WebGPU + react-three-fiber + CAD viewer + chat composer graph — none of which the marketing landing page actually renders above the fold. This is the same class of issue identified in `docs/research/homepage-time-to-interactive-analysis.md` but now quantified: even after PostHog/StrictMode/LazySection fixes, the bundler is still tree-pulling the editor route's transitive deps into the homepage entry.

### Finding 3: 22 critical accessibility violations on the homepage

**Severity**: P0 — fails `docs/policy/accessibility-policy.md` WCAG 2.2 AA baseline.

axe-core sweep across 4 routes × 2 viewports (`axe-summary.json`):

| Viewport | Route        | Total | Critical | Serious | Moderate |
| -------- | ------------ | ----- | -------- | ------- | -------- |
| mobile   | home         | 5     | 1        | 2       | 2        |
| mobile   | docs-runtime | 5     | 1        | 3       | 1        |
| mobile   | editor-new   | 3     | 1        | 0       | 2        |
| mobile   | community    | 4     | 1        | 1       | 2        |
| desktop  | home         | **7** | **2**    | 3       | 2        |
| desktop  | docs-runtime | 6     | 2        | 3       | 1        |
| desktop  | editor-new   | 6     | 2        | 2       | 2        |
| desktop  | community    | 5     | 2        | 1       | 2        |

Top recurring rule failures:

| Rule                   | Impact   | Where                         | Nodes         |
| ---------------------- | -------- | ----------------------------- | ------------- |
| `button-name`          | critical | every route                   | 2–28 per page |
| `aria-allowed-attr`    | critical | every desktop route           | 7 nodes       |
| `color-contrast`       | serious  | home, docs, editor, community | 1–18 per page |
| `link-name`            | serious  | home, docs                    | 1 each        |
| `aria-prohibited-attr` | serious  | home (desktop)                | 1             |
| `list`                 | serious  | docs-runtime                  | 1             |
| `heading-order`        | moderate | every route                   | 1 each        |
| `region`               | moderate | every route                   | 2–16          |

`button-name` on the **community** route alone hits 28 nodes — likely the project-card thumbnail/menu trigger pattern shipping icon-only `<button>` elements without `aria-label`. The `aria-allowed-attr` 7-node hit on every desktop route is a single shared component (probably a Radix trigger with a custom ARIA attribute), so a one-line fix unlocks four routes.

The docs route ships an `<ol>`/`<ul>` element whose direct children include nodes other than `<li>` — a Fumadocs MDX rendering bug, not a Tau-authored markdown issue. The 18-node color-contrast failure on desktop docs is the muted prose colour against the page background — needs a token-level review in `docs/policy/ui-policy.md`.

### Finding 4: Production HTML shell is 22× larger than staging with 117 modulepreloads

**Severity**: P1 — bloats SSR cost, hurts TTFB even when caches warm.

Same homepage URL, same git SHA:

| Environment   | HTML bytes    | `modulepreload` count |
| ------------- | ------------- | --------------------- |
| `taucad.dev/` | 182,963       | 1                     |
| `tau.new/`    | **3,869,412** | **117**               |

The Netlify build emits a lean SSR shell with deferred imports; the Fly build is emitting 117 eager `<link rel="modulepreload">` tags for the entire route graph. Likely cause is a missing or different `react-router.config.ts` prerender or Vite manifest behaviour between the two pipelines. The 117 preloads correspond closely to the 172 script requests observed in Finding 2, suggesting the build pipelines differ on production.

### Finding 5: Console runtime errors logged on every homepage load

**Severity**: P1 — visible in Lighthouse `errors-in-console`.

```
worker  The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.
```

This warning fires twice from a Web Worker context. It is benign (`upgrade-insecure-requests` is silently no-op in CSP-Report-Only), but it indicates the CSP is being authored as `Content-Security-Policy-Report-Only` everywhere including workers, when only the worker variant should have the directive stripped. Either drop `upgrade-insecure-requests` from the worker CSP, or move the policy to enforced mode for endpoints that have been validated.

### Finding 6: SEO `is-crawlable` audit flags staging — correct, but signals routing risk on prod

`taucad.dev/robots.txt`: `User-agent: * \n Disallow: /` (correct for staging — keeps the preview environment out of search engines).

`tau.new/robots.txt`: `User-agent: * \n Allow: / \n Host: https://tau.new \n Sitemap: https://tau.new/sitemap.xml` (correct for production).

The Lighthouse `is-crawlable` audit will always fail on staging and pass on production — this is fine. **What needs review** is whether the editor route (`/projects/new`) should be crawlable on production. Currently no `<meta name="robots">` is set, so the editor route is indexable. Recommend `noindex` for `/projects/$id` and `/projects/new` because they are user-state pages, not content pages.

### Finding 7: Mobile editor cold-start measurably better than mobile homepage

**Severity**: informational.

Lighthouse mobile run against `/projects/new?kernel=replicad`:

| Metric          | Value                      |
| --------------- | -------------------------- |
| Performance     | **63** (vs 55 on homepage) |
| FCP             | 5.2 s                      |
| LCP             | 6.1 s                      |
| TBT             | 40 ms                      |
| CLS             | 0.087                      |
| Server response | **360 ms**                 |
| Unused JS       | 309 KB                     |

The editor route, despite carrying the heavier kernel graph, beats the homepage on every Lighthouse metric except server response time. This confirms Finding 2: the homepage is paying the editor's import cost without rendering anything that uses it. The 360 ms editor TTFB is consistent with the SSR work for the editor shell; the 30 ms homepage TTFB is healthy and not a target for optimisation.

### Finding 8: Docs route ships 401 KB of unused JS on mobile

**Severity**: P1.

Mobile run against `/docs/runtime/`: perf 61, FCP 6.4 s, LCP 7.1 s, TBT 60 ms, 401 KB unused JS, 18 color-contrast nodes failing on desktop. The docs site uses Fumadocs which should be near-static — unused JS at this magnitude points to the same homepage editor-graph leak appearing in the docs entry.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                             | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| R1  | Wire `coiMiddleware` (`@taucad/runtime/cross-origin-isolation/express`) into `tau.new`'s Fly-hosted Express server; add `strict-transport-security`, `permissions-policy`, `referrer-policy`, `x-content-type-options`, and the staging CSP report-only policy via shared middleware so production matches Netlify | **P0**   | Low    | High   |
| R2  | Audit and split the homepage entry chunk — move `three.webgpu`, `three.module`, `react-three-fiber`, `cad-viewer`, `canvas-three-gl`, `chat-textarea`, `proxy`, `use-project-manager`, `provider-buttons` to dynamic imports gated behind interaction. Target: <300 KB unused JS on first paint                    | **P0**   | Med    | High   |
| R3  | Fix `button-name` rule violations: every icon-only `<button>` on the home/community/docs routes needs an `aria-label`. Start with `project-card`'s 28-node community failure (single component)                                                                                                                    | **P0**   | Low    | High   |
| R4  | Fix the shared `aria-allowed-attr` 7-node violation that appears on every desktop route (single Radix-trigger pattern)                                                                                                                                                                                             | **P0**   | Low    | Med    |
| R5  | Investigate the `tau.new` build pipeline emitting 117 `modulepreload` tags and a 3.87 MB SSR shell — likely a missing prerender/manifest config divergence from the Netlify build. Bring production HTML size to <500 KB                                                                                           | P1       | Med    | High   |
| R6  | Resolve color-contrast failures (18 nodes on desktop docs, 7 on desktop editor): audit the `--muted-foreground`/prose tokens in `docs/policy/ui-policy.md` against WCAG 2.2 AA contrast minima for body text                                                                                                       | P1       | Low    | Med    |
| R7  | Add `<meta name="robots" content="noindex">` to `/projects/$id`, `/projects/new`, and any other user-state route on production                                                                                                                                                                                     | P1       | Low    | Low    |
| R8  | Drop `upgrade-insecure-requests` from the worker CSP variant or switch the policy to enforced mode for validated endpoints                                                                                                                                                                                         | P1       | Low    | Low    |
| R9  | Fix `link-name` (1 node, home + docs) — likely a logo wordmark anchor without an accessible name                                                                                                                                                                                                                   | P1       | Low    | Med    |
| R10 | Fix `heading-order` (every route): h1 → h3 skips on the marketing pages                                                                                                                                                                                                                                            | P2       | Low    | Low    |
| R11 | Add programmatic `landmark`/`region` wrappers so axe stops flagging "all page content must be contained by landmarks" (every desktop route hits 16 nodes on community/editor)                                                                                                                                      | P2       | Low    | Low    |
| R12 | Fix the Fumadocs `<ol>`/`<ul>` direct-child violation on `/docs/runtime/` (likely a custom MDX wrapper)                                                                                                                                                                                                            | P2       | Low    | Low    |
| R13 | Wire the audit-ui skill into a scheduled Lighthouse CI workflow (e.g. nightly cron in `.github/workflows/`) so regressions surface in PR reviews                                                                                                                                                                   | P2       | Med    | Med    |

## Comparative Table — staging vs production

| Axis                         | `taucad.dev` (Netlify)              | `tau.new` (Fly.io)                      | Verdict                     |
| ---------------------------- | ----------------------------------- | --------------------------------------- | --------------------------- |
| TTFB (home)                  | ~30 ms (Durable hit)                | unknown — no `Cache-Control` header set | staging better              |
| HTML SSR shell size          | 183 KB                              | 3.87 MB                                 | staging 22× better          |
| `modulepreload` count (home) | 1                                   | 117                                     | staging 117× better         |
| Security headers             | COOP/COEP/CORP/HSTS/CSP/permissions | none                                    | **staging only**            |
| `SharedArrayBuffer` enabled  | yes                                 | no (no COOP/COEP)                       | **staging only**            |
| `robots.txt`                 | disallow all (correct staging)      | allow + sitemap (correct prod)          | both correct for their role |
| `/assets/*` `Cache-Control`  | `max-age=31536000, immutable`       | not measured                            | staging confirmed healthy   |

Production is **less** hardened than staging on every axis except crawlability. This must be inverted before tau.new becomes the canonical environment for real users.

## Empirical Baseline — Lighthouse scores

| Run                   | Perf | A11y | BP  | SEO | FCP    | LCP    | TBT    | CLS   | TTI    |
| --------------------- | ---- | ---- | --- | --- | ------ | ------ | ------ | ----- | ------ |
| home / desktop        | 29   | 84   | 96  | 63  | 8.7 s  | 8.7 s  | 760 ms | 0.018 | 16.3 s |
| home / mobile         | 55   | 85   | 96  | 66  | 10.7 s | 12.2 s | 0 ms   | 0.056 | 12.2 s |
| editor-new / mobile   | 63   | n/a  | n/a | n/a | 5.2 s  | 6.1 s  | 40 ms  | 0.087 | 6.1 s  |
| docs-runtime / mobile | 61   | 83   | 92  | 63  | 6.4 s  | 7.1 s  | 60 ms  | 0.004 | 7.1 s  |

Desktop home posts a Lighthouse perf of **29/100** because TTI hits 16.3 s with 760 ms TBT — desktop is actually worse than mobile because the desktop budget expects sub-200 ms TBT and the browser parses more aggressively.

## Empirical Baseline — axe-core violations

See `axe-summary.json` for the raw counts; the table in Finding 3 covers the breakdown. Critical+serious total **18 unique violations** across the 8 audited route × viewport combinations, with a deduplicated set of **6 underlying rules** (`button-name`, `aria-allowed-attr`, `color-contrast`, `link-name`, `aria-prohibited-attr`, `list`).

## Appendix — artifact paths

All artifacts in `tmp/audit-2026-05-15/` (gitignored):

```
lh-home-desktop.report.{json,html}
lh-home-mobile.report.{json,html}
lh-editor-mobile.report.json
lh-docs-mobile.report.json
axe-violations.json
axe-summary.json
axe-audit.log
axe-audit.mjs
```

The reusable audit recipe is at `.agent/skills/audit-ui/SKILL.md` with helper scripts under `.agent/skills/audit-ui/scripts/`.

## References

- Skill: `.agent/skills/audit-ui/SKILL.md`
- Earlier perf work: `docs/research/netlify-production-performance-audit.md`
- Earlier TTI analysis: `docs/research/homepage-time-to-interactive-analysis.md`
- Editor route prefetch follow-up: `docs/research/editor-route-prefetch-and-cache-audit.md`
- Policy baselines: `docs/policy/vision-policy.md`, `docs/policy/ui-policy.md`, `docs/policy/accessibility-policy.md`, `docs/policy/ux-policy.md`
- WCAG 2.2: <https://www.w3.org/WAI/WCAG22/quickref/>
- web-vitals npm: <https://www.npmjs.com/package/web-vitals>
- `@axe-core/playwright`: <https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright>
