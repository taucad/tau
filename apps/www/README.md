# Tau marketing preview

Standalone, static `apps/www`, with 13 complete pages and an optional Three.js scroll story. Node 24+; Three.js 0.184.0 and esbuild 0.28.2 resolve through the workspace catalog. Existing `apps/ui`, `apps/docs` and the earlier `/vision` implementation are untouched.

## Develop and verify

From the monorepo root: `pnpm nx build www`, `pnpm nx test www`, `pnpm nx dev www`.
For a scoped review installation, use the root-pinned pnpm with `pnpm install --filter @taucad/www... --frozen-lockfile --ignore-scripts`, then `node apps/www/scripts/build.mjs` and `node --test apps/www/tests/*.test.mjs`. Browser QA dependencies are declared by this app: Playwright uses the existing workspace catalog; axe-core uses the workspace catalog and Sharp is 0.34.5. A scoped install can build and test this app even when unrelated app/docs dependencies prevent the full Nx graph from loading.
In a source-only checkout, set `WWW_RENDER_TOOLS` to an isolated installation containing the exact catalog versions of Three.js and esbuild, plus `nanoid@5.1.14`. The event ID helper is the declared workspace dependency `@taucad/utils/id`; create links from that isolated installation’s `node_modules/@taucad/{utils,types}` to this checkout’s `libs/{utils,types}` so esbuild can resolve the helper and its source dependencies. These links are local tooling, not shipped artifacts. Equivalent commands are `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/build.mjs`, `WWW_RENDER_TOOLS=/path/to/tools node --test apps/www/tests/*.test.mjs`, and `node apps/www/scripts/serve.mjs`. Normal workspace builds resolve the app’s declared dependencies directly.

Build output is `apps/www/dist`. Every marketing stylesheet, script, image, font, geometry payload and license is served under `/_www/assets/`; the app’s existing `/assets/*` namespace remains reserved. This prepares path isolation only; it does not enable same-domain integration. `WWW_ORIGIN` is an HTTPS origin; on Netlify a verified deploy URL is used when supplied by its build environment. Preview defaults to noindex in HTML and HTTP headers, with an empty sitemap. Do not enable `WWW_LAUNCH=true` until domain and release review. Do not disallow all crawling in robots.txt: crawlers need access to see noindex. Preview noindex is not access control.

## Editorial workflow

`content/drafts/` contains outlines only and is never copied to the deployment. `content/articles.json` is empty until a human submits an article. Each published item requires `status: "published"`, `authorship: "human"`, `author`, `reviewedBy`, `date` (YYYY-MM-DD), `slug`, `title`, `description`, and a `paragraphs` array. The author and reviewer must genuinely write/review the text; these fields do not turn generated prose into human authorship. Review the change in a PR. Build validation rejects incomplete publication metadata, unsafe/duplicate slugs and future dates; article text is escaped. The journal index and `/blog/<slug>/` detail page are generated together. Image ideas are pending; no fabricated founder essay is published.

## Content evidence

Verified baseline: `faecc9ac8f456b7fa5639fc0eb146012e3e499c8` on remote `geospec`.

- Product: `apps/ui/app/routes/_index/`, `apps/ui/app/routes/vision/vision-story.ts`, and `libs/tau-examples/src/kernels/replicad/planetary-gear-system/`. Distinguish current geometry checks from physical validation and future manufacturing workflows.
- Prices and customer terms: current `apps/libs/billing/src/tau-plan-catalog.ts`, cross-checked against founder-ratified private commercial authority. No supplier economics are included in public output.
- Routes: `/projects`, `/projects/new`, `/auth/sign-in`, `/auth/sign-up`, `/?settings=billing` (the billing settings that `/settings/billing` redirects to), `/legal/privacy`, `/legal/terms` verified in the app source.
- Downloads: release assets could not be verified; no platform installer or download event is invented.
- Media: authored Tau example thumbnails and actual workspace screenshot. The live scene and stills derive from the committed 34-part Replicad model; motion does not imply a physical simulation. Verification shows one recorded GeoSpec run of the example spec, with inconclusive results labelled as such. Source license: Tau-authored Apache-2.0; preserve third-party terms.

## Privacy and measurement

Tracking is disabled by default. `WWW_ANALYTICS_ENDPOINT=/api/marketing-events` is the only accepted optional endpoint. Configure it only after an approved consent-aware first-party collector exists; the static preview does not create that collector. No provider secret or PostHog SDK is bundled. The endpoint must discard transport IP/UA/referrer, validate this schema, rate-limit abuse and deduplicate `event_id` before forwarding to the authorized project. Do not enable it merely because the parent has connector access.

