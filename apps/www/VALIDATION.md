# Marketing preview validation

## Cloud QA and provenance follow-up — 2026-10-02

This selective follow-up starts from published `66b1ccda00c97e84aa8fa2fc6148296e2dceaecd`. It declares the existing QA tools, identifies marketing entry points for Knip, and corrects provenance recipe paths plus the formatted metadata's size/hash. No public asset, runtime source, test, rendering recipe or deployment configuration changed.

Executed in a fresh cloud worktree with Node 24.19.0, pnpm 11.7.0, Playwright 1.62.1 from the existing catalog resolution, `@axe-core/playwright` 4.13.0, Sharp 0.34.5 and system Chromium 151.0.7922.173. Build, tests and browser checks used the declared dependencies without `WWW_RENDER_TOOLS`.

| Check                | Follow-up result                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean scoped install | Removed the worktree's generated install directories; `--filter @taucad/www... --frozen-lockfile --ignore-scripts` passed and preserved the lockfile bytes                                                |
| Build and behavior   | 13 pages, noindex and analytics off; all 9 tests passed; all 42 output files byte-identical to the build at `66b1ccda`                                                                                    |
| Browser routes       | 52 route/viewport/theme audits plus interaction and privacy checks passed; zero reported axe violations                                                                                                   |
| Live scene           | 16 chapter views plus motion gates, pause/resume, reduced motion, visibility/exit gates, download and context-loss fallback passed                                                                        |
| Provenance           | All 11 recorded size/hash pairs match; all 4 recipe paths and 3 hero-source paths exist; `planetary.json` is 10,086 bytes with SHA-256 `718ce4658f341546f4afbe28a1c163b80d06475e74a04087e821a2e9f961d3bc` |
| Sharp                | All 7 recorded images decoded; native PNG encoding passed with install scripts disabled                                                                                                                   |
| Knip                 | Scoped `apps/www` analysis reports zero issues; the root Knip configuration also passes standalone TypeScript checking                                                                                    |
| Workspace metadata   | Canonical tag validation passed on 91 tracked project configurations; canonical license validation passed for all 90 workspace packages                                                                   |

Full Nx build/test execution remains blocked by unrelated app/docs configuration imports in the scoped installation; the checked-in Node build/test commands passed. Root-config Oxlint reports the same five pre-existing comment-capitalization findings in `knip.config.ts` before and after this change, with no new findings. ESLint cannot parse that root file through its existing project-service configuration because it is outside the configured TypeScript projects. No lint rule or project-service setting was changed.

Evidence for this follow-up is under `out/research/marketing-www/oct2026-qa-provenance/`, including install/build/test logs, browser and scene reports, `provenance.json`, `sharp.json`, `build-parity.json`, and the scoped Knip output. Lighthouse and offline CAD/hero capture reproduction were not rerun; the original measurements below are retained as historical implementation evidence. Hosted verification still requires the separately authorized Netlify site. No merge, deployment, grant, credential, Terraform, DNS or Fly change was made for this follow-up.

## Original implementation record — historical

Verified locally on 2026-10-02 on `feature/marketing-www-design-verify-print`, preserving the earlier marketing checkpoints and verified GeoSpec base `faecc9ac8f456b7fa5639fc0eb146012e3e499c8`. The tested source is published as draft PR #287 into GeoSpec. No external artifact upload, hosted deployment, production routing change or DNS mutation has occurred in this implementation lane.

