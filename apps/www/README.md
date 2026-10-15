# Tau marketing website

React Router framework application with server rendering on Netlify. Individual route modules split page code automatically. Every route returns its content, metadata and HTTP status before JavaScript; hydration adds client navigation, intent prefetching and the optional CAD story. All application, renderer, test and tooling source is strict TypeScript.

## Develop and verify

From the workspace root:

```bash
pnpm nx dev www
pnpm nx typecheck www
pnpm nx lint www
pnpm nx test www --watch=false
WWW_LAUNCH=true WWW_ORIGIN=https://tau.new pnpm nx build www
WWW_LAUNCH=true WWW_ORIGIN=https://tau.new pnpm nx run www:verify-browser
```

The browser target starts its own production server, checks SSR/404/metadata, runs the responsive axe and live-scene suites, then mobile and desktop Lighthouse. Install its pinned browser with `pnpm exec playwright install chromium`. `CHROME_CHANNEL=chrome` selects installed Chrome for Playwright; `CHROME_PATH` selects an executable for both Playwright and Lighthouse. Reports are written under `out/reports/www/`. CI selects this target through Nx affected and makes it part of the required affected-task gate; accessibility, best practices and SEO must score 100, with a 95 median performance floor across three cold runs per device profile. Every raw run is retained. The optimization target remains 100.

`build/client` holds public assets; `build/server` and `.netlify/v1/functions` hold the SSR application and Netlify adapter. `/_www/bundles/` contains immutable content-hashed bundles, while `/_www/assets/` contains revalidating artwork and fonts. The CAD app retains `/assets/`. Netlify must deploy the server function as well as the client directory; uploading only static files produces missing routes.

Build settings are compiled into SSR: `WWW_ORIGIN` is a verified HTTPS origin; `WWW_LAUNCH=true` permits indexing and sitemap entries. Preview builds default to noindex in HTML and HTTP and an empty sitemap. The production Netlify context uses `https://tau.new`, where the UI edge proxy serves marketing. Preview noindex is not access control. Analytics remains disabled unless the approved first-party endpoint is configured.

The homepage uses shared Tau tokens, Button and Badge components. The full theme token layer supplies light/dark colors and focus treatment. Native disclosure navigation and FAQ remain usable without JavaScript. Generated wordmark geometry and offline CAD artwork retain their existing owners.

The server inlines the shared/site stylesheet to remove a render-blocking request. Hydration begins after the first paint, with pointer/keyboard intent able to start it immediately. The hero uses generated AVIF variants with WebP fallback and explicit dimensions. The full WebGL module and frozen meshes load only on the accessible **Explore in 3D** action, pointer intent or approaching the story, and are never part of the server bundle. Reduced motion and data-saving visitors retain the authored stills.

The committed Latin font subsets preserve the English marketing copy and common symbols; other glyphs fall back to system fonts. Reproduce them from the original committed fonts with `fonttools[woff]==4.60.1` (Brotli 1.2.0):

```bash
fonttools varLib.instancer apps/www/public/geist.woff2 wght=400:600 --no-recalc-timestamp -o out/research/www-react-router/geist-range.woff2
fonttools varLib.instancer apps/www/public/geist-mono.woff2 wght=400:500 --no-recalc-timestamp -o out/research/www-react-router/geist-mono-range.woff2
pyftsubset out/research/www-react-router/geist-range.woff2 --output-file=apps/www/public/geist-latin.woff2 --flavor=woff2 --unicodes='U+0000-00FF,U+03C4,U+2000-206F,U+2190-21FF' --layout-features='*' --no-hinting
pyftsubset out/research/www-react-router/geist-mono-range.woff2 --output-file=apps/www/public/geist-mono-latin.woff2 --flavor=woff2 --unicodes='U+0000-00FF,U+03C4,U+2000-206F,U+2190-21FF' --layout-features='*' --no-hinting
```

## Editorial workflow