Marketing events: `marketing_page_view`, `marketing_cta_click`, `marketing_download_click` (only when real installers are added). Properties are known page, allowed placement, explicitly allowlisted campaign code, boolean returning visit and random event ID generated by the shared `@taucad/utils/id` helper, including its UUIDv4 fallback when browser `crypto.randomUUID` is unavailable. Never send full URLs, query values, referrers, DOM text, emails, project names, account IDs or bearer tokens. Consent is opt-in; DNT/GPC disable tracking; withdrawal clears local markers and aborts pending sends. No replay, autocapture or fingerprinting. Click dedup is per page/placement; provider must additionally deduplicate event IDs. Returning visit is a browser-local indication, not an identified user count.

`signup_completed`, `first_successful_geometry`, `first_export_completed`, `first_share_created` belong to verified app/server completion events. Do not emit them from CTA clicks. App owner must carry consent and add stable operation-scoped dedup without transmitting account PII. Parent observed no dedicated signup/download/activation events in recent PostHog schema; absence is not evidence of zero conversions. No metrics are displayed publicly.

## Same-domain integration proposal — not enabled

Marketing `/` and its explicit content paths remain public, static and cacheable. The app retains explicit `/projects`, `/projects/new`, `/w/*`, `/auth/*`, `/settings/*`, `/invitations/*`, existing share/preview routes, API paths and all asset/build paths. Inventory `apps/ui/app/routes.ts` and generated route manifest at integration time; this list is not an exhaustive rewrite configuration. Do not install a catch-all marketing rewrite or move deep links speculatively. Billing currently returns to `/?settings=billing`; preserve that verified settings behavior before switching the root. Existing `/?settings=*` compatibility is a launch blocker that requires the app owner’s routing decision.

If root personalization is later wanted, use the existing authenticated server/session mechanism after verifying cookie scope and API origin behavior. Treat anonymous/unknown state explicitly. Personalized redirects/responses must use `Cache-Control: private, no-store`; never cache them in the public marketing cache. Do not trust `tau-authed` hints, custom client headers or unverified cookies for authority. Redirect destinations must be fixed same-origin routes, never arbitrary query URLs. Serve the same content/routing policy to crawlers and people.

## Netlify and deferred DNS

`netlify.toml` is for a separate authorized marketing review project. Direct Git builds use repository `taucad/tau`, branch `feature/marketing-www-design-verify-print`, repository root (`.`) as the base, `apps/www` as the UI package directory, `node apps/www/scripts/build.mjs` as the command and `apps/www/dist` as publish directory. The package directory selects this app’s Netlify configuration. Node 24 matches the root engine requirement; pnpm 11.7.0 comes from root `packageManager`. The install flags select this app and its workspace dependency closure with the frozen lock and scripts suppressed. No Nx Cloud token, API secret or app runtime credential is needed.

The operator must complete any explicitly approved Netlify/GitHub authorization before creating the project. Existing app connectivity does not prove the browser session already has that grant. Build settings are prepared for Terraform management in the existing `TauCAD/tau-cloud-staging` workspace, using its existing provider credential and a new, separately verified site UUID. PR previews and other branch deploys are disabled for the review project. It has no custom domain. Netlify calls its selected-branch deploy context "production"; this isolated review project does not replace any existing Tau app or production deployment. Preview noindex and analytics-off remain enabled.

No production app routing or DNS change is part of this setup. If CLI deployment is selected later, it requires an existing authorized session and an explicit review-site UUID; do not use another site or the earlier denied Library artifact.

**Queued DNS task (deferred by user):** after preview acceptance, release owner inventories existing deep links/assets/auth callbacks/settings query routes, implements and tests path ownership and cache isolation, verifies rollback on staging, then requests the previously deferred production/domain action. Do not mutate DNS during this task.

## Reference guidance checked 2026-10-01

- Netlify draft deploys: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/
- Google noindex: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Web Vitals lab/field distinction: https://web.dev/articles/vitals

Lighthouse reports are lab measurements under their recorded configuration, not a field CWV or ranking guarantee.

## Live planetary story

The site leads with “Design Verify Print.” and one real model: the committed Replicad planetary gearbox (34 parts, 24-tooth sun, three 24-tooth planets, 72-tooth fixed ring, top socket screws, 4:1). The anchor is the uncommitted Vercel-style `/marketing` experiment from 2026-09-30: a bounded `max-w` frame with vertical side rules, section rules with registration crosses, mono kickers and big block type. Its liquid-metal cube, trig diagram and story player were not copied; the Tau metal star stays in the closing and vision bands.