| Check                 | Result                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static build          | 13 pages; preview noindex in HTML and HTTP; analytics disabled                                                                                                                         |
| Behavioral tests      | 9 pass: privacy/editorial gates, actual article detail generation, namespaced assets, source provenance, 34-part mesh integrity, gear equations and malformed geometry rejection       |
| Browser routes        | 52 audits: all 13 routes at desktop, 390px, 320px and dark desktop                                                                                                                     |
| Accessibility         | Zero axe A/AA violations in all 52 route audits and 16 live chapter views; automated checks do not establish full WCAG conformance                                                     |
| Scene lifecycle       | Eight chapters on desktop/mobile; no initial model/Three request; zero idle/offscreen frames; pause/resume; reduced-motion no-load/disposal; download and native context-loss fallback |
| Exit/visibility gates | Synthetic hidden-state event suppresses frames; synthetic pagehide during download prevents renderer allocation. These are gate tests, not physical tab measurements                   |
| Privacy               | Consent-before-transport, query/token exclusion, no referrer, deduplication, withdrawal, GPC and UUID fallback checks pass; deployed output has tracking off                           |
| Navigation            | Native menu/Escape, no-JavaScript navigation, real 404, no overflow at 320/390/1440px; app routes and redirects remain unchanged                                                       |
| Oxlint                | 21 files, 480 configured rules, zero findings with unchanged root configuration                                                                                                        |
| ESLint                | All 21 JavaScript files, zero findings; Nx module-boundary rule skips because a full project graph is unavailable                                                                      |
| Asset reproduction    | Both metallic hero sizes and both assembly fallback captures reproduce byte-for-byte from the committed source                                                                         |

## Performance and transfer

Lighthouse 13.5.0 with system Chromium, local HTTP, emitted security headers and gzip text compression. Mobile uses the default simulated profile; desktop uses `--preset=desktop`. Runs were sequential without concurrent browser work.

| Profile | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT  | CLS |
| ------- | ----------: | ------------: | -------------: | --: | ----- | ----- | ---- | --- |
| Mobile  |          99 |           100 |            100 |  69 | 1.2 s | 2.1 s | 0 ms | 0   |
| Desktop |         100 |           100 |            100 |  69 | 0.3 s | 0.4 s | 0 ms | 0   |

The only failed scored SEO audit is deliberate preview noindex. These are initial-navigation lab measurements, not hosted/field Core Web Vitals, interaction latency, an old-app performance comparison or ranking guarantees.

The initial client is 14,869 bytes raw / 5,780 bytes gzip. Optional scene code is 136,469 bytes gzip; metadata is 1,290 bytes gzip; geometry is explicitly compressed to 876,329 bytes (3,389,664 decoded). Optional resources total 1,014,088 bytes. No CAD kernel or compiler ships. The current bundle size report uses gzip level 6. Earlier aggregate transfer captures remain historical; hosted compression/cache behavior needs a deployed check.

The original GLB at `274513bab210aeb221be59a928a9fb63b742a423` is 2,806,748 raw bytes / 431,399 gzip bytes with 14 meshes and 33,290 triangles. Its SHA-256 is `68a30867ca9c12e9d6a8f4fe481d86bbd8e212fc01dd6ea1bcb1f8d57ef806da`. The newer authored assembly has 34 parts and 97,336 triangles. It is richer and larger; no renderer speedup is claimed. The initial-cost reduction comes from the static hero and deferred scene.

## Fidelity and content

The hero uses Tau’s actual `metal-morph-shapes`, TSL material and studio environment, captured at level 6 and 2× resolution before downsampling. Both 37,170 / 19,768-byte WebPs reproduced with identical SHA-256 hashes after the script migration. The assembly and exploded images also reproduced exactly. Source, material, environment, Replicad model and billing catalog remain unchanged at upstream GeoSpec `c6b30bbbdba8237312609e9eeeb27a4f27ae3a04`.

The exact historical metallic landing hero remains unconfirmed: inspected history contains point-cloud/AuthSplashback/DesignStory variants, and current main uses product screenshots and a QR-code demo. This implementation claims verified Tau-source imagery, not an exact restoration of an unidentified prior hero.

The authored Replicad source SHA-256 is `464caa7c826d12ace762c36cef7e61d279203d446827387192e52181a76b9f64`. All 34 named parts, three planets, sun and top socket screws are retained. Teeth are 24/24/72; fixed-ring carrier rotation is sun/4 and absolute planet rotation is −sun/2. Retained bushings follow planets; remaining hardware follows the carrier. Tests verify Willis and relative meshing equations across four sun turns.

