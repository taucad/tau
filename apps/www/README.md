# Tau marketing preview

Standalone, static `apps/www`. Node 22+; no runtime package dependencies. Existing `apps/ui`, `apps/docs` and the earlier `/vision` implementation are untouched.

## Develop and verify

From the monorepo root: `pnpm nx build www`, `pnpm nx test www`, `pnpm nx dev www`.
In a source-only checkout without workspace dependencies, equivalent native commands are `node apps/www/scripts/build.mjs`, `node --test apps/www/tests/*.test.mjs`, and `node apps/www/scripts/serve.mjs`.

Build output is `apps/www/dist`. `WWW_ORIGIN` is an HTTPS origin; on Netlify a verified deploy URL is used when supplied by its build environment. Preview defaults to noindex in HTML and HTTP headers, with an empty sitemap. Do not enable `WWW_LAUNCH=true` until domain and release review. Do not disallow all crawling in robots.txt: crawlers need access to see noindex. Preview noindex is not access control.

## Editorial workflow

`content/drafts/` contains outlines only and is never copied to the deployment. `content/articles.json` is empty until a human submits an article. Each published item requires `status: "published"`, `authorship: "human"`, `author`, `reviewedBy`, `date` (YYYY-MM-DD), `slug`, `title`, `description`, and a `paragraphs` array. The author and reviewer must genuinely write/review the text; these fields do not turn generated prose into human authorship. Review the change in a PR. Build validation rejects incomplete publication metadata, unsafe/duplicate slugs and future dates; article text is escaped. The journal index and `/blog/<slug>/` detail page are generated together. Image ideas are pending; no fabricated founder essay is published.

## Content evidence

Verified baseline: `faecc9ac8f456b7fa5639fc0eb146012e3e499c8` on remote `geospec`.

- Product: `apps/ui/app/routes/_index/`, `apps/ui/app/routes/vision/vision-story.ts`, and `libs/tau-examples/src/kernels/replicad/planetary-gear-system/`. Distinguish current geometry checks from physical validation and future manufacturing workflows.
- Prices and customer terms: current `apps/libs/billing/src/tau-plan-catalog.ts`, cross-checked against founder-ratified private commercial authority. No supplier economics are included in public output.
- Routes: `/projects`, `/projects/new`, `/auth/sign-in`, `/auth/sign-up`, `/settings/billing` (existing settings redirect), `/legal/privacy`, `/legal/terms` verified in the app source.
- Downloads: release assets could not be verified; no platform installer or download event is invented.
- Media: authored Tau example thumbnails and actual workspace screenshot. Assembly views derive from the newer committed 34-part Replicad model; visual pose does not imply a physical simulation or fresh GeoSpec execution. Source license: Tau-authored Apache-2.0; preserve third-party terms.

## Privacy and measurement

Tracking is disabled by default. `WWW_ANALYTICS_ENDPOINT=/api/marketing-events` is the only accepted optional endpoint. Configure it only after an approved consent-aware first-party collector exists; the static preview does not create that collector. No provider secret or PostHog SDK is bundled. The endpoint must discard transport IP/UA/referrer, validate this schema, rate-limit abuse and deduplicate `event_id` before forwarding to the authorized project. Do not enable it merely because the parent has connector access.

Marketing events: `marketing_page_view`, `marketing_cta_click`, `marketing_download_click` (only when real installers are added). Properties are known page, allowed placement, explicitly allowlisted campaign code, boolean returning visit and random event ID. Never send full URLs, query values, referrers, DOM text, emails, project names, account IDs or bearer tokens. Consent is opt-in; DNT/GPC disable tracking; withdrawal clears local markers and aborts pending sends. No replay, autocapture or fingerprinting. Click dedup is per page/placement; provider must additionally deduplicate event IDs. Returning visit is a browser-local indication, not an identified user count.

`signup_completed`, `first_successful_geometry`, `first_export_completed`, `first_share_created` belong to verified app/server completion events. Do not emit them from CTA clicks. App owner must carry consent and add stable operation-scoped dedup without transmitting account PII. Parent observed no dedicated signup/download/activation events in recent PostHog schema; absence is not evidence of zero conversions. No metrics are displayed publicly.

## Same-domain integration proposal — not enabled

Marketing `/` and its explicit content paths remain public, static and cacheable. The app retains explicit `/projects`, `/projects/new`, `/w/*`, `/auth/*`, `/settings/*`, `/invitations/*`, existing share/preview routes, API paths and all asset/build paths. Inventory `apps/ui/app/routes.ts` and generated route manifest at integration time; this list is not an exhaustive rewrite configuration. Do not install a catch-all marketing rewrite or move deep links speculatively. Billing currently returns to `/?settings=billing`; preserve that verified settings behavior before switching the root. Existing `/?settings=*` compatibility is a launch blocker that requires the app owner’s routing decision.

If root personalization is later wanted, use the existing authenticated server/session mechanism after verifying cookie scope and API origin behavior. Treat anonymous/unknown state explicitly. Personalized redirects/responses must use `Cache-Control: private, no-store`; never cache them in the public marketing cache. Do not trust `tau-authed` hints, custom client headers or unverified cookies for authority. Redirect destinations must be fixed same-origin routes, never arbitrary query URLs. Serve the same content/routing policy to crawlers and people.

## Netlify and deferred DNS

`netlify.toml` is for a separate, authorized marketing preview site. It does not change the UI site, Terraform, app routing or DNS. Use a draft deploy, never `--prod`; retain existing Git-only production restrictions. Verify the existing authorized Netlify account/site before upload. No new paid account, credential or site permission is implied.

**Queued DNS task (deferred by user):** after preview acceptance, release owner inventories existing deep links/assets/auth callbacks/settings query routes, implements and tests path ownership and cache isolation, verifies rollback on staging, then requests the previously deferred production/domain action. Do not mutate DNS during this task.

## Reference guidance checked 2026-10-01

- Netlify draft deploys: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/
- Google noindex: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Web Vitals lab/field distinction: https://web.dev/articles/vitals

Lighthouse reports are lab measurements under their recorded configuration, not a field CWV or ranking guarantee.

## Reproduce assembly imagery

Use an isolated tooling directory (outside the app dependency graph) with `type: module` in its package.json. Install `three@0.184.0`, `replicad@npm:@taulabs/replicad@0.23.4-beta.2`, `replicad-opencascadejs@npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0`, `tsx@4.20.5`, `playwright@1.58.2`, and `sharp@0.34.5`. Run `WWW_RENDER_TOOLS=/path/to/tools CHROME_PATH=/path/to/chromium node apps/www/scripts/render-assets.cjs`. This executes the authored model offline, checks its 34-part count, tessellates with 0.15 mm tolerance / 0.25 rad angular tolerance, and captures two prescribed poses. No rendering dependency, GLB, model source, private research or compiler ships to a visitor. There is no animation loop to pause: view changes load on demand, motion is absent, reduced-motion is respected, and the initial image remains usable without JS.

After rendering, run `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/optimize-assets.cjs` to regenerate responsive sizes and the social card. The default build only copies these committed, reviewed assets; it never runs CAD generation.

Browser verification: with the preview server running, run `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/browser-check.cjs` (also install `@axe-core/playwright@4.13.0` in that isolated tooling directory). `WWW_TEST_URL` and `WWW_REPORT_DIR` override the local origin and evidence folder. Lighthouse used `13.5.0`; run its CLI with `--only-categories=performance,accessibility,best-practices,seo --output=json --output=html`, adding `--preset=desktop` for desktop. Run audits sequentially without concurrent browser work. Local `serve` reproduces emitted security headers and gzip text compression; final hosted checks remain required.