- `src/scene.mjs` owns the only WebGL context: stock `MeshStandardMaterial` lit by a high-key PMREM product studio built for the hero camera (soft dome, softboxes, a dim bounce card) under Khronos PBR Neutral tone mapping, a low key light whose shadow falls across the parts and the floor, ground-truth ambient occlusion (three's `GTAOPass`, composited, tone mapped and encoded in one pass, and printed onto the transparent floor as black coverage), a contact line that seats the gearbox on its drawing, a point-cloud twin per part for the agent beat and a line-art printer. It sizes the drawing buffer directly (DPR ≤ 1.75, about 3 MP); when back-to-back frames run slower than 25 fps it halves the occlusion samples and then renders directly with shadows only, which is also where a device without half-float render targets starts. It compiles with `compileAsync` and disposes everything on page exit, reduced motion or context loss.
- `src/hero-view.mjs` holds the hero camera, including a small lens shift, and projects the drawing beneath the model with it: the floor dial that carries the input arc, the centre lines, and the rim dimension spanning the rim’s projected silhouette. The page, the poster and the social card therefore register with the render at every size.
- `src/live.mjs` reparents that one canvas between the hero and the story, whichever is on screen. It draws only when the input angle, scroll position or size changes; idle, hidden, offscreen and still-frame states draw nothing. The hero range input is the non-drag path for the pointer drag (WCAG 2.5.7).
- `src/story-timeline.mjs` maps continuous chapter progress to pure per-part state: three agent lanes, formation, an axial assembly in the order an engineer would build it (every part slides in along the gearbox axis from a non-overlapping exploded stack, so nothing passes through anything else), one input revolution, the face-width change, the ring sliced on a print plate, and the device view.
- `src/client.mjs` keeps still frames in sync with the reading position whenever the live scene is not running. Desktop upgrades the hero after load and idle; touch and narrow screens load on intent or as the story approaches. Reduced motion, Save-Data, no WebGL2 or no `DecompressionStream` never request the 3D bundle.

Kinematics follow the source constraints: fixed ring; sun θ; carrier θ/4; planet absolute rotation −θ/2. The parameter beat is real geometry: `planetary-face18.{json,bin.gz}` holds per-vertex z offsets from the authored `faceWidth` 14 → 18 export, applied as a relative morph target (axial envelope 68 → 72 mm). The verification beat renders `content/evidence/planetary-geospec-run.json`, a recorded run of the example spec (3 passed, 0 failed, 7 inconclusive, with unsupported-evidence codes shown as such). The agent lanes, prompt and device frames are labelled illustration. Printing previews a slice; it sends no job.

## Reproduce assets

Use an isolated tooling directory (outside the app dependency graph) with `type: module`, holding `three@0.184.0`, `replicad@npm:@taulabs/replicad@0.23.4-beta.2`, `replicad-opencascadejs@npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0`, `tsx`, `esbuild`, `playwright` and `sharp@0.34.5`.

1. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/export-story-assets.mjs` exports the frozen 34-part model to `planetary.{json,bin.gz}`.
2. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/export-variant-assets.mjs` re-executes the source, checks the committed base mesh matches, and writes the `faceWidth` 18 offsets.
3. `CHROME_CHANNEL=chrome node apps/www/scripts/capture-stills.mjs` renders the hero poster and the nine story stills from the shipped `scene.mjs` on a GPU-backed Chrome, so the fallbacks show exactly what the live renderer draws.
4. `WWW_RENDER_TOOLS=/path/to/tools node apps/www/scripts/optimize-assets.mjs` regenerates responsive sizes and the social card. `capture-metal-hero.mjs` still reproduces the metal star.

The default build only copies committed, reviewed assets; it never runs CAD.

## Verify

Start `node apps/www/scripts/serve.mjs`, then run `node apps/www/scripts/browser-check.mjs` and `node apps/www/scripts/check-story.mjs`. `CHROME_CHANNEL=chrome` uses installed Chrome; otherwise set `CHROME_PATH`. `PORT`, `WWW_TEST_URL` and `WWW_REPORT_DIR` select the port, origin and evidence folder.

`check-story.mjs` covers hero keyboard and drag, all nine chapters at 1440 and 390 px with axe, the single-canvas invariant, zero idle/offscreen/hidden frames, the still-frames toggle, reduced-motion disposal and no-load, no-WebGL, download failure, context loss and a synthetic page exit during download. `browser-check.mjs` covers all 13 routes at four viewport/theme configurations, the mobile menu, no-JavaScript navigation, 404 and privacy. Results and conditions are in `VALIDATION.md`.

## Claims

Tau Cloud backup and sync are presented as available on Pro (10 GB) and Enterprise (100 GB) from `apps/libs/billing`; Free shows GitHub backup only, because free-tier sync is held off in production. Hosted verification and Enterprise signed evidence/CI keep their “Coming soon” labels. Tau Desktop is “in development” with no download link, because no installer is published. The journal stays empty until a human writes and reviews an article.

## Lint

Run oxlint (with `oxlint-tsgolint` on `PATH`) and ESLint against the `.mjs` files in `src`, `scripts` and `tests` plus `scripts/tooling.js`. `tsconfig.json` gives them project-service membership without enabling JavaScript compilation. The Nx module-boundary rule skips without a cached project graph, so a scoped pass is not a full Nx workspace pass.
