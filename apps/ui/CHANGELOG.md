# Changelog

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
