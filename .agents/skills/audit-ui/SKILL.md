---
name: audit-ui
description: Programmatic and empirical UI audit of a deployed Tau environment (taucad.dev staging or tau.new production) covering Core Web Vitals, accessibility (WCAG 2.2 AA), security headers, SEO crawlability, bundle/network profile, and console errors. Use when the user asks for a UI audit, performance audit, accessibility audit, Lighthouse audit, axe-core audit, taucad.dev / tau.new audit, or wants to systematically validate a deployed environment against the vision/UI/accessibility/UX policies.
disable-model-invocation: true
---

# Audit UI

End-to-end audit recipe for a deployed Tau environment. Produces machine-readable artifacts (Lighthouse JSON, axe-core JSON, header captures, bundle inventory) and a written research doc in `docs/research/`.

## Reference

- Vision constraints: `docs/policy/vision-policy.md`, `docs/policy/ui-policy.md`, `docs/policy/accessibility-policy.md`, `docs/policy/ux-policy.md`
- Companion research template: `docs/research/taucad-dev-ui-audit-may-2026.md` (most recent run — use as the format reference)

## Scope and Targets

Audit four route classes on **both** staging (`taucad.dev`) and production (`tau.new`) when possible:

| Route class         | Staging URL                                       | Production URL                                 |
| ------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Marketing home      | `https://taucad.dev/`                             | `https://tau.new/`                             |
| Docs (Fumadocs)     | `https://taucad.dev/docs/runtime/`                | `https://tau.new/docs/runtime/`                |
| Editor (cold start) | `https://taucad.dev/projects/new?kernel=replicad` | `https://tau.new/projects/new?kernel=replicad` |
| Community / index   | `https://taucad.dev/projects/community`           | `https://tau.new/projects/community`           |

Run every audit on **mobile** (`form-factor=mobile`, Moto G Power throttling) **and desktop** so policy gaps surface on both.

## Tooling (pinned, May 2026)

Install at workspace root (NEVER per-app) since these are dev-only utilities run from an audit working directory:

```bash
pnpm add -w -D \
  lighthouse \
  @axe-core/playwright \
  @playwright/test \
  web-vitals \
  source-map-explorer \
  unlighthouse
```

| Tool                   | Purpose                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `lighthouse`           | Core Web Vitals + a11y + best-practices + SEO scores per route                               |
| `@axe-core/playwright` | WCAG 2.2 AA rule engine (axe-core 4.10+) with full per-rule node lists                       |
| `@playwright/test`     | Headless Chromium driver for axe runs, screenshot capture, viewport switching                |
| `web-vitals`           | In-page CrUX-compatible field metrics (INP, LCP, CLS) captured via `Browser` MCP             |
| `source-map-explorer`  | Treemap of asset bundles when source maps are reachable                                      |
| `unlighthouse`         | Site-wide Lighthouse sweep with `--site` (use for follow-up batch runs, not per-route depth) |

Avoid: `pa11y-ci` (stale axe-core 3.x, no WCAG 2.2), `webhint` (CLI archived), bare `puppeteer` (use `@playwright/test`).

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Header + cache + security capture (curl)
- [ ] Step 2: Lighthouse runs across routes × viewports
- [ ] Step 3: axe-core sweep across routes × viewports
- [ ] Step 4: Browser MCP capture (web-vitals, console errors, screenshots)
- [ ] Step 5: Network & bundle inventory (modulepreload count, asset list)
- [ ] Step 6: Synthesise findings into docs/research/<slug>.md
- [ ] Step 7: pnpm docs:validate
```

### Step 1: Header + cache + security capture

Create `tmp/audit-<YYYY-MM-DD>/headers.txt` and capture every target URL plus one asset response per host. Compare staging vs production line-by-line.

```bash
mkdir -p tmp/audit-$(date +%F)
cd tmp/audit-$(date +%F)

for url in \
  https://taucad.dev/ \
  https://taucad.dev/docs/runtime/ \
  https://taucad.dev/projects/new \
  https://tau.new/ \
  https://tau.new/docs/runtime/ \
  https://tau.new/projects/new; do
  echo "=== $url ==="
  curl -sI "$url" | head -40
  echo