`content/drafts/` contains outlines only and is never copied to the deployment. `content/articles.json` is empty until a human submits an article. Each published item requires `status: "published"`, `authorship: "human"`, `author`, `reviewedBy`, `date` (YYYY-MM-DD), `slug`, `title`, `description`, and a `paragraphs` array. The author and reviewer must genuinely write/review the text; these fields do not turn generated prose into human authorship. Review the change in a PR. Build validation rejects incomplete publication metadata, unsafe/duplicate slugs and future dates; article text is escaped. The blog index and `/blog/<slug>/` detail page are generated together. Image ideas are pending; no fabricated founder essay is published.

## Content evidence

Verified baseline: `faecc9ac8f456b7fa5639fc0eb146012e3e499c8` on remote `geospec`.

- Product: `apps/ui/app/routes/_index/`, `apps/libs/planetary-gearbox/` and `libs/tau-examples/src/kernels/replicad/planetary-gear-system/`. Distinguish current geometry checks from physical validation and future manufacturing workflows.
- Prices and customer terms: current `apps/libs/billing/src/tau-plan-catalog.ts`, cross-checked against founder-ratified private commercial authority. No supplier economics are included in public output.
- Routes: `/projects`, `/projects/new`, `/auth/sign-in`, `/auth/sign-up`, `/?settings=billing` (the billing settings that `/settings/billing` redirects to), verified in the app source; `/legal/*` is served by this site.
- Downloads: release assets could not be verified; no platform installer or download event is invented.
- Media: authored Tau example thumbnails and actual workspace screenshot. The live scene and stills derive from the committed 34-part Replicad model; motion does not imply a physical simulation. Verification shows one recorded GeoSpec run of the example spec, with inconclusive results labelled as such. Source license: Tau-authored Apache-2.0; preserve third-party terms.

## Legal documents

This site is the only owner of Tau's legal documents. `content/legal/*.md` holds the Terms, Privacy Policy, Storage and Cookie Policy, Acceptable Use Policy, Sub-processors and Open-Source Notices; `src/legal.ts` lists them and `app/legal.server.ts` renders them on the server at `/legal/<slug>/` with the heading anchors the app, desktop and emails link to (for example `/legal/privacy/#9.2.1-ai-service-improvement`). The Markdown processor never reaches the client bundle. `pnpm update-open-source-notices` regenerates `open-source.md` from the app and desktop dependency closure; the macOS package ships the same file.

## Privacy and measurement

The consent panel offers the analytics choice on any page while no decision is recorded (DNT/GPC suppress it); **Cookie preferences** in the footer and on `/legal/cookies/` reopen it, and `/privacy/` withdraws it. The decision is the shared `tau-cookie-consent` cookie owned by `@taucad/consent` (`apps/libs/consent`); the app on the same hostname reads it to gate PostHog and offers the same choice under **Help → Cookie preferences**. The former site-only `localStorage` record is migrated once.

Tracking is disabled by default. `WWW_ANALYTICS_ENDPOINT=/api/marketing-events` is the only accepted optional endpoint. Configure it only after an approved consent-aware first-party collector exists; the marketing deployment does not create that collector. No provider secret or PostHog SDK is bundled. The endpoint must discard transport IP/UA/referrer, validate this schema, rate-limit abuse and deduplicate `event_id` before forwarding to the authorized project. Do not enable it merely because the parent has connector access.

Marketing events: `marketing_page_view`, `marketing_cta_click`, `marketing_download_click` (only when real installers are added). Properties are known page, allowed placement, explicitly allowlisted campaign code, boolean returning visit and random event ID generated by the shared `@taucad/utils/id` helper, including its UUIDv4 fallback when browser `crypto.randomUUID` is unavailable. Never send full URLs, query values, referrers, DOM text, emails, project names, account IDs or bearer tokens. Consent is opt-in; DNT/GPC disable tracking; withdrawal clears local markers and aborts pending sends. No replay, autocapture or fingerprinting. Click dedup is per page/placement; provider must additionally deduplicate event IDs. Returning visit is a browser-local indication, not an identified user count.

