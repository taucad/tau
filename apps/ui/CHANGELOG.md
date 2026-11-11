# Changelog

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
