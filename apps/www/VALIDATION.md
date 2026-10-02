# Marketing refresh validation

Verified locally on 2026-10-02. Implementation branch: `feature/marketing-www-design-verify-print`, based on `e30f87db36375786eb5404c739ec592c7e04bcc7` (see Git for the exact base). No push, deploy, app-root swap or DNS change was performed by this implementation.

| Check             | Result                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build  | 13 complete static pages; esbuild splits the optional Three.js scene from the 14,063-byte initial client                                                                                  |
| Behavioral tests  | 8 pass, including editorial/privacy gates, mesh/source provenance, 34-part integrity and fixed-ring gear equations                                                                        |
| Browser routes    | 52 route/viewport audits pass: all 13 routes at desktop, 390px, 320px and dark desktop                                                                                                    |
| Accessibility     | Zero axe WCAG A/AA violations in the 52 route audits and 16 live chapter views; automated checks do not establish complete WCAG conformance                                               |
| Story behavior    | Eight live chapters on desktop/mobile; no initial hero request for Three/model; zero idle/offscreen frames; pause/resume; reduced-motion no-load/disposal; download/context-loss fallback |
| Hidden-state gate | Synthetic hidden-state event suppresses frames; this is explicit gate coverage, not a physical background-tab measurement                                                                 |
| Privacy           | Analytics disabled in production output; consent-before-transport, query/token exclusion, referrer omission, deduplication, withdrawal and GPC checks pass                                |
| Routing           | Real 404, native menu/Escape, no-JavaScript navigation, no overflow at 320/390/1440 pixels, preview noindex metadata/headers                                                              |
| Lockfile          | `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts --filter @taucad/www` passes; only the www importer changes                                                    |
| Formatting        | Root oxfmt 0.36.0 passes for JS/JSON/Markdown; CSS/HTML processing is blocked by the absent fumadocs-ui CSS dependency; Git whitespace checks pass                                        |
| Workspace checks  | Native build/test equivalents ran. Scoped root-config oxlint and ESLint ran with isolated pinned tools; oxlint fails with 687 errors. Full Nx graph checks remain unrun                   |

## Local performance

Lighthouse 13.5.0, system Chromium, local HTTP with emitted security headers and gzip text compression. Mobile uses the default simulated profile; desktop uses `--preset=desktop`. Sequential runs with no concurrent browser audits. These are lab measurements of initial navigation, not field Core Web Vitals, interaction latency or an old-app comparison.

| Profile | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT  | CLS |
| ------- | ----------: | ------------: | -------------: | --: | ----- | ----- | ---- | --- |
| Mobile  |          99 |           100 |            100 |  66 | 1.4 s | 2.1 s | 0 ms | 0   |
| Desktop |         100 |           100 |            100 |  66 | 0.3 s | 0.4 s | 0 ms | 0   |

The only failed scored SEO audit is deliberate preview noindex. Lighthouse's applicable SEO denominator differs when an explicit preview canonical is configured; neither result is a launch SEO score.

The earlier `abbd84f2d` desktop transfer capture totals **216,042 bytes** at the hero, including both fonts and the browser-prefetched static fallback. Its initial client was **1,919 bytes gzip**. The final follow-up bundle is **5,631 bytes gzip**, a **3,712-byte increase** after adopting the canonical UUID helper and namespaced assets. Final lazy Three.js/story code is **136,645 bytes gzip**; metadata remains **1,290 bytes** and explicitly compressed geometry remains **876,329 bytes**, totaling **1,014,264 bytes** of optional lazy resources. Bundle sizes use Node gzipSync default level 6, matching the local server; see `lint/bundle-size.json`. The earlier aggregate network capture is preserved and is not presented as a fresh total. The model's decoded buffer is 3,389,664 bytes. No CAD kernel or compiler ships. The numbers exclude the HTML document and request headers; resource-level evidence is in `transfer.json`. Hosted compression/cache behavior still needs verification.

## Fidelity and visual review

- Original Tau chrome shape, TSL material and studio captured offline, level 6 at 2× resolution, then downsampled. Responsive hero: 37,170 / 19,768 bytes. The static capture has no idle GPU loop. Historical marketing hero identity remains unconfirmed: source history shows point-cloud/AuthSplashback/DesignStory, so this work does not claim the loader was a previous marketing hero.
- Replicad source SHA-256 is recorded in `asset-provenance.json` and `planetary.json`. The source and billing catalog are unchanged through `df1966a64f28dac856d514cb4030ef26a707151a`.
- Thirty-four named parts, three planets, one sun, top socket screws, 24/24/72 teeth. Fixed ring; carrier = sun/4; absolute planet = −sun/2. Retained bushings follow the planets, remaining hardware follows the carrier. Numerical tests check the Willis and relative gear-mesh equations through four input turns.
- All eight stages have captured desktop/mobile evidence. Mobile stage height and reading anchor keep the corresponding prose visible; printing fits the conceptual printer frame. The light studio plate remains legible in dark-mode static fallback. The static source model and live scene use the same authored geometry; point formation, printer and device frames are illustrations.
- No fresh GeoSpec result, physics simulation, print job, manufacturing approval, customer endorsement or human-written article is invented. Future catalog features retain Coming soon labels.
- Full Three.js MIT, Nano ID MIT (retained through the shared ID module) and Geist SIL OFL notices ship with the public assets.