No fresh passing GeoSpec result, physical simulation, print job, manufacturing approval, customer endorsement, usage metric or human-authored essay is invented. Future catalog features retain Coming soon labels. Editorial drafts never ship. Full Three.js MIT, Nano ID MIT and Geist SIL OFL notices ship with the assets. No verified installer artifact was available, so downloads remain browser access only.

## Lint and environment limits

Oxlint 1.80.0 / oxlint-tsgolint 0.16.0 and ESLint 9.32.0 used the actual root configurations and Tau plugin. All 21 source/script/test files are in the narrow JavaScript project. CommonJS helpers were migrated to ESM, package import aliases replaced internal relative imports, and explicit types plus runtime guards cover JSON, DOM and geometry boundaries. Two bounded oxlint exceptions preserve sequential operations on a shared browser page and offline capture of three original app modules. No root lint rule was weakened.

The previously reported 687 Oxlint findings are resolved. Full Nx checks remain blocked. The initial isolated tooling lacked pnpm metadata and Nx plugins; after a real filtered pnpm workspace install, the graph still requires unrelated app/docs configuration dependencies (`@taucad/vite` and Fumadocs). Neither failure is presented as a passing graph check. ESLint therefore skips Nx module boundaries. This is a passing scoped lint check, not a complete Nx graph/typecheck pass; `checkJs` remains false. Diagnostic checkJs found no runtime source errors but cannot complete the broader dependency graph.

Root oxfmt 0.36.0 passes for JavaScript, JSON and Markdown. CSS/HTML formatting cannot resolve the shared stylesheet’s absent `fumadocs-ui/css/preset.css`; existing CSS is unchanged in this follow-up. Native build/tests run on Node 24.19.0, matching the new Netlify Node 24 setting. A real pnpm 11.7.0 filtered, frozen install with scripts disabled also passes the build and all nine tests without tooling overrides. The install still materializes shared workspace/root packages; it is not claimed to install only three packages. Frozen offline lock verification and standalone build/tests are recorded with the final checkpoint.

## Routing and deployment

All marketing assets use `/_www/assets/*`; the existing app’s `/assets/*` remains reserved. No app source, auth/session behavior, billing return path or existing redirect was changed. Same-domain extraction is a reviewed proposal, not enabled routing. Preserve `/?settings=*`, legacy settings redirects, project/share/preview deep links, auth/desktop/import callbacks, worker/WASM headers, and the existing `/vision` ownership decision before a root switch. No verified server-session routing contract exists in the current root loader; never substitute client hints for authentication.

The branch incorporates upstream `02afb028efa21eeff9553e0fbb96f723c5f322f3`, making Fly review provisioning manual and PR-close destruction only. This does not establish that external Netlify integrations are paused. Scoped source publication was authorized and completed; GitHub’s actual PR merge ref retains the manual-only review workflow. Netlify project creation waits for the requested action-time GitHub authorization. Revised Tau Cloud configuration adopts the new project’s build settings in the existing staging workspace, avoiding a new HCP credential configuration; no merge or apply has occurred. DNS remains explicitly deferred.

## Evidence

Latest reports: `out/research/marketing-www/oct2026-lint-complete/`.

- `browser/browser-check.json`, `browser/{desktop,mobile,narrow,dark}.png`: complete route, accessibility, interaction and privacy evidence.
- `story/results.json`, `story/{1440,390}-chapter-{0..7}.png`: live scene behavior and screenshots.
- `lighthouse-{mobile,desktop}.report.{json,html}`: sequential lab reports.
- `oxlint.json`, `eslint.json`, `eslint-warnings.log`, `tests.tap`, `tests-workspace.tap`: scoped checks and explicit graph limitation.
- `asset-verification.json`, `bundle-size.json`: exact source/capture comparisons and transfer sizes.

Earlier evidence and the routing/deployment review remain in `out/research/marketing-www/oct2026-refresh/`. Reproduction commands and tool versions are in `README.md`. Source review: https://github.com/taucad/tau/pull/287. No hosted URL is available yet; final headers, routes, compression and cache verification require the authorized Netlify draft deployment.
