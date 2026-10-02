# Marketing refresh validation

Verified locally on 2026-10-02. Implementation branch: `feature/marketing-www-design-verify-print`, based on `e30f87db36375786eb5404c739ec592c7e04bcc7` (see Git for the exact base). No push, deploy, app-root swap or DNS change was performed by this implementation.

| Check             | Result                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build  | 13 complete static pages; esbuild splits the optional Three.js scene from the 4.2 KB initial client                                                                                       |
| Behavioral tests  | 8 pass, including editorial/privacy gates, mesh/source provenance, 34-part integrity and fixed-ring gear equations                                                                        |
| Browser routes    | 52 route/viewport audits pass: all 13 routes at desktop, 390px, 320px and dark desktop                                                                                                    |
| Accessibility     | Zero axe WCAG A/AA violations in the 52 route audits and 16 live chapter views; automated checks do not establish complete WCAG conformance                                               |
| Story behavior    | Eight live chapters on desktop/mobile; no initial hero request for Three/model; zero idle/offscreen frames; pause/resume; reduced-motion no-load/disposal; download/context-loss fallback |
| Hidden-state gate | Synthetic hidden-state event suppresses frames; this is explicit gate coverage, not a physical background-tab measurement                                                                 |
| Privacy           | Analytics disabled in production output; consent-before-transport, query/token exclusion, referrer omission, deduplication, withdrawal and GPC checks pass                                |
| Routing           | Real 404, native menu/Escape, no-JavaScript navigation, no overflow at 320/390/1440 pixels, preview noindex metadata/headers                                                              |
| Lockfile          | `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts --filter @taucad/www` passes; only the www importer changes                                                    |
| Formatting        | Scoped oxfmt 0.36.0 and Git whitespace checks pass                                                                                                                                        |
| Workspace checks  | Native build/test equivalents ran. Full Nx and repository lint were not run because this checkout has no workspace dependency installation                                                |

## Local performance

Lighthouse 13.5.0, system Chromium, local HTTP with emitted security headers and gzip text compression. Mobile uses the default simulated profile; desktop uses `--preset=desktop`. Sequential runs with no concurrent browser audits. These are lab measurements of initial navigation, not field Core Web Vitals, interaction latency or an old-app comparison.

| Profile | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT  | CLS |
| ------- | ----------: | ------------: | -------------: | --: | ----- | ----- | ---- | --- |
| Mobile  |          99 |           100 |            100 |  66 | 1.2 s | 2.0 s | 0 ms | 0   |
| Desktop |         100 |           100 |            100 |  69 | 0.3 s | 0.4 s | 0 ms | 0   |

The only failed scored SEO audit is deliberate preview noindex. Lighthouse's applicable SEO denominator differs when an explicit preview canonical is configured; neither result is a launch SEO score.

Measured desktop encoded resource bodies at the hero total **216,042 bytes**, including both fonts and the browser-prefetched static fallback. The initial client is **1,919 bytes gzip**. Entering the story adds **136,631 bytes** of Three.js/story code, **1,290 bytes** of mesh metadata and **876,329 bytes** of explicitly compressed geometry: **1,014,250 bytes** of optional lazy resources. The model's decoded buffer is 3,389,664 bytes. No CAD kernel or compiler ships. The numbers exclude the HTML document and request headers; resource-level evidence is in `transfer.json`. Hosted compression/cache behavior still needs verification.

## Fidelity and visual review

- Original Tau chrome shape, TSL material and studio captured offline, level 6 at 2× resolution, then downsampled. Responsive hero: 37,170 / 19,768 bytes. The static capture has no idle GPU loop. Historical marketing hero identity remains unconfirmed: source history shows point-cloud/AuthSplashback/DesignStory, so this work does not claim the loader was a previous marketing hero.
- Replicad source SHA-256 is recorded in `asset-provenance.json` and `planetary.json`. The source and billing catalog are unchanged through `df1966a64f28dac856d514cb4030ef26a707151a`.
- Thirty-four named parts, three planets, one sun, top socket screws, 24/24/72 teeth. Fixed ring; carrier = sun/4; absolute planet = −sun/2. Retained bushings follow the planets, remaining hardware follows the carrier. Numerical tests check the Willis and relative gear-mesh equations through four input turns.
- All eight stages have captured desktop/mobile evidence. Mobile stage height and reading anchor keep the corresponding prose visible; printing fits the conceptual printer frame. The light studio plate remains legible in dark-mode static fallback. The static source model and live scene use the same authored geometry; point formation, printer and device frames are illustrations.
- No fresh GeoSpec result, physics simulation, print job, manufacturing approval, customer endorsement or human-written article is invented. Future catalog features retain Coming soon labels.
- Full Three.js MIT and Geist SIL OFL notices ship with the public assets.

## Evidence and reproduction

Reports: `out/research/marketing-www/oct2026-refresh/`.

- `browser/browser-check.json`: 52 route audits, menu/view/privacy behavior; full desktop/mobile/narrow/dark captures.
- `story/results.json` and `story/{1440,390}-chapter-{0..7}.png`: live scene gates and visual sequence.
- `lighthouse-{mobile,desktop}.report.{json,html}`: measured lab configuration and audits.
- `transfer.json`: encoded initial/lazy resources.

Commands, exact dependencies, asset generation, editorial gates and first-party event contract are in `README.md`. Checks use isolated `/tmp` tooling; reproducible reports are kept under `out/`.

## Remaining external gates

No hosted URL is available in this implementation environment. Authorized Netlify/Tau Cloud account setup, hosted headers/routes/compression, final canonical origin and preview deployment remain with the parent infrastructure task. No new account or anonymous upload was attempted. DNS, production root routing/cache isolation and app marketing removal stay deferred until integration is ready. Analytics remains off; human articles, verified installers and any exact reference for a different historical metallic hero are still pending inputs.