`signup_completed`, `first_successful_geometry`, `first_export_completed`, `first_share_created` belong to verified app/server completion events. Do not emit them from CTA clicks. App owner must carry consent and add stable operation-scoped dedup without transmitting account PII. Parent observed no dedicated signup/download/activation events in recent PostHog schema; absence is not evidence of zero conversions. No metrics are displayed publicly.

## Same-domain integration

`apps/ui/netlify/edge-functions/marketing.ts` owns the explicit marketing document and React Router data paths. The app retains project/share/auth/settings routes, its assets, `/sitemap.xml` and crawler exclusions. Marketing assets use `/_www/`; its sitemap is exposed at `/sitemap-marketing.xml`. The production robots response appends that sitemap only when marketing is configured. `/vision` and `/legal` are marketing paths; the app has no marketing, legal or cookie-preference pages of its own.

The proxy preserves only the router's `_routes` query on data requests and does not forward cookies or authorization. Root responses remain private/no-store, and existing settings/callback and returning-app behavior stays in the app. Initial route discovery avoids a shared `/__manifest` endpoint collision. The proxy's regression tests define these boundaries.

## Netlify deployment

`netlify.toml` and the paired Tau Cloud change configure the existing dedicated marketing site: base `apps/www`, Nx `www:build`, publish `build/client` and functions `.netlify/v1/functions`. `.github/workflows/deploy-www-review.yml` uses the Netlify CLI to build and deploy the SSR function together with client assets. Node 24 matches the workspace requirement; pnpm comes from the root package manager declaration. Production context compiles launch metadata for `https://tau.new`; preview builds remain noindex.

The migration PR does not apply Terraform or change DNS. Coordinate the reviewed Tau Cloud settings plan and staging deployment with the handbook's DEL-24 hosted-qualification gate. Validate source HTML, deep links, assets, router data, canonical/noindex, 404 and app settings/callback isolation before promotion. Operational authority and rollback remain in `docs/handbooks/cloud/`.

## Reference guidance checked 2026-10-01

- Netlify draft deploys: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/
- Google noindex: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Web Vitals lab/field distinction: https://web.dev/articles/vitals

Lighthouse reports are lab measurements under their recorded configuration, not a field CWV or ranking guarantee.

## Live planetary story

The site leads with “Design. Verify. Make.” and one real model: the committed Replicad planetary gearbox (34 parts, 24-tooth sun, three 24-tooth planets, 72-tooth fixed ring, top socket screws, 4:1). The anchor is the uncommitted Vercel-style `/marketing` experiment from 2026-09-30: a bounded `max-w` frame with vertical side rules, section rules with registration crosses, mono kickers and big block type. Its liquid-metal cube, trig diagram and story player were not copied; the Tau metal star stays in the closing and vision bands.

