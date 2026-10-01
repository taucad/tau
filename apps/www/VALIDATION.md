# Marketing preview validation

Verified locally on 2026-10-01 against source baseline `faecc9ac8f456b7fa5639fc0eb146012e3e499c8`. Nothing has been deployed or merged.

| Check                   | Result                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static build            | 12 complete pages; dependency-free Node build passes                                                                                                     |
| Behavioral tests        | 6 tests pass: metadata, preview exclusions, analytics allowlisting, unsafe config rejection, editorial publication gates                                 |
| Browser checks          | 48 route/viewport audits pass: 12 routes at desktop, 390px, 320px and dark desktop                                                                       |
| Accessibility           | No axe WCAG A/AA violations in those audits; automated checks do not prove complete WCAG conformance                                                     |
| Interaction             | Native mobile menu and Escape, no-JS navigation, assembly views, real 404, no horizontal overflow                                                        |
| Privacy                 | Consent before transport, query/token exclusion, no referrer, pageview dedup, withdrawal, configured-endpoint GPC suppression                            |
| Formatting              | Scoped oxfmt check passes                                                                                                                                |
| Workspace lockfile      | pnpm lockfile-only verification passes; only the empty `apps/www` importer was added                                                                     |
| Nx/full repository lint | Not run successfully: workspace Nx/development dependencies are not installed in this source-only checkout; native equivalent build/test commands passed |

## Lighthouse

Lighthouse 13.5.0, headless system Chromium, local HTTP server with emitted security headers and gzip text compression. Mobile uses Lighthouse's default simulated mobile profile; desktop uses `--preset=desktop`. Runs were sequential, with no simultaneous browser audit. These are single representative lab runs, not field Core Web Vitals, INP evidence or a ranking guarantee.

| Profile | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT  | CLS |
| ------- | ----------: | ------------: | -------------: | --: | ----- | ----- | ---- | --- |
| Mobile  |          99 |           100 |            100 |  66 | 1.4 s | 2.2 s | 0 ms | 0   |
| Desktop |         100 |           100 |            100 |  66 | 0.3 s | 0.5 s | 0 ms | 0   |

The failed SEO check is deliberate preview `noindex`. All other scored applicable SEO audits pass. Canonical/social URLs and a populated sitemap are emitted only with a verified deployment origin and, for the sitemap, explicit launch mode. The current default does not invent a production origin.

An earlier Lighthouse 12 run could not parse the repository's OKLCH tokens in two accessibility rules; Lighthouse 13.5.0 resolves that tool limitation. An observed mobile header shift was corrected with native disclosure navigation; CLS fell from 0.103 to zero. Responsive images cut unnecessary image transfer.

## Hero comparison

The earlier actual `planetary.glb` is 2,806,748 bytes. The new default exploded illustration is 28,456 bytes, with a 13,282-byte 640px alternative. The assembled view is 27,824 bytes, loaded only when requested. This compares asset transfer sizes, not the complete performance of the old application. The new illustration derives from the newer authored 34-part model and has no visitor-side CAD kernel, WebGL renderer, animation loop or background compute. It is saved geometry, not a live simulation or a fresh GeoSpec result. See `asset-provenance.json` and the reproducible offline asset scripts.

## Remaining external gates

- Parent requested a hold on pushes/PRs after another PR triggered automatic Fly provisioning. This branch has not been pushed and has no PR. No workflow was changed here.
- No Netlify credential or authenticated CLI setup is available in this environment. No anonymous deploy, new paid service, site mutation or production deploy was attempted.
- Netlify-hosted performance, headers, path behavior and final canonical origin need verification after an authorized draft deploy.
- Marketing analytics is disabled until an approved first-party collector and provider configuration exist. Connector access is not app credentials. Authenticated signup/activation events must be implemented at their actual completion boundaries by the app/metrics owner.
- Desktop installers remain unlisted until artifacts are verified.
- Human articles and supplied blog-image ideas are pending.
- DNS and production root integration remain deferred. The routing/DNS follow-up is recorded in README and handed to the parent for the canonical release queue; no DNS mutation occurred.
