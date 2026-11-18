# Changelog

## 0.14.0 (2026-11-18)

### Features

- feat(ui): Load a stale build's next page as a document from client middleware (RR9) (#2612) (b1e48636b)
- feat(host): Choose every host's billing layer from the deployment answer (#2586) (945108c65)
- feat(ui): Offer Tau Desktop and rewrite the update notice in a shared sidebar notice stack (#2557) (f78bf9c5d)
- feat(cadmpeg): Open native CAD files from the import picker and /convert (#2608) (e881dc389)
- feat(cadmpeg): Add the cadmpeg plugin for native CAD import and export (#2588) (dd3b27f9d)
- feat(replicad): Use replicad-opencascadejs 0.23.0-beta.2 and stop superseded native booleans and meshing (N1) (#2598) (9fc2242e5)
- feat(ui): Move every React Router consumer to 8.5.1 (RR8) (#2595) (adbb7170d)
- feat(ui): Build ui and www with the Vite Environment API and Netlify adapter 4 (RR5) (#2589) (498ab141a)
- feat(filesystem): Open the model viewer at first view by holding reads of paths a tree write owes (SP5-model) (#2412) (33ea80864)
- feat(desktop): sign an external agent in from Tau's own Terminal (#2567) (865ea23e3)
- feat(replicad): Keep operation results live across builds in the kernel (#2522) (f7d9696b8)
- feat(ui): Route and request the root data as /\_.data (React Router 8 migration RR4) (#2479) (adfe7b026)
- feat(picovoxel): Adopt picovoxel 0.3.0 and its grid pager (#2570) (a1de39964)
- feat(sandbox): Add the Windows shell sandbox behind its flag (Q15, L5) (#2405) (cf22c13af)
- feat(agent-host): Choose the billing layer per run from the deployment answer (#2566) (7d6365770)
- feat(image): Render captures with nanoraster 0.10's smooth AO falloff and clear the t-slot-rail parity gap (#2559) (37254e54b)
- feat(ui): Keep the composer's draft and a queued Enter across the load, with a chat lane wait indicator (A15d) (#2555) (5b81931fb)
- feat(ui): Split route modules as React Router 8 does, with a manifest tripwire (RR6) (#2547) (3d714bd66)
- feat(host): Report machine admission and preparation from tau serve and desktop (T19) (#2546) (a79706036)
- feat(viewer): Resolve a render tier per canvas and type the e2e test bridges (#2512) (223592b46)
- feat(revisions): Report each turn admission's phases and the Git and bridge work it waited on (#2499) (cb0563c58)
- feat(host): Start external agents in auto mode and drop plan modes (#2451) (994257d1f)
- feat(api): Publish the deployment answer at GET /v1/deployment (#2501) (5d828ddaf)

### Fixes

- fix(root): Make Nx and package scripts start on Windows (#2600) (60fc2929c)
- fix(desktop): Harden the external-agent Terminal sign-in from review (#2590) (285b37a7a)
- fix(filesystem): Close a workspace service only once its index snapshot writes end (#2534) (71beba6e8)
- fix(viewer): Clip long fat lines, count draws as frames, and wait on the demand loop (#2487) (12fd59852)
- fix(picovoxel,telemetry): Count the PicoVoxel tape limit and retire the export-triangle limit ids (#2543) (5ba0b9f56)
- fix(runtime): Keep built geometry reusable across closes and slider frames (#2503) (7abb090f5)
- fix(agent-host): forward the launcher's monotonic clock to its hosts (#2552) (bd7e9a304)
- fix(host): Publish Tau system skills where Claude Code finds them (#2450) (9b5f0a4c3)
- fix(agent-host): Name the run in every model call's attempt id, funded or not (#2493) (d3e80afc4)
- fix(agent-host): Never reopen a chat writer after the host's close drops its logs (#2541) (8ec1e41f4)
- fix(host): Record the lost-session notice so a Claude chat can continue (#2538) (754e79951)
- fix(viewer): Replace GTAO's hard thickness slab with a smooth falloff (AO profile H2) (#2481) (630cf6239)
- fix(replicad): Memoize face centers and normals as tuples so a finder may delete the Vector it reads (#2535) (384e14440)
- fix(ui): Start the file service Home first with deadlines, classes and reports (#2422) (2059276e5)
- fix(filesystem): Retry a Windows atomic-write rename, re-admitting each attempt (#2521) (32b6af523)
- fix(filesystem): Keep the node channel when the host fails to describe its disk (#2495) (eaeb6d5c5)
- fix(filesystem): Admit a Windows watch once its native watcher is listening (#2477) (abce9b711)
- fix(occt-core): Stop a superseded run without source-mapping its abort (#2525) (6619a37e1)
- fix(ui): Clear the shell layout rows of the e2e nightly (#2291) (#2513) (fc143d511)
- fix(agent-host): Release chat writers when part of a launcher close fails (#2461) (76973369b)
- fix(ui): Say a deleted cloud copy is absent and a disconnected workspace needs reconnecting (#2456) (e19a4a71b)
- fix(ui): Delete a trashed project permanently and show only trashed projects in Trash (#2453) (4d992018f)
- fix(api): Accept an invitation with its token in the body, not the path (#2496) (776a277ab)
- fix(desktop): Main boot hardening and local diagnostics (WP5) (#2414) (cc757cd9c)
- fix(viewer): List a visible body whose strided samples are hidden (#2474) (1daf2250e)
- fix(ui): Keep the composer still when a converted image replaces its placeholder (#2473) (e091bebfb)
- fix(ui): Name a paused route in the page's words and open the phone chat in the edit-controls spec (#2447) (7d56eed6c)

### Performance

- perf(revisions): Land a cold open's entry before reading the whole tree (SP6-apply) (#2601) (5d5cf1eeb)
- perf(ui): Open the viewer on the loaded manifest and time first_view from the page (SP6-boot) (#2599) (f8a384b08)
- perf(revisions): Read a cold open's pack ahead in one wave (SP6-waves) (#2597) (89407ec1b)
- perf(formal): Deal agent-host's 75 mutants over three queue jobs by measured seconds (#2573) (46a458667)
- perf(formal): Run mutants side by side within the runner's cores (#2564) (d09ada380)
- perf(agent-host): Write the fresh-seed differential corpora in four parts at once (#2561) (33fed344a)
- perf(formal): Shard and cache agent-host's formal:nightly:check in the queue (#2560) (fff7f28b4)
- perf(replicad): Detect instances by partner without hashing BRep text, and fail loudly (#2506) (48badb12f)

### Other changes

- refactor(ui): Move the revision authorship resolver into revisions-ui (UI wave D) (#2614) (d965c3e30)
- refactor(ui): Cut the billing-ui library from the app (UI wave D) (#2593) (b312cc4a0)
- refactor(ui): Move GitHub gist management into publish-ui behind an injected services provider (UI wave D) (#2613) (dac1de5df)
- ci(root): Shard lint, typecheck, build, pkgcheck and revisions:test by seconds (#2581) (be5095325)
- refactor(ui): Move the project-manager machine into files-ui behind injected faults and object store (UI wave D) (#2607) (109ea6a84)
- refactor(ui): Move the revision graph logic into revisions-ui behind injected authorship and push records (UI wave D) (#2609) (6ca537f25)
- chore(viewer): Bump three-viewport-gizmo to 3.0.0-beta.3 (#2603) (9f43e8297)
- chore(picogk): Pin the PicoGK browser host to manifest 93d4634b0a1b (#2602) (81872974e)
- refactor(ui): Move the GitHub import machine into publish-ui behind an injected client (UI wave D) (#2596) (49ef5168c)
- refactor(ui): Move the revision hooks into revisions-ui behind injected services (UI wave D) (#2594) (efe8cb53a)
- refactor(ui): Move the project-library chat logs and workspace connection into files-ui (UI wave D) (#2592) (df0215a85)
- ci(scripts): Require an edge or input for every cross-root read (#2579) (aebf2d7cf)
- test(runtime-e2e): Add the compute reuse qualification matrix (#2504) (e076efc72)
- refactor(ui): Move project-library storage into files-ui behind injected seams (UI wave D) (#2587) (674f6460d)
- refactor(ui): Cut the revisions-ui library from the app (UI wave D) (#2392) (d4c5e4db4)
- ci(ui): Split ui:test into six shards dealt by measured seconds over six test lanes (#2582) (358fb9784)
- refactor(ui): Move the project-library runtime into files-ui (UI wave D) (#2500) (6f5268822)
- ci(scripts): Key taucad-ui and scripts tests on what they read (#2574) (b3b187ee5)
- ci(root): Move viewer parity from the merge queue to pull requests and the release gate (#2572) (904c1480e)
- test(viewer): Run the composition rows on a simulated hardware tier (#2490) (f0b5e41c8)
- chore(viewer): Bump three-viewport-gizmo to 3.0.0-beta.2 (#2558) (668de048c)
- refactor(telemetry): Share the per-origin answer cache (#2502) (9906bb84d)
- test(runtime): Add the T04, T07 and T23 observability acceptance tests (#2545) (b2fdaa9b4)
- refactor(ui): Move the publication viewer leaves and archive machines into publish-ui (UI wave D) (#2533) (99529595c)
- refactor(ui): Move the editor document session into editor-ui (UI wave D) (#2497) (f8ae0883e)
- chore(filesystem): Raise the size limit for the Windows readiness fixes (#2486) (85729a8d5)
- refactor(ui): Split the settings catalogue into settings-ui (UI wave D) (#2488) (9eecdf3cc)
- build(viewer): Use three-viewport-gizmo 3.0.0-beta.1 (#2484) (77458e6c1)
- test(filesystem): Prove a swapped listing never lands foreign bytes (#2009) (#2445) (6c8deb84e)
- refactor(ui): Cut the publish-ui library from the app (UI wave D) (#2395) (9f2edc0df)

## 0.13.0 (2026-11-17)

### Features

- feat(ui): Take dropped files on the whole chat pane and Home hero, and hold converting images with a skeleton (#2410) (53273d3a7)
- feat(brep): Expose OCCT meshing as the @taucad/brep/occt subpath (#2407) (94ad1905d)
- feat(ui): Scroll every page at the shell unless it is contained (#2396) (a7a63d66f)
- feat(ui): Serve Home at / from a prerendered static shell (PL4) (#2380) (d34d322dc)
- feat(filesystem): Settle each project root on its own with a status (WP1) (#2384) (cdc8f73c2)
- feat(types): Catalogue the native CAD formats cadmpeg reads (#2376) (42d170e28)
- feat(viewer): Adopt three-viewport-gizmo 3.0 beta with Turntable and Tumble orbit styles (#2372) (9fdbc9385)
- feat(ui): Hand a native input's text to the rich composer from first paint (PL6) (#2340) (f7a09cfb0)
- feat(heif): Add @taucad/heif so HEIC photos convert to JPEG in the composer, desktop and CLI (#2337) (b388a4315)
- feat(api-llm-gateway): Add Gemini 4 Hydrogen and retire Gemini 3 (#2329) (297731779)
- feat(ui): Commit a project click at once and draw its frame before the route (A15b2) (#2353) (0b396bc73)
- feat(ui): Draw the phone workspace frame from first paint (A15c) (#2348) (281087809)
- feat(ui): Name Sentry routes and tau.load route classes through public React Router APIs (RR7) (#2345) (1de0894e8)
- feat(ui): Convert composer images in a runtime worker and refuse by format (#2336) (66bd84d6e)
- feat(ui): Open each project into a persistent workspace frame drawn from the frame hint (A15b) (#2321) (22228f216)
- feat(ui): Serve every response through root middleware with a typed router context (RR3) (#2333) (a8b7cce6b)
- feat(ui): Serve project routes from a prerendered static shell (PL3) (#2338) (fa67df6f8)
- feat(host): Convert ACP agent images the chat cannot store as sent (#2335) (0b98b03c9)
- feat(ui): Replay editor text a reload left unsaved, and keep a refused close cut owed (A7e) (#2317) (35858af88)
- feat(agent-host): Decide what every host stores with one attachment storage policy (#2319) (52b874e3d)
- feat(ui): Move to React Router 7.18.5 and read router state through public hooks (RR1) (#2328) (8a66f784e)
- feat(ui): Read the page URL from loader arguments under raw requests (RR2) (#2331) (73ce2521a)
- feat(image)!: Add raster transcoder and rename transcoder ids to render, svg, raster (#2316) (ac237eec9)
- feat(ui): Keep the viewer stage mounted through the file check (A15e) (#2322) (219af4794)
- feat(ui): Apply per-visitor facts before paint from one client record (PL2) (#2314) (05036e264)

### Fixes

- fix(telemetry): Put desktop sync and the remaining producers under the one consent rule (#2430) (caff272e7)
- fix(agent-host): Write chat logs and attachments on Windows without a directory fsync (#2420) (4e83b1db7)
- fix(host): Initialize project identity on Windows without a directory fsync (#2415) (9d22a6585)
- fix(ui): Keep a generated project name within the manifest's limit (#2373) (50e502efc)
- fix(ui): Expire tau_skew on every static shell response (#2385) (5e9b567be)
- fix(ui): Read composer files typed application/octet-stream and offer image/heif (#2375) (a6e0c8566)
- fix(agent-tools): Report a refused main entry in model results (#2368) (8a9228f32)
- fix(ui): List a refused external agent again when the window is looked at (#2369) (8c653c8cc)
- fix(revisions): Flush a large-object fill by its own paths (SP4-fill) (#2357) (92041b491)
- fix(viewer): Report a browser without a WebGL 2 context instead of a null-context crash (#2356) (e80bb8435)
- fix(replicad): Use replicad-opencascadejs 0.23.0-beta.1 so delete() frees memory (#2360) (78ac66df9)
- fix(ui): Show arriving files in a tree listed before its apply (SP4-tree) (#2355) (2cc515c6d)
- fix(ui): Render the model once its own files are here, not every large object (#2263) (d08c7460e)
- fix(host): Present Claude's Tau MCP calls under their Tau tool names (#2341) (9532cf317)
- fix(revisions): Retry LFS downloads on the held action and verify a fill flush by its written paths (#2326) (44a6024cb)
- fix(ui): Keep an approval's opening in its stream and let a paused run be stopped (#2327) (6ef27a031)
- fix(ui): Keep worker bundles, WASM and client assets out of the server output (RR0) (#2323) (35368e79c)

### Performance

- perf(ui): Warm the workspace layout as a project open begins (SP5-warm) (#2388) (e13bd25b1)
- perf(revisions): Pipeline a cold open's blobs and read whole trees in parallel (SP5) (#2386) (c771da099)
- perf(ui): Cut the interactive tier to what the first action needs (PL5) (#2370) (816180a71)
- perf(ui): Open a file pane on its own landing during a cloud open (SP4-panes) (#2365) (6ddf74179)
- perf(ui): Open chats, Agents and a new chat before the whole download (SP2h) (#2354) (d1c44b336)
- perf(filesystem): Net the change-event flood of a replacement and scope overflow resets (SP2g) (#2352) (23d2ecd9d)
- perf(ui): Open the file tree and editor before the whole download (SP2f) (#2343) (9edf272da)
- perf(ui): Cut the AI SDK and Home's three.js from the runtime entry (PL1) (#2332) (1f2bce237)

### Other changes

- refactor(api): Remove the old kernel instruments and the runtime dual-write (#2427) (687c7ea0b)
- refactor(ui): Cut the settings-ui library from the app (UI wave D) (#2394) (904f506ec)
- test(api): Grade L2 entries from compact results and add a library-first task (#2371) (b0a671b44)
- refactor(ui): Move use-file-content and use-file-tree into files-ui behind a file-services context (UI wave D) (#2390) (efbf6eb59)
- refactor(ui): Cut the editor-ui library from the app (UI wave D) (#2378) (d76ca1862)
- refactor(ui): Resolve the build target by package condition and move the filesystem spine into files-ui (UI wave D) (#2318) (f3178bc7a)
- refactor(ui): Retire the layout-flags path now that no surface reads a layout flag (#2367) (e93a899d4)
- ci(ui): Run composer image Firefox and WebKit parity in the merge queue (#2349) (0529efd80)
- ci(ui): Run composer image host parity in Firefox and WebKit nightly (#2346) (ff02d7b8f)
- refactor(ui): Inject analytics into files-ui workspace telemetry (UI wave D) (#2313) (4f94f7cb5)

## 0.12.0 (2026-11-16)

### Features

- feat(ui): Restore generic loading skeletons and drop the project listing snapshot (#2307) (1c77d2d28)
- feat(ui): Take the close cut a reload left owed on the next open (A7d) (#2272) (5e6ffc1ea)
- feat(agent-observability): Label tool facts and report resumed runs (LW17, LU14) (#2205) (afdc792de)
- feat(ui): Let the open wait for the first file check (A14) (#2246) (fa28ea576)
- feat(ui): Render the app shell at one tree position on every route (A11) (#2244) (00b69eedb)
- feat(ui): Confirm a password reset on sign-in and say a password change signs out other devices (#2267) (25fd262fb)

### Fixes

- fix(ui): Name the undeliverable address on Account, Security and Billing; count only stored Resend events in alerts (#2302) (174c11ff0)
- fix(ui): Select staging API and downloads hosts in the marketing policy on taucad.dev (#2278) (65c29d135)
- fix(host): Refresh Grok's model list from its \_x.ai/models/update push (#2277) (541ff9fb5)
- fix(viewer): Stop clipping at 0° FOV, even out the grid and fix the hover highlight (#2003) (5b09a758a)
- fix(revisions): Answer a warm reopen from a comparison record instead of re-reading the checkout (#2270) (067bb7a80)

### Other changes

- test(files-ui): Give the jsdom suite the app's no-op ResizeObserver (#2309) (893c5d096)
- refactor(ui): Remove the Auto kernel transcript row (#2308) (eedcfc0d7)
- refactor(runtime)!: Derive transcoded route fidelity from edge formats (#2301) (8447753cd)
- ci(root): Run nightly-green e2e suites in the merge queue when affected (#2299) (084b1ad9c)
- refactor(ui): Cut the files-ui library from the app (UI wave D) (#2298) (ca2b80fb8)

## 0.11.0 (2026-11-15)

### Features

- feat(ui): Run each session's flushes and close over its real children (A7c) (#2245) (648a28cef)
- feat(telemetry): Retire the legacy observability middleware and put every producer under the one consent rule (PR-7) (#2259) (8ba8f3552)
- feat(api-email): Receive signed Resend delivery events (#2255) (665aeef9f)
- feat(ui): Trim Settings → Viewer and size every settings control alike (#1983) (21c5bd82e)
- feat(ui): Let the API policy alone gate signed-out runtime telemetry on the web (#2251) (54708a070)
- feat(ui): Replace the session's runtime through replaceRuntime, after a flush (A6e) (#2241) (f9a1bd111)
- feat(ui): Let each project session own its revisions, connector, presence and parking (A7b) (#2242) (8bf5ef7cd)
- feat(ui): Send Server-Timing for the document's render, catalog and cold instance (LB0a) (#2235) (44cf81e52)
- feat(ui): Build the project runtime as a lazy session child (A6d) (#2218) (eab9d6d98)
- feat(ui): Say Tau Cloud's state in the Projects header and drop the last Home skeletons (A15g2) (#2217) (9611c6543)
- feat(ui): Compose focus with the registry, library and route in the runtime (A5b) (#2209) (8015bb572)
- feat(ui): Paint Home cards from the listing snapshot with no skeleton (A15g) (#2214) (7dcbabd2b)
- feat(sandbox): Write the Linux Terminal's git store through a FUSE store guard (LP2, LP3, LP5, LP8) (#2187) (277277b3a)
- feat(ui): run the viewer Dockview adapter as a runtime child actor and fix the M2 phone watermark (A8d) (#2213) (71175a269)
- feat(ui): run the workbench Dockview adapter as a runtime child actor (A8c) (#2211) (fb5b95a53)
- feat(ui): Move the workspace commands and root file facade into ProjectLibrary (A4b) (#2212) (f74574e2d)
- feat(ui): serve the listing snapshot and the cloud listing state (A13) (#2164) (118205f8d)
- feat(ui): Run the entries record session as a project runtime child (A9) (#2200) (2f317e890)
- feat(ui): Move the project commands into ProjectLibrary (A4a) (#2207) (7d91d68be)
- feat(ui): host the workbench layout in the project runtime and deliver pane intents through it (A8b) (#2202) (55295309e)
- feat(ui): Run the library's discovery, recovery and access machines in ProjectLibrary (A3b) (#2203) (fbdd3621d)
- feat(ui): Build the project file manager as a session child (A6c) (#2201) (63da51047)
- feat(ui): report the chat transcript's load state and reserve the tray (A12) (#2177) (4933acd4c)
- feat(ui): Add the focus machine and the project route-state selector (A5a) (#2117) (a772c957f)
- feat(agent-observability): Let a tool fact carry its run's host, kernel and model labels (LW17) (#2199) (9e7a63ede)
- feat(ui): Write tau.load measures on deployed pages, with no network export (LB0b) (#2120) (d50cbbd3e)
- feat(ui): Lease the project runtime from the app runtime and own its producers (A6b) (#2181) (dcab0102b)

### Fixes

- fix(host): Refuse an ACP CLI probe that times out but exits cleanly (#2265) (0f06774c7)
- fix(host): Make every ACP agent work from desktop-app and CLI installs (#2262) (7caef4598)
- fix(ui): Skip the saved-preview backfill once the server is known to hold one (#2257) (0ae3f626c)
- fix(ui): Give switches and the settings info button 24px pointer targets (#2258) (003d8f84e)
- fix(ui): Cache hashed sprites for a year and serve the manifest as a manifest (LB6a) (#2248) (b7cf66626)
- fix(ui): Probe a project's agent host for the log its own storage provides (#2253) (7b85e00a6)
- fix(ui): Hold wait indicators 500 ms from the painted reveal, and keep the lint gutter's width (A15f2) (#2224) (8c224db31)
- fix(ui): Keep measuring later project opens once a tab reaches the tau.load bound (#2243) (4e4e24dec)
- fix(ui): Build the viewer's tab bar once on a project open (U16) (#2240) (16416027b)
- fix(ui): Publish each esm.sh package's types without waiting behind wider imports (LB3b-f2) (#2239) (b25749cde)
- fix(ui): Type wide esm.sh declaration packages such as lodash-es and date-fns (LB3b-f1) (#2238) (c535b9317)
- fix(viewer): Adopt three-viewport-gizmo 2.3.0 and present Bottom views upright (#2234) (199d037db)
- fix(ui): End a resumed attempt whose reopening and end fold in one read (#2229) (451eaccce)
- fix(ui): Keep the route and the editor on the same chat after A6d (D21 rounds 1 and 2) (#2226) (13524411e)
- fix(onboarding): FL4 follow-ups, and remove Home's suggestions row (#2198) (62c14dbc7)
- fix(revisions): Keep a rename when only another ref of the atomic push moved (#2188) (d91fe9505)
- fix(sandbox): Close the store guard's follow-up review nits (#2216) (ed5fc1389)
- fix(shell-service): never admit a shell call whose signal aborted before the gate (E09) (#2215) (8352062ed)
- fix(picogk): Pin the .NET runtime archives by sha256 for locked prepare (#2208) (47c0292ce)
- fix(ui): Decide or hold Home's suggestions row on the server (H2) (#2180) (32bb3c794)
- fix(revisions): Keep every address out of identity records (I3) (#2194) (a4e060aeb)
- fix(ui): Keep a file pane's Files tree mounted while its file is re-read or gone (#2182) (739301dde)
- fix(cli): Back up `tau version` tags and send origin from disk hosts (#2191) (02b06cae3)
- fix(ui): Paint the phone sheet where it rests on load, with no slide or fade (#2114) (39205cc24)
- fix(ui): Let webmail load the email wordmark and fonts cross-origin (#2192) (442a4573d)

### Performance

- perf(revisions): Read cold-open pack ranges past the HTTP cache (#2261) (cfeb76969)
- perf(ui): Load the RPC handler stack and semver on demand (LB4d) (#2237) (3d4520907)
- perf(ui): Acquire editor types in parallel, bounded, with no malformed @types path (LB3b) (#2113) (875074843)
- perf(ui): Load compiled skill bodies on first use, not with the composer (LB4c) (#2118) (b2aed0809)

### Other changes

- test(sandbox): Give C05 a rebinding name the test owns instead of localtest.me (#2254) (3333a67d6)
- chore(picogk): Pin the PicoGK browser host to manifest 93d4634b0a1b (#1791) (8d237f7db)
- test(ui): Run each Vitest Browser config of test:e2e as its own Nx task (#2223) (e533150f9)
- test(ui): Keep the ProjectFocus pr target within 3 minutes on CI (#2149) (e8a22553d)
- build(ui): Stop retaining and pinning the PicoGK browser host (#2206) (27a370637)
- refactor(desktop-services-host): extract the desktop utility hosts into an app library (DS-2) (#2005) (ade95913f)
- test(viewer): Run each Vitest Browser config of test:e2e as its own Nx task (#2169) (b01ac3873)

## 0.10.0 (2026-11-14)

### Features

- feat(ui): move the project library into a runtime-owned service (A2) (#2119) (7918b118e)
- feat(ui): add the workbench layout machine and pane intents (A8a) (#2115) (d66b3c6a5)
- feat(shell-service): one Terminal git store policy with remotes, branches and folded spellings (LP1, LP6) (#2124) (80c065da7)
- feat(ui): Carry the open request through the sessions registry (A5c) (#2112) (674cf3173)
- feat(taucad-ui): Add WaitIndicator, the loading timing ladder and the skeleton ratchet (A15a) (#2110) (a8d599ceb)
- feat(viewer): open Viewer settings as a bottom drawer on phones (#2106) (069eb7f05)
- feat(ui): Specify project focus with a ProjectFocus TLA+ family (#2041) (4e3ca8318)
- feat(ui): Record replay text and redact sign-in tokens from URLs (#2020) (399cfa78c)
- feat(ui): Add the file-manager host, rootFiles and leases (A1b) (#2062) (1e274f697)
- feat(ui): add LayoutApply formal model (#2042) (03bd88827)
- feat(shell-service): let the macOS Terminal commit, branch, stash and merge (TG5) (#2061) (255e24e5a)
- feat(ui): Add the session revisions and host connector children (#2057) (7b177f95d)
- feat(revisions): keep the person's staging and wait out their Git operations (TG4, TG7b) (#2058) (fe7b4dfa8)
- feat(ui): Compose the app runtime root and start it after hydration (A1a) (#2049) (dbcb6b643)
- feat(ui): Add the LibraryCatalog formal spec (#2045) (5508e5c3d)
- feat(api-git-core): back up commits you make with git (TG3) (#2053) (9b2f1aa2a)
- feat(ui): Add the project runtime factory and choices actor (#2048) (dd5eeedb8)
- feat(desktop): Report Git LFS and revision-engine failures, and guard the Linux payload (TG7c) (#2047) (8a1f7dcb3)
- feat(api-auth): Resolve sessions once per request through a single-flight resolver (#2027) (5617b2054)
- feat(ui): Offer Undo on the Merged and Closed toasts (#2025) (56d89e740)
- feat(viewer): move grid and kernel settings into viewer settings sub-views (#2022) (94841e892)

### Fixes

- fix(revisions): pin the engine's common dir, refuse planted commondir, warn on rebase exec (LP4, LP7) (#2148) (1abaf069d)
- fix(three): Send a rig's clip policy and render frame before presenting them (#2144) (3ed9257d4)
- fix(ui): Draw the AR glyph's letters as strokes instead of SVG text (#2137) (9aaa23910)
- fix(ui): Do not report the requests a closed editor left in flight (#2133) (84aaf506a)
- fix(ui): Let the composer's labels leave while the model name is still pending (#2131) (74b7462f3)
- fix(ui): Mask unsent chat composer text in session replay (#2122) (e4ba7c096)
- fix(ui): Keep a client navigation off the root loader (U23) (#2121) (839871327)
- fix(ui): Start showcase loaders again on WebGL when a WebGPU canvas cannot present (#2098) (96078531b)
- fix(ui): Clear a chat's legacy unread mark when the person views it (#2097) (68ccfcd70)
- fix(revisions): Refuse a merge built on history an undo took back (#2111) (82fc8f4b5)
- fix(ui): Answer a stalled shell navigation with the cached shell after 3,000 ms (#2116) (facb5c83b)
- fix(ui): keep handed-back pane intents through a LayoutApply lane close (#2063) (7aef35a10)
- fix(revisions): Back up past a v<n> tag that is not a version (#2107) (2c5a458e0)
- fix(ui): Decide the desktop first run only from a completed project scan (#2093) (d86a53875)
- fix(ui): List the dependency mount before its first install creates it (#2085) (7e439ad9d)
- fix(ui): Name the History card a group so the phone sheet keeps one History landmark (#2078) (31b185620)
- fix(ui): Keep the app mounted when the first billing owner signs in (#2028) (23e9ac1fa)
- fix(agent-observability): Let a host claim the protection the API reads for the account (#2052) (475b2f403)
- fix(shell-service): Let the Terminal read the real git store and run the bundled git and git-lfs (#2007) (52506ee4d)
- fix(agent-tools): Keep test statuses and source revisions in a reduced test_model result (#2017) (7fe168ed2)
- fix(agent-observability): Do not let a todo update after the last check hide task success (#2023) (89fa095c4)
- fix(api): Remove only conflict lines through the audited ref verb (#2021) (d83a5354e)

### Other changes

- test(ui): Run the sized ProjectFocus configs on the pr tier in their own target (#2147) (9257031b2)
- ci(formal): Run each TLA+ family in a parallel target of its own (#2092) (2cdaf1520)
- test(host): probe the Linux store guard's launch shape on the shell rows (LP0) (#2108) (50a5e6308)
- test(ui-e2e): Seed the stability circuit's projects with their entry file open (#2081) (f443311d2)
- test(ui): pin chat loading defects U7, U19 and U10 as red rows (#2031) (7fd6f8e4a)
- test(ui): Baseline event totality for the seven orchestration machines (#2035) (b28f640da)
- test(ui): Widen the event-layer counter, add the ownership ratchet and the wide formal job (A0.6) (#2032) (11b943eae)

## 0.9.1 (2026-11-13)

### Fixes

- fix(ui): Stop clipping the Desktop and Unavailable kernel badges (#1996) (6f6663202)
- fix(ui): Keep the open Settings section mounted across the phone breakpoint (#1988) (e36bfa049)

## 0.9.0 (2026-11-13)

### Features

- feat(picogk): Pin the PicoGK layers to dependencies.tau.new (#1977) (1f869be28)
- feat(viewer): remove the camera button pane under the gizmo (#1980) (6fee26758)
- feat(ui): Let a stored tau:flags override turn on hidden flags (#1963) (3b8eaa706)
- feat(ui): PR 8 of the onboarding plan, the five-tip product tour behind onboarding (#1939) (0c937ab1b)
- feat(chat): PR 9 of the onboarding plan, the person block and its switch (#1938) (a5a509d44)
- feat(revisions): Name version tags by number (T1) (#1923) (668f9cf16)
- feat(ui): PR 7b of the onboarding plan, setup's live preview and its end-to-end specs (#1926) (ef40512ea)
- feat(ui): Move History's branch actions onto the branch chips (D3) (#1927) (bee2a79e4)
- feat(ui): PR 7 of the onboarding plan, setup at /welcome with auto-open, invite and desktop first run (#1925) (bccbe3749)
- feat(viewer): PR 5b of the onboarding plan, keyboard and single-click navigation, and the app's camera input (#1924) (174b84b26)
- feat(ui): PR 6 of the onboarding plan, Settings → Viewer and each view's setting marks (#1922) (18f9292ee)
- feat(ui): Draw a lane per branch in History (D2) (#1921) (f42cb91a2)
- feat(ui): PR 4b of the onboarding plan, the agent and the plugin page set view fields as commands (#1916) (c649e2c76)
- feat(viewer): Run the view cube as a gesture machine around a callback adapter (G8) (#1917) (8b47d112c)
- feat(ui): PR 4 of the onboarding plan, view settings inherit from you, then the view (#1911) (5278d2439)
- feat(revisions): Carry each branch's remote head for the boundary (D4) (#1920) (b2a57c813)
- feat(ui): Lay out the History branch graph and add branch tokens (#1785) (f9ed0f601)
- feat(revisions): Title an agent turn's History entry by the person's request (Q9) (#1914) (3ee36b240)
- feat(viewer): PR 5 of the onboarding plan, camera presets, cursor navigation and gizmo styles (#1912) (f76e96e2b)
- feat(ui): Show each History row's time, facts and actions together (C3) (#1908) (f8129b5ff)
- feat(ui): run each view's record binding beside its graphics in the project machine (G6b) (#1907) (8feb13980)
- feat(telemetry): Report how automatic kernel selection resolves, and rank selector search (AKS-10, AKS-9) (#1905) (0f26bbd21)
- feat(ui): Say a chat request's save in one line and title the history card as History does (C5) (#1910) (68a5a2ce1)
- feat(ui): Make the History header the branch chip, one sentence and Discard and Save (C2) (#1906) (59f8f356a)
- feat(viewer): Present the camera's viewport and grid clip from the canvas and step the controls from the adapter (G7b) (#1877) (aa9a3cdb0)
- feat(viewer): Run Measure's exact query and target list scan as session children (G10b) (#1903) (8a327e059)
- feat(ui): PR 2 of the onboarding plan, baseline events and a flag-state e2e harness (#1904) (6cc3f4d34)
- feat(ui): Create entry-less projects from Home Auto and adopt the first model (AKS-6) (#1890) (0bd287354)
- feat(ui)!: Call a save a history entry and a named point a version (C1, C8) (#1878) (13ae1b6fa)
- feat(viewer): Give Measure a session actor and emitted release decisions (G10a) (#1840) (70e3039b6)
- feat(ui): Back hidden feature flags with PostHog feature flags (#1861) (8ae93033d)
- feat(viewer): wire the framing machine into graphics (G5b) (#1857) (14901b2dc)
- feat(revisions)!: Restore and switch at once and offer Undo (C7) (#1864) (54fcb140f)
- feat(agent-host): Land compaction at a fifth of the context window (#1780) (59b0d4c5c)
- feat(agent-host): Carry effort in the transcript, bind replay per model (#1803) (8f3d37c53)
- feat(ui): Make the backup the History pane's last line and move People with access to Share (C4) (#1859) (dbee175fd)
- feat(ui): Auto-first kernel selector behind autoKernel (AKS-9) (#1853) (54fc9e12f)
- feat(viewer): Send viewer shortcuts to graphics as intents and root the standalone viewer (G12a) (#1841) (b07e5b7d8)
- feat(ui): Give the History chip a tooltip and a Switch to button (C6) (#1842) (97e76e2bb)
- feat(revisions)!: Type a history row's who and name its capture (B2) (#1833) (88796b065)
- feat(viewer): Make the view camera a graphics child presented by one controls adapter (G4) (#1814) (9302b5c47)
- feat(ui): Make the entries store a shim over recordSync (G2a) (#1812) (2ade144cf)
- feat(revisions): Name imported commits by their git author and register linked projects as GitHub (B3, B4c) (#1827) (43ecc4fbd)
- feat(cli): Print recorded provenance and keep stored ids behind debug in History (B5) (#1826) (03bbb4357)
- feat(chat): Route the kernel in turn from the chat's kernel preference (AKS M4) (#1825) (394893654)
- feat(revisions): Number versions once per project, allocated by Tau Cloud (B6) (#1816) (2252cbe73)
- feat(revisions)!: Require a typed identity and write trailer version 2 (B1) (#1818) (84e6d2c51)
- feat(api-agent-observability): Carry ledger cost on each generation and drop tau.financial rows (LW4) (#1811) (618ca6da0)
- feat(picovoxel): Teach stylised characters with smooth-union and ellipsoid helpers (AKS M3) (#1824) (a66becdff)
- feat(api-agent-observability): Write ratings, run termination and task success as Langfuse scores (LW7) (#1809) (e286e92ea)
- feat(ui): Move the layout store onto recordSync (G2b) (#1815) (ebbdc8087)
- feat(taucad-ui): Open dropdown and combobox sub-views on a shared view stack (AKS M2) (#1823) (3e612ed1b)
- feat(agent-observability): Name tools and send run root and tool content from every host (LW5, LW6) (#1808) (b9b45beda)
- feat(ui): Add the view-record binding machine (G6a) (#1813) (9c003427d)
- feat(revisions): Start every project with V1 · Start (#1766) (1c9fd4ee3)

### Fixes

- fix(ui): Wrap the update popover's action under its link in a narrow sidebar (#1975) (7a59ff35f)
- fix(ui): Keep home's own composer focus from counting as use before setup opens (#1972) (dc667f386)
- fix(runtime): Render a watched document's edit that a request revalidated first (#1962) (1ea013741)
- fix(revisions): Never push over a branch that lacks the remote's head (#1954) (32f5b8a9e)
- fix(chat): Read an empty question record as no record (#1932) (dbb4a543a)
- fix(ui): Keep dev Home drafts on reload and retarget stale e2e specs (#1913) (ac25495b9)
- fix(ui): Keep the Terminal's last columns visible after a resize (#1902) (d6cd4ba6a)
- fix(ui): Give the dev dependency optimizer its route and worker entries (#1899) (296c58568)
- fix(agent-host): Bind transcript effort markers into the prefix stamp (#1893) (eb50e4f46)
- fix(viewer): PR 1 of the onboarding plan, a trackpad pinch dollies like the wheel (#1898) (08980bcb5)
- fix(formal): Make the formal nightly green: simulate every graph, split agent-host's nightly (#1871) (934db8cba)
- fix(ui): Tag a desktop route with its web route id (#1888) (4c6073dab)
- fix(desktop): Retry failed update checks and restart from one request (#1847) (9e770caf4)
- fix(revisions): retry thrown fill checks and keep Try again from filling twice (#1860) (286ad1069)
- fix(ui): Carry an entry made at its defaults in the entries patch (#1881) (233460c36)
- fix(api): Fit Postgres pools to the session pooler and count them (#1863) (507c65bcc)
- fix(ui): Report a desktop renderer kill once, as the minidump (D13) (#1851) (2473a6301)
- fix(host): Keep the machine's system gitconfig out of the shell's git view (#1831) (5b24d1cf7)
- fix(revisions): Write nothing tracked at open and fold Tau's setup entries (#1756) (cf6478ef2)
- fix(billing): Accept plan_expiry journal kind on the balance wire (#1820) (18401b34f)
- fix(ui): Inset the Terminal grid 12px from the sides and 8px from the top and bottom (#1653) (112a8b473)

### Other changes

- ci(nx): Give the React event-layer counter only to the projects that run it (#1971) (6b8f4ab3c)
- refactor(formal): Rename the formal Nx target to formal:tla (#1968) (27a0c168f)
- refactor(viewer)!: Move the last graphics effects into actors and catch defects at each root (G12, part 2) (#1961) (57d2a258b)
- ci(root): Run the shell rows in the merge queue in a semantics tier (#1900) (0b556ffc9)
- refactor(viewer)!: Hold the graphics scope at zero and move the camera registry (G12, part 1) (#1957) (bdabf7dbf)
- refactor(viewer): Move GLB preparation into a presentation actor (G11b) (#1936) (ebb90b45c)
- refactor(viewer): Move the presentation seams out of React (G11b) (#1919) (ddccb76d6)
- test(tau-examples): Pin the PicoVoxel exact GLB with its generator version normalized (#1918) (1fb17ecd7)
- test(tau-examples): Re-pin the PicoVoxel exact GLB after attribution (#1915) (626d6a046)
- test(host): qualify T12 through real revision custody (#1892) (f15472b8a)
- refactor(formal): Infer the formal and formal:lean targets from specs (#1891) (19c0fb264)
- test(viewer): Present SwiftShader WebGPU canvases through a Vulkan-backed ANGLE (#1862) (e32fb83c8)
- refactor(desktop-terminal): Extract the Terminal concern into a library (#1885) (be5efe706)
- refactor(shell-service): Extract the host shell service into libs/shell-service (#1876) (769f5bd62)
- test(ui,react-e2e): Fix the ui telemetry define, the viewer-bar expectations and react-e2e version drift in the E2E nightly (#1843) (8c2227e35)
- ci(viewer-parity): Deal the viewer shards by measured capture seconds (#1866) (7f5b43bf9)
- refactor(sandbox): Extract the OS sandbox and shell provider into libs/sandbox (#1858) (9fb9351e3)
- Langfuse LW17: host labels from browser, desktop and daemon, and per-run release and tags (#1819) (d516ab2d9)
- refactor(agent-host): Delete two model-call middlewares nothing calls (#1753) (b8a5e12a5)
- test(api): Add the kernel routing spike runner and live suite (AKS-S1) (#1783) (c3ed122d8)
- Content evidence: cap parts in UTF-8 bytes, label interrupted output truncated (#1817) (2f39ceeac)
- test(ui): Add the UI-wide React event-layer lint ceiling (#1710) (b4602c669)

## 0.8.0 (2026-11-11)

### Features

- feat(api-agent-observability): Count Langfuse units and alert at 70% of Hobby's allowance (LW24) (#1806) (f56bc5601)
- feat(ui): Redesign billing screens, copy and shared components (#1786) (91ffe6243)
- feat(api-llm-gateway): Carry host, build, kernel and model labels into the provider fact (Langfuse LW17) (#1798) (a5440ce14)
- feat(revisions): Read and write a turn's base cut as the person's (#1767) (dbabc0025)
- feat(viewer): Add the framing actor that frames a view's geometry through its camera (G5a) (#1804) (63fc283be)
- feat(ui): Build recordSync and make the view store its shim (#1772) (a6a17d752)
- feat(host): Give the agent's shell read-only git through a branch view (#1799) (8dde02b3e)
- feat(api-agent-observability): Langfuse v5 mapping, one trace and root per run, and trust Langfuse's delete (LW1, LW2) (#1800) (87c6fc46e)
- feat(desktop): Report the build id and ratings like the browser host (Langfuse LW8) (#1801) (fa6ab384d)
- feat(viewer): Move the section handles' pointer input into a gesture machine (#1796) (8806431a8)
- feat(api-email): Send each kind of email from its purpose's sender (#1797) (897a2c3b4)
- feat(viewer): Move the kinematics drag gesture into the kinematics actor (#1793) (4d2f46b3e)
- feat(tscircuit): Give the 3D board a soft lacquer solder mask (#1795) (bddd8f330)
- feat(ui): Lead an empty Home with community builds and give headings one owner (#1703) (314cd5924)
- feat(camera): Give the camera actor input states, provenance and atomic events (G3) (#1761) (5b14f8f52)
- feat(agent-host): Keep the request prefix across a chat's settings (#1782) (560c9ffc9)
- feat(ui): Name who backed up each entry from Tau Cloud's push records (#1771) (222992c28)
- feat(ui): Show update prompts only in the sidebar (#1745) (b2d3188f2)
- feat(viewer): Move the renderer lifecycle into a canvas actor (#1746) (5b3ef73ec)

### Fixes

- fix(api-billing): Name the expected output field and record refusals before admission (#1792) (2584fb51f)
- fix(ui): Accept website events behind the staging router (#1787) (079c7e2c7)
- fix(agent-tools): Run the GeoSpec harness test on a valid BRep in the test shards (#1779) (aa1fb2edf)
- fix(filesystem): Serialize native watcher subscribe and unsubscribe (#1776) (008728315)
- fix(ui): Keep the composer still while a project opens on desktop (#1769) (d07c2a93c)
- fix(ui): Build the content security policy per environment (#1774) (0e923d1d6)
- fix(revisions): give every checkout its fill word, so a new project's viewer leaves "Downloading model files" (#1742) (d8581a532)

### Other changes

- ci(root): Run the desktop renderer payload check whenever ui is affected (#1777) (9b1c72804)
- ci(root): Select native hosts and viewer parity in the CI plan, merge queue only (#1773) (0dbd19d92)
- chore(root): Apply the brand policy to names, one-liners and avatars (#1760) (ca9355b24)
- refactor(revisions): Make revision identity changes events on the open client (#1707) (20abec4ff)
- ci(root): Restore the affected lanes' pinned downloads from a digest-keyed cache (#1775) (e9ff3a687)
- refactor(ui): Cut the ui-core app library from the app's lib, utils and constants (UI wave E, first slice) (#1686) (ead76cc3d)
- chore(picogk): Pin the PicoGK browser host to manifest 313d375b1617 (#1731) (c46169f1a)

## 0.7.0 (2026-11-10)

### Features

- feat(ui): Ask undecided visitors for analytics, link Sentry to PostHog and count website pages (#1726) (253deae24)
- feat(telemetry): Count each prompt-prefix break with what it cost in cache (#1741) (4ad7fd01e)
- feat(api): Turn on Free-tier cloud sync and remove its flag (#1744) (182df355d)
- feat(agent-host): Replay native reasoning only under the prefix that minted it (#1737) (51d463248)
- feat(camera): Add the CameraAuthority TLA+ spec and its formal target (#1709) (57c5e68ca)
- feat(api-llm-gateway): Refuse a rejected reasoning replay with its own code (#1721) (ae04dcbb0)
- feat(ui): Remove the crash prompt and send tab kills only with telemetry consent (#1722) (da907c051)
- feat(viewer): Export the graphics machine's totality baseline (#1708) (260358f0c)
- feat(agent-host): Stamp each reply with its request prefix and count typed breaks (#1716) (85bad0f83)
- feat(ui): Load PicoGK by digest from each environment's dependency mirror (#1676) (8f31a0772)
- feat(api): Report R2 usage per bucket role and add the R2 buckets dashboard (#1689) (1f0ce143a)
- feat(agent-host): Send each model step's turn step and gap as gateway headers (#1675) (cd28b4d93)
- feat(root): Add the nx:census project size and affected-rate report (#1655) (57a276cba)
- feat(agent-host): Ask Anthropic for a one-hour prompt cache and key OpenAI and xAI caches by chat (#1643) (bbcde6478)
- feat(nx): Add the shell tag, pin the shell import surface, and adopt the package rule (#1644) (a973dfa77)

### Fixes

- fix(revisions): stop a model download ending in "Couldn't download model files" (#1724) (a41bcb503)
- fix(agent-host): Store the reply as the provider wrote it and normalize math at render (#1736) (4b53bf3f3)
- fix(tscircuit): Give the 3D board a matte solder mask (#1712) (dc97df044)
- fix(api-email): Fix email rendering across clients and the sign-up verification flow (#1701) (8f9053c81)
- fix(ui): Keep Home still on phones and keep keys typed while it loads (#1313) (9fea7fcb3)
- fix(ui): Re-theme the open Terminal when the app theme changes (#1695) (248858425)
- fix(desktop): Keep the dead page's context on a desktop renderer minidump (D13) (#1691) (2d502adcf)
- fix(desktop, ui): Upload desktop renderer source maps and trace 5% of production page loads (#1637) (5c5385875)
- fix(agent-host, ui): Restore the LangChain plane's interrupt reminder, recent skills, read dedup, result offloading and outage resume (R2–R6) (#1634) (723bf4c3f)

### Performance

- perf(ui): Mount a live project's workspace without a Suspense fallback (#1727) (4ebf6843d)
- perf(ui): Time the project-open windows that carry no span (#1628) (1c295eccc)
- perf(ui): Discover every route on boot so phone taps never wait on /\_\_manifest (#1630) (49aff8275)

### Other changes

- test(ui): Add the RecordSync TLA+ spec for own-write attribution (#1719) (dd5ea47e9)
- refactor(ui): Move chat auto-resume and the pull heartbeat into the chat machine (audit R5) (#1718) (c6df9e450)
- refactor(ui): Own the desktop payload check and cut the desktop -> ui edge (#1672) (9c07beb12)
- test(native-process-core): Qualify the macOS Terminal own-pty rule in shell conformance (#1690) (645be1a1e)
- ci(nx): Take the workflow files out of sharedGlobals and hash the environment tests read (#1715) (7e04defbb)
- test(ui-e2e): Characterise the two-drag orbit snap-back (G0.1) (#1714) (ed90dfd1f)
- ci(desktop): Cut a staging candidate when desktop or its renderer is affected (#1671) (3d776f30f)
- test(camera): Add the camera machine totality baseline (#1705) (4060083f6)
- refactor(api-llm-gateway): Run self-host helpers on the provider wires and remove LangChain (#1606) (6259bfe1a)
- chore(picogk): Pin the PicoGK browser host to manifest 313d375b1617 (#1698) (9c56d753e)
- refactor(api): Extract api-projects, api-agent-observability and api-chat, and run the API lane on affected projects (#1685) (564371eb3)
- ci(root): Mirror release layers to each channel's dependency bucket (#1684) (7dbb767c4)
- refactor(ui): Cut the chat-ui app library from the chat domain (UI wave B) (#1678) (9ff51774b)
- refactor(api): Extract api-git-core and api-git-mirror libraries (#1682) (9c9f1c241)
- refactor(runtime): Rename runtime payloads to dependency files (#1673) (007c14ee7)
- refactor(ui): Cut the project-workspace app library from the project route (UI wave C, first slice) (#1677) (2e8541bda)
- refactor(api): Extract api-testing and api-object-storage libraries (#1666) (00d83be02)
- ci(cli-e2e): Run the CLI end-to-end suites in their own gated lane (#1670) (1f8e6d7e2)
- refactor(ui): Cut the ui-kit app library from components/ui and icons (UI wave A) (#1665) (b4b0d1d47)
- test(telemetry): Stop Grafana and OTel bootstrap edits from selecting telemetry and the native rows (#1662) (569643b0a)
- refactor(host): Move the X1C qualifier from bambu to host:qualify-x1c (#1651) (8d6c13f46)
- build(tau-examples): Depend on viewer and image so a viewer change selects test:viewer-parity (#1650) (d2a934605)

## 0.6.0 (2026-11-09)

### Features

- feat(telemetry): Report agent-loop safeguards and compactions from the Pi host (R9) (#1623) (1ab6c548e)
- feat(agent-tools): Restore web search and web browsing on the Pi agent host (#1605) (79bbd572f)
- feat(api): record free accounts by default until they opt out (#1543) (9dba60326)
- feat(api-billing): Label open cases by attribution and add age gauge (#1607) (195e6fa92)
- feat(filesystem, desktop): Import a desktop folder or opened file by copying it host-side (W7.4) (#1584) (2305062c9)
- feat(api): Measure gateway upload, admission and first-step prompt-cache hits (#1578) (5321d3e8a)
- feat(ui): Match the Terminal's colours, text weight and spacing to the editor (#1531) (753d87fc8)
- feat(ui): attach each deploy's commits to its Sentry release (#1546) (f9ce9c8ce)

### Fixes

- fix(agent-host): Keep the prompt prefix identical across turns and steps (#1629) (5fbe770fb)
- fix(ui): Reject ambiguous project slug routes (#1620) (052b0fc55)
- fix(ui): start every new project from Home and quiet the sidebar's project list (#1595) (0b779a208)
- fix(desktop): Desktop Sentry release commits, PostHog CSP, API otel map and lighter page-load traces (#1615) (d577b7b7b)
- fix(ui): Light the Terminal's text on macOS and turn on ls colours (#1592) (a25024279)
- fix(ui): Keep a view's own camera save from snapping a newer orbit back (#1602) (7fc58da51)
- fix(ui): Render the selected model's name on the server (#1560) (dd0e63268)
- fix(ui): Reserve the remembered project list shape and trim library chrome (#1559) (e307f65cf)
- fix: report a failed Linux sandbox setup as not started, give shell cleanup a realistic deadline, and stop the location chip loop from #1558 (#1586) (595c1737d)
- fix(ui): paint Home's composer whole and keep its outline through the swap (#1563) (4b5cc4b69)
- fix(ui): read the pending model name without comparing a boolean (#1583) (91a59fbbc)
- fix(revisions): Give the compute worker realm its own Buffer global (#1505) (5476c70ba)
- fix(ui): report unstarted observations as registering; move skills recovery into the bar (#1556) (b44721742)
- fix(ui): refresh the Terminal screen mirror from parsed output (#1557) (787c52a6e)
- fix(ui): Paint the application shell at its final geometry (R4, R7, R10) (#1554) (715f01902)

### Performance

- perf(ui): Add the project-open User Timing probe and its fixture (#1619) (2ebe5a074)

### Other changes

- test(telemetry): Stop kernel-plugin changes from selecting telemetry, host and agent-tools (#1639) (6c5f87c2e)
- refactor(picovoxel): Remove the meshRelax option from PicoVoxel and PicoGK (#1622) (d42494722)
- docs(www): simplify legal documents and describe agent recording (#1457) (d2d039df7)
- refactor(api): Split the API into ten module libraries and run only affected package tests (#1576) (735d178dc)
- ci(root): Run the standalone oracles only when they are affected, plus nightly (#1549) (6fc04b8d6)
- refactor(chat): share the model catalog wire schema so the UI stops importing the API (#1568) (cb1b424f4)

## 0.5.0 (2026-11-08)

### Features

- feat(filesystem, ui, api): Confirm editor saves before close and stream exports and publications (W12) (#1581) (be2ffdbcc)
- feat(revisions): Honour the checkout's own Git ignore rules on both legs (#1572) (a01585196)

### Fixes

- fix(openscad-language): Retry the wasi-sdk download on a network error or 5xx (#1582) (1da53560c)
- fix(ui): serve Home's composer at its final shape, focused, with the remembered location (#1558) (97dd154c5)

## 0.4.0 (2026-11-08)

### Features

- feat(filesystem, revisions): Land desktop large objects by cloning them from the repository's store (W11.3) (#1564) (8a2e24c9a)
- feat(billing): Expire plan credits when Pro ends (#1536) (bf5b12040)
- feat(revisions): One .gitattributes-derived large-object rule on both legs, and native large-object read/store (W11.2) (#1561) (a98ac1f16)
- feat(filesystem, revisions, ui): Stage a linked GitHub import in the worker and build its first revision from recorded blob ids (W7.3) (#1545) (4ad3a41e0)
- feat(billing): Update billing terms and pass provider prices through (#1535) (3a1a77218)
- feat(filesystem, ui, api): Import a GitHub archive through the worker's staging, measured once from its read-back (W7.2) (#1524) (c7cc6bdef)
- feat(desktop): report desktop renderer errors to Sentry through main (#1525) (caa961bed)
- feat(agent-tools, lsp-fs): Search and probe the Project Index instead of walking (W9) (#1523) (b38008c62)
- feat(filesystem): Desktop parity with batched Node writes, an incremental native mint and lazy large objects (W11) (#1522) (56e03caeb)
- feat(filesystem): Stream a disk import through staging on the compute worker (W7.1) (#1521) (f61685bf3)
- feat(revisions): Capture from index changes, stream LFS downloads and pace mints (W6.4) (#1517) (9aa5546fc)
- feat(ui): Staging browser tracing and Chromium crash/CSP reports (SB17, SB6) (#1516) (ddc45b47a)
- feat(filesystem): Index removal records and a streaming file write (W6.3) (#1512) (0f54f34f1)
- feat(ui): Report release health, one session per page load (SB8) (#1513) (d9ccad9fd)

### Fixes

- fix(api): Write the runtime.operation event without the request's fields (#1539) (020b9d3d5)
- fix(picogk): Keep the PicoGK browser runtime at one address across deploys (#1567) (d280df612)
- fix(ui): Scale the WASM integrity line with module size (#1569) (f4d29858f)
- fix(billing): Treat a portal return as a billing update and close the checkout return defects (#1551) (62afa4b9a)
- fix(manifold): Label normals on a setMaterial part that several glTF nodes share (#1534) (067e7cdfd)
- fix: Close the kernel batching and budget audit findings (#1528) (bf8542254)
- fix(viewer): send long frames as one event per 30 s window (#1532) (c6362d1e8)
- fix(ui): stop the crash prompt claiming every reload was out of memory (#1533) (de6e364bb)
- fix(api): keep a deleted project's agent traces until retention expires them (#1526) (5ec390f16)
- fix(ui): serve csharp-language runtime as immutable (#1527) (e71fe2d37)
- fix(native-process-core): Check sandbox prerequisites again before reporting one missing (#1506) (14dc15837)

### Other changes

- test(api): Run the live questions and task-list evals on any model; record Opus 5.5 (W7) (#1571) (c74172bff)
- refactor(billing): Drop the retired refund intent table (#1566) (8f7a85dd2)
- refactor(billing): Remove the operator refund commands (#1540) (0ce00c2e3)
- test(api): Measure the asking-questions and task-tracking evals live (W7) (#1537) (c28d18805)

## 0.3.0 (2026-11-07)

### Features

- feat(revisions): Open a project viewer-first by readiness stage, and write every path by oid diff (W4) (#1507) (3bb734746)
- feat(openrscad): consume per-solid manifold meshes and keep module selection (#1500) (779b7d1e0)
- feat(fs-bridge): Wire v3, bridge protocol 9 with long calls, events and index queries (W10) (#1501) (011e2237b)
- feat(agent-tools): Consume geospec 0.5.2-next.412 and report accuracy refusals (#1504) (2d170cd42)
- feat(runtime): Retire tessellation downgrades and the preview triangle budget (#1498) (96fe856c0)
- feat(ui): Render part thumbnails faster and draw spinners with a fading tail (#1465) (e896a7dda)
- feat(api): Langfuse run root span, timed children, real release labels and failure class (W5) (#1495) (36ee7d7fc)
- feat(agent-host): Bound the wait on a pending model attempt by the gateway's settlesBy (#1494) (b3e34a134)
- feat(filesystem): Change sets, watch plane and the virtualised tree (W8) (#1466) (dd575de6a)
- feat(build123d): Mesh Build123d and SMLibPy once, with no triangle budget (#1469) (774eb73b7)
- feat(cli)!: Remove the Rhino kernel and the @taucad/rhino package (#1472) (f131f5d99)
- feat(api): Allow a 600 s funded model step deadline and set it on staging (#1480) (8f69af8ce)
- feat(jscad): Mesh JSCAD, Manifold and OpenSCAD once, with no triangle budget (#1470) (41b741841)
- feat(middleware): Detect fallback edges at any triangle count (#1468) (a7a04baa4)
- feat(opencascade): Tessellate OpenCascade, Replicad and SMLib once, with no triangle budget (#1467) (cd7139d22)
- feat(desktop): offer to move Tau to Applications and say so when it cannot update in place (#1458) (813824334)
- feat(ui): Send errors to Sentry only, never to PostHog (#1463) (1c9c1aedb)
- feat(ui): Redesign the question card as a paged single and multi-choice form (#1455) (3dca302b7)
- feat(revisions): Compute worker, pack Range serving and the catalogue cold open (W5) (#1449) (7eb3193c2)
- feat(ui): Render captures with the light scheme's black edges (#1452) (396626a1e)

### Fixes

- fix(revisions): Read a moved ref from the server's compare-and-set, never from a held lock (W6.2) (#1511) (ce1488c0a)
- fix(telemetry): Fix two T12 re-run defects (machine entries from tau mcp, CLI export transcoder) (#1464) (fbffcbb41)
- fix(ui): Resume a run abandoned on a pending model attempt once settled (#1483) (c077c8488)
- fix(native-process-core): Start the sandbox again when its Linux bridge is slow (#1497) (624306ee9)
- fix(ui): hide chat ratings while "Improve Tau for everyone" is off (#1477) (49a7825fc)
- fix(api): Boot without Better Auth CLI noise; report real worker errors (#1492) (106c7bde0)
- fix(ui): Separate cache read and write in the export usage line (#1482) (7e78fa875)
- fix(api): settle a failed evidence delivery attempt on its own row (#1478) (2347b1b07)
- fix(api): Ignore a repeated SIGTERM or SIGINT during the graceful drain (W1) (#1471) (0912a9fc8)
- fix(tscircuit): Give every part a 3D body, show enum view options, end the pin-number flicker, edge the board by toggle (#1450) (e24ddec85)
- fix(api): Confirm Langfuse erasure on the v2 observations read and alert on stuck rechecks (W0) (#1462) (5e5dd13ac)
- fix(ui): read the skew protection token from Netlify's function context (#1461) (c01b7b271)
- fix(smlib): Draw SMLib and SMLibPy edges through the face mesh's own boundary samples (#1453) (7eb81f118)

### Performance

- perf(revisions): Sync does only the work a change needs (W6.1) (#1510) (20a72e6b1)
- perf(filesystem): Answer a warm stat from the file handle a listing kept (W3.2) (#1509) (a6d3ae3cf)
- perf(smlib): Read edge ends, fallback edges and drawing curves once per body or edge (#1484) (876c9a763)
- perf(occt-core): Return gp value types without the exception proxy (#1487) (2fc9f118b)
- perf(manifold): Read each source manifold's mesh once when adding missing normals (#1485) (73efcef29)
- perf(zoo): Answer offline topology queries with one OCCT pass per shape (#1488) (6e6077890)
- perf(replicad): Walk each STEP interface product's faces once and free the wrappers (#1489) (288d79693)
- perf(tscircuit): Build copper and silkscreen strokes as one CrossSection per side (#1486) (8deb1977b)

### Other changes

- chore(host): Bump geospec to 0.6.0 (#1508) (330eff5eb)
- test(smlib): Pin wasm call counts per kernel and trace OpenCascade, Manifold and OpenRSCAD calls (#1473) (eb273e392)

## 0.2.0 (2026-11-05)

### Features

- feat(ui): replace the animated sign-in story with a static gearbox image (#1447) (a1835158b)
- feat(filesystem): Split metadata from content and keep a validated Project Index (W3) (#1443) (f55d4a097)
- feat(image): Draw card thumbnails from the viewer render profile's card edge weight (#1442) (1b9e943c3)
- feat(revisions): Keep .git off the pipeline with Tau's own pack reader and object store (W2) (#1441) (00410dfd3)
- feat(tscircuit): real KiCad parts, layer-built 3D boards and themed PCB and schematic views (#1422) (e48adb095)
- feat(image): Render captures from one viewer render profile on nanoraster 0.9 (#1414) (7cc511237)
- feat(filesystem): Make the changeset the only mutation, with one lock set, one event and one notice each (W1) (#1429) (22d06913f)
- feat(ui): match the Terminal font to the editor and close Terminals without asking (#1413) (eb411a391)

### Fixes

- fix(ui): Keep sign-in and app links on the host the page loaded from (#1454) (4dd3140d4)
- fix(ui): Default Debug tools off on deployed sites (#1451) (eaf2ea7c8)
- fix(desktop): run native kernel workers through Tau's own bwrap on Linux (#1408) (e57844129)
- fix(viewer): Halve the infinite grid's contrast in both themes (#1436) (0b83963ef)
- fix(host): Judge S01 supervisor memory from its ready reply, not before it loads (#1437) (9e86696bb)

### Performance

- perf(skills): Serve system skills without background downloads and keep them out of executor views (#1446) (ed80de016)
- perf(geometry-core): Draw closed solids one-sided in every kernel (#1406) (cb9028a8c)

### Other changes

- docs(tscircuit): teach the skill real KiCad parts, layout, looks and visual checks (#1423) (3bd265d6a)

## 0.1.1 (2026-11-05)

### Fixes

- fix(api): Keep Redis reconnecting and alert before its memory fills (#1419) (7324347fe)

## 0.1.0 (2026-11-05)

First tracked release of this application.