- `src/scene.ts` owns the only WebGL context: stock `MeshStandardMaterial` lit by a high-key PMREM product studio built for the hero camera (soft dome, softboxes, a dim bounce card) under Khronos PBR Neutral tone mapping, a low key light whose shadow falls across the parts and the floor, ground-truth ambient occlusion (three's `GTAOPass`, composited, tone mapped and encoded in one pass, and printed onto the transparent floor as black coverage), a contact line that seats the gearbox on its drawing, a point-cloud twin per part for the agent beat and a line-art printer. It sizes the drawing buffer directly (DPR ≤ 1.75, about 3 MP); when back-to-back frames run slower than 25 fps it halves the occlusion samples and then renders directly with shadows only, which is also where a device without half-float render targets starts. It compiles with `compileAsync` and disposes everything on page exit, reduced motion or context loss.
- `src/hero-view.ts` holds the hero camera, including a small lens shift, and projects the drawing beneath the model with it: the floor dial that carries the input arc, the centre lines, and the rim dimension spanning the rim’s projected silhouette. The page, the poster and the social card therefore register with the render at every size.
- `src/live.ts` reparents that one canvas between the hero and the story, whichever is on screen. It draws only when the input angle, scroll position or size changes; idle, hidden, offscreen and still-frame states draw nothing. The hero range input is the non-drag path for the pointer drag (WCAG 2.5.7).
- `src/story-timeline.ts` maps continuous chapter progress to pure per-part state: three agent lanes, formation, an axial assembly in the order an engineer would build it (every part slides in along the gearbox axis from a non-overlapping exploded stack, so nothing passes through anything else), one input revolution, the face-width change, the ring sliced on a print plate, and the device view.
- `src/client.client.ts` keeps still frames in sync with the reading position whenever the live scene is not running. The hero upgrades on the explicit control or pointer intent; touch and narrow screens load on intent or as the story approaches. Reduced motion, Save-Data, no WebGL2 or no `DecompressionStream` never request the 3D bundle.

Kinematics follow the source constraints: fixed ring; sun θ; carrier θ/4; planet absolute rotation −θ/2. The model, kinematics, assembly order and recorded GeoSpec run come from `@taucad/planetary-gearbox` (`apps/libs/planetary-gearbox`), which the Tau app's vision page and design story share; the build copies its geometry assets to `/_www/assets/`. The parameter beat is real geometry: `planetary-face18.{json,bin.gz}` holds per-vertex z offsets from the authored `faceWidth` 14 → 18 export, applied as a relative morph target (axial envelope 68 → 72 mm). The verification beat renders the library's `assets/geospec-run.json`, a recorded run of the example spec (3 passed, 0 failed, 7 inconclusive, with unsupported-evidence codes shown as such). The agent lanes, prompt and device frames are labelled illustration. Printing previews a slice; it sends no job.

## Reproduce assets

Use an isolated tooling directory (outside the app dependency graph) with `type: module`, holding `three@0.184.0`, `replicad@npm:@taulabs/replicad@0.23.4-beta.2`, `replicad-opencascadejs@npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0`, `tsx`, `esbuild`, `playwright` and `sharp@0.34.5`.

1. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/export-story-assets.ts` exports the frozen 34-part model to `apps/libs/planetary-gearbox/assets/planetary.{json,bin.gz}`.
2. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/export-variant-assets.ts` re-executes the source, checks the committed base mesh matches, and writes the `faceWidth` 18 offsets.
3. `CHROME_CHANNEL=chrome node apps/www/scripts/capture-stills.ts` renders the hero poster and the nine story stills from the shipped `scene.ts` on a GPU-backed Chrome, so the fallbacks show exactly what the live renderer draws.
4. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/optimize-assets.ts` regenerates responsive sizes and the social card. `capture-metal-hero.ts` still reproduces the metal star.

The default build copies committed assets and derives smaller AVIF/WebP delivery images; it never runs CAD.

## Verify

Start `node apps/www/scripts/serve.ts`, then run `node apps/www/scripts/browser-check.ts` and `node apps/www/scripts/check-story.ts`. `CHROME_CHANNEL=chrome` uses installed Chrome; otherwise set `CHROME_PATH`. `PORT`, `WWW_TEST_URL` and `WWW_REPORT_DIR` select the port, origin and evidence folder.

`check-story.ts` covers hero keyboard and drag, all nine chapters at 1440 and 390 px with axe, the single-canvas invariant, zero idle/offscreen/hidden frames, the still-frames toggle, reduced-motion disposal and no-load, no-WebGL, download failure, context loss and a synthetic page exit during download. `browser-check.ts` covers all 20 routes, including every legal document, at four viewport/theme configurations, the mobile menu, no-JavaScript navigation, 404 and privacy. Results and conditions are in `VALIDATION.md`.

## Claims

Tau Cloud backup and sync are presented as available on Pro (10 GB) and Enterprise (100 GB) from `apps/libs/billing`; Free shows GitHub backup only, because free-tier sync is held off in production. Hosted verification and Enterprise signed evidence/CI keep their “Coming soon” labels. Tau Desktop is “in development” with no download link, because no installer is published. The blog stays empty until a human writes and reviews an article.

## Lint

Run `pnpm nx lint www` and `pnpm nx typecheck www`. Route type generation precedes both targets. Application, renderer, scripts and tests use strict TypeScript without JavaScript exclusions.