The original GLB at `274513bab210aeb221be59a928a9fb63b742a423` has SHA-256 `68a30867ca9c12e9d6a8f4fe481d86bbd8e212fc01dd6ea1bcb1f8d57ef806da`: 2,806,748 raw bytes, 431,399 gzip bytes, 14 meshes and 33,290 triangles. The newer authored assembly has 34 parts and 97,336 triangles, with 876,329 compressed geometry bytes. This is a richer and larger model, not a measured renderer speedup. The initial-cost improvement is the static hero and deferred optional scene. See `original-asset-comparison.json`.

## Scoped lint and integration follow-up

The follow-up reserves `/_www/assets/*` for all marketing assets in output, templates, CSS, fetches and cache headers; no existing UI routes or source-provenance paths changed. The tests assert there is no output `/assets` directory. Build, eight tests, 52 route/privacy/accessibility audits and all 16 live chapter views pass after the migration. The privacy fixture removes `crypto.randomUUID` and confirms a valid UUIDv4 event through the shared helper, with navigation and consent behavior intact. The preview server now logs its configured port.

Oxlint 1.80.0 with oxlint-tsgolint 0.16.0, the unchanged root rules and Tau plugin scanned 19 source/script/test files. It reports **687 errors**, so repository lint does not pass. The final count supersedes the interim 682-findings snapshot; added namespace/UUID assertions and the preserved boolean lane condition account for the difference. Most remaining findings are unsafe operations in untyped JavaScript (505 unsafe call/assignment/argument/return findings), standalone relative import restrictions (22), CommonJS require restrictions (26), and serialized browser/script loops (71). The corrected gear-lane boolean condition remains flagged by prefer-nullish-coalescing; applying that suggestion changes behavior and was deliberately rejected. Full rule/file counts are in `lint/summary.json`. Fixes were bounded to safe syntax, event handling, canonical ID generation and accurate JavaScript project membership; no root config or suppression was added.

ESLint 9.32.0 processed all 13 `.mjs` files with zero findings. Its root configuration ignores the six `.cjs` helpers, which oxlint covers. **Nx module-boundary enforcement was skipped because no cached project graph exists.** This is partial coverage, not a full Nx lint pass or TypeScript compile check. `checkJs` remains false. Root formatter checks pass for JavaScript, JSON and Markdown; CSS/HTML formatting cannot resolve `fumadocs-ui/css/preset.css` imported by the shared Tailwind stylesheet in this source-only checkout. The native build and tests run on Node 24.19.0; a separate Node 22 execution was not available.

The temporary root dependency symlink was removed, and the standalone build/tests passed using only `WWW_RENDER_TOOLS` and its documented local workspace links. Frozen offline lock validation passes with only the www importer updated.

## Evidence and reproduction

Reports: `out/research/marketing-www/oct2026-refresh/`.

- `browser/browser-check.json`: 52 route audits, menu/view/privacy behavior; full desktop/mobile/narrow/dark captures.
- `story/results.json` and `story/{1440,390}-chapter-{0..7}.png`: live scene gates and visual sequence.
- `lighthouse-followup-{mobile,desktop}.report.{json,html}`: latest measured lab configuration and audits; prior reports retained.
- `transfer.json`: earlier encoded initial/lazy resources.
- `lint/oxlint-final.json`, `lint/eslint-final.json`, `lint/eslint-graph-warnings.log`, `lint/summary.json`, `lint/tool-versions.json`: full scoped lint evidence and limitations.
- `lint/browser/browser-check.json`, `lint/story/results.json`, `lint/tests-final.tap`, `lint/bundle-size.json`: final follow-up checks and bundle sizes.

Commands, exact dependencies, asset generation, editorial gates and first-party event contract are in `README.md`. Checks use isolated `/tmp` tooling; reproducible reports are kept under `out/`.

## Remaining external gates

No hosted URL is available in this implementation environment. Authorized Netlify/Tau Cloud account setup, hosted headers/routes/compression, final canonical origin and preview deployment remain with the parent infrastructure task. No new account or anonymous upload was attempted. DNS, production root routing/cache isolation and app marketing removal stay deferred until integration is ready. Analytics remains off; human articles, verified installers and any exact reference for a different historical metallic hero are still pending inputs.