done | tee headers.txt
```

Verify each environment sets:

| Header                                              | Required for                      | Acceptable values                                    |
| --------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `cross-origin-opener-policy`                        | `SharedArrayBuffer` (Tau runtime) | `same-origin`                                        |
| `cross-origin-embedder-policy`                      | Same                              | `require-corp`                                       |
| `cross-origin-resource-policy`                      | Cross-origin asset isolation      | `same-origin` or `cross-origin`                      |
| `strict-transport-security`                         | TLS pinning                       | `max-age=31536000` minimum                           |
| `cache-control`                                     | CDN + browser caching             | `public,max-age=N,immutable` for hashed assets       |
| `content-security-policy[-report-only]`             | XSS hardening                     | At minimum `default-src 'self'` + `wasm-unsafe-eval` |
| `permissions-policy`                                | Lock down sensors                 | `accelerometer=(), camera=(), …`                     |
| `x-content-type-objects` / `x-content-type-options` | MIME sniffing                     | `nosniff`                                            |

If production lacks any of these but staging has them, that is a P0 architectural regression — note hosting provider explicitly (Netlify vs Fly vs Vercel).

### Step 2: Lighthouse runs

Run each route × viewport. Save both JSON and HTML so the research doc can link the HTML and parse the JSON.

```bash
# desktop
npx lighthouse https://taucad.dev/ \
  --quiet --chrome-flags="--headless=new" \
  --preset=desktop \
  --output=json,html \
  --output-path=lh-home-desktop \
  --max-wait-for-load=90000

# mobile (default form factor)
npx lighthouse https://taucad.dev/ \
  --quiet --chrome-flags="--headless=new" \
  --output=json,html \
  --output-path=lh-home-mobile \
  --max-wait-for-load=90000
```

Lighthouse will emit `lh-<route>-<viewport>.report.json` and `.report.html`. Extract the headline scores with the parser script below.

#### `scripts/lh-summary.mjs` — extract scores

Run after Lighthouse completes:

```bash
node ../../.agent/skills/audit-ui/scripts/lh-summary.mjs lh-*.report.json
```

Outputs a markdown-ready table of `perf | a11y | bp | seo | FCP | LCP | TBT | CLS | TTI` per report.

### Step 3: axe-core sweep

Drive axe through Playwright across routes × viewports with WCAG 2.2 AA + best-practice tags. Use `scripts/axe-audit.mjs` (template provided in this skill).

```bash
node ../../.agent/skills/audit-ui/scripts/axe-audit.mjs
```

The script emits `axe-violations.json` (full node list per rule, per URL, per viewport) and `axe-summary.json` (counts). Cite **all critical** + **serious** rule IDs in the research doc; mention moderate but do not list every node.

### Step 4: Browser MCP capture

Use the `cursor-ide-browser` MCP server for what curl + Lighthouse can't see: live console errors at first paint, viewport-specific layout regressions, and `web-vitals` field metrics from a real page session.

For each target route × viewport:

1. `browser_navigate` to the URL.
2. `browser_lock { action: "lock" }`.
3. `browser_resize` to mobile (`375 × 667`) or desktop (`1440 × 900`).
4. `browser_console_messages` immediately after first idle.
5. `browser_take_screenshot` (full page).
6. Inject the `web-vitals` capture snippet via `browser_evaluate`:

```javascript
import('https://unpkg.com/web-vitals@4?module').then(({ onINP, onLCP, onCLS, onFCP, onTTFB }) => {
  globalThis.__vitals = {};
  onINP((v) => {
    globalThis.__vitals.INP = v.value;
  });
  onLCP((v) => {
    globalThis.__vitals.LCP = v.value;
  });
  onCLS((v) => {
    globalThis.__vitals.CLS = v.value;
  });
  onFCP((v) => {
    globalThis.__vitals.FCP = v.value;
  });
  onTTFB((v) => {
    globalThis.__vitals.TTFB = v.value;
  });
});
```

7. Interact with the page to surface INP (click primary CTA, type into a field), then `browser_evaluate { script: "globalThis.__vitals" }` and capture the result.
8. `browser_network_requests` to confirm asset inventory matches Lighthouse.
9. `browser_lock { action: "unlock" }` before moving to the next route.

### Step 5: Network & bundle inventory

Quickly diagnose modulepreload bloat and total HTML size from the SSR shell:

```bash
for url in https://taucad.dev/ https://tau.new/; do
  echo "=== $url ==="
  echo "  HTML bytes: $(curl -s "$url" | wc -c | tr -d ' ')"
  echo "  modulepreloads: $(curl -s "$url" | grep -oE '<link rel="modulepreload"' | wc -l | tr -d ' ')"
done
```

If `modulepreload` count exceeds **~30**, the route is preloading too eagerly. Cross-reference Lighthouse `unused-javascript` to identify which preloaded chunks have <30% utilisation on first paint.

If source maps are reachable (asset URL + `.map`), generate a treemap:

```bash
curl -O https://<host>/assets/<largest-chunk>.js
curl -O https://<host>/assets/<largest-chunk>.js.map
npx source-map-explorer <largest-chunk>.js --html bundle-treemap.html
```

### Step 6: Synthesise findings

Author the research doc using the `create-research` skill. Required sections:

| Section                  | Content                                                      |
| ------------------------ | ------------------------------------------------------------ |
| Executive Summary        | Top 3-5 findings in 4 sentences                              |
| Empirical Baseline       | Markdown tables from `lh-summary.mjs` and `axe-summary.json` |
| Header & Security Diff   | Staging vs production header table                           |
| Performance Findings     | Per-route narrative with Lighthouse numbers                  |
| Accessibility Findings   | Per-route axe rule table (critical/serious only)             |
| Bundle & Network         | modulepreload count, top-5 unused JS items, asset count      |
| Console & Runtime Errors | Browser MCP console capture                                  |
| Recommendations          | Numbered `R1..Rn` table with Priority/Effort/Impact          |
| Appendix                 | Raw artifact paths (relative to `tmp/audit-<date>/`)         |

Cross-reference policies in `related:`:

```yaml
related:
  - docs/policy/vision-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/ux-policy.md
```

### Step 7: Validate

```bash
pnpm docs:validate
```

Frontmatter dates must be **single-quoted** strings. The H1 must match the `title` frontmatter byte-for-byte.

## Acceptance Thresholds

Use these as P0/P1 cut-offs when recommending priorities. Anything failing P0 must be fixed before claiming the audit passes.

| Metric                       | P0 (block) | P1 (improve) |
| ---------------------------- | ---------- | ------------ |
| Mobile LCP                   | > 4.0 s    | > 2.5 s      |
| Mobile TBT                   | > 600 ms   | > 200 ms     |
| Mobile CLS                   | > 0.25     | > 0.1        |
| Mobile INP (field)           | > 500 ms   | > 200 ms     |
| Lighthouse perf (mobile)     | < 50       | < 80         |
| Lighthouse a11y              | < 90       | < 100        |
| axe critical violations      | ≥ 1        | —            |
| axe serious violations       | ≥ 5        | ≥ 1          |
| Missing COOP/COEP in prod    | true       | —            |
| `modulepreload` count (home) | > 100      | > 30         |

## Output Layout

```
tmp/audit-<YYYY-MM-DD>/
├── headers.txt
├── lh-<route>-<viewport>.report.json
├── lh-<route>-<viewport>.report.html
├── axe-violations.json
├── axe-summary.json
├── browser-mcp/
│   ├── home-mobile.console.json
│   ├── home-mobile.vitals.json
│   ├── home-mobile.screenshot.png
│   └── ...
└── bundle/
    └── bundle-treemap.html (optional)
```

The companion research doc lives at `docs/research/<environment>-ui-audit-<YYYY-MM>.md` (e.g. `taucad-dev-ui-audit-may-2026.md`).

## Utility Scripts

The skill ships two ready-to-run helpers in `scripts/`:

- `lh-summary.mjs` — parses one or more Lighthouse JSON files and emits a markdown table.
- `axe-audit.mjs` — drives Playwright + `@axe-core/playwright` across the four target routes × two viewports with WCAG 2.2 AA + best-practice tags.

Execute both from inside `tmp/audit-<date>/` so artifacts colocate.

## Anti-Patterns

- **Auditing only the homepage**: marketing routes hide the editor's true bundle cost — always include `/projects/new` in the sweep.
- **Running Lighthouse without `--max-wait-for-load`**: heavy CAD bootstraps exceed the 45 s default; bump to 90 s.
- **Trusting curl-only HEAD on `tau.new`**: production may set headers only on GET — sanity-check with `curl -sv -X GET URL -o /dev/null` and inspect the `<` lines.
- **Reporting axe `incomplete` results as failures**: only `violations` count; `incomplete` requires human review and goes in the appendix.
- **Hard-coding viewport sizes that differ from policy**: mobile = `375 × 667`, desktop = `1440 × 900` (matches `docs/policy/ui-policy.md` breakpoints).
- **Skipping production**: a staging-only audit cannot catch hosting-provider regressions (e.g. Netlify→Fly missing COOP/COEP headers).
