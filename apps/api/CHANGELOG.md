# Changelog

## 0.11.0 (2026-11-13)

### Features

- feat(api): Point prod LFS downloads at the files service on files.tau.new (#1979) (f6686dfa3)
- feat(api): Log each ref's answer in a push's report-status (#1955) (89bf969c5)
- feat(chat): PR 9 of the onboarding plan, the person block and its switch (#1938) (a5a509d44)
- feat(revisions): Name version tags by number (T1) (#1923) (668f9cf16)
- feat(ui): PR 7b of the onboarding plan, setup's live preview and its end-to-end specs (#1926) (ef40512ea)
- feat(ui): Draw a lane per branch in History (D2) (#1921) (f42cb91a2)
- feat(ui): PR 4b of the onboarding plan, the agent and the plugin page set view fields as commands (#1916) (c649e2c76)
- feat(ui): PR 4 of the onboarding plan, view settings inherit from you, then the view (#1911) (5278d2439)
- feat(revisions): Carry each branch's remote head for the boundary (D4) (#1920) (b2a57c813)
- feat(revisions): Title an agent turn's History entry by the person's request (Q9) (#1914) (3ee36b240)
- feat(telemetry): Report how automatic kernel selection resolves, and rank selector search (AKS-10, AKS-9) (#1905) (0f26bbd21)
- feat(ui): Create entry-less projects from Home Auto and adopt the first model (AKS-6) (#1890) (0bd287354)
- feat(ui)!: Call a save a history entry and a named point a version (C1, C8) (#1878) (13ae1b6fa)
- feat(api-email): Alert when Resend refuses an email, and list the sender variables (#1887) (88ca8bccc)
- feat(revisions)!: Restore and switch at once and offer Undo (C7) (#1864) (54fcb140f)
- feat(api-git-mirror): Inventory stored LFS checksums for STO-17 (#1856) (ed43e11dc)
- feat(agent-host): Land compaction at a fifth of the context window (#1780) (59b0d4c5c)
- feat(agent-host): Carry effort in the transcript, bind replay per model (#1803) (8f3d37c53)
- feat(api-git-mirror): Give legacy LFS relocation a maintenance command (#1855) (b51629692)
- feat(revisions)!: Type a history row's who and name its capture (B2) (#1833) (88796b065)

### Fixes

- fix(runtime): Render a watched document's edit that a request revalidated first (#1962) (1ea013741)
- fix(revisions): Never push over a branch that lacks the remote's head (#1954) (32f5b8a9e)
- fix(chat): Read an empty question record as no record (#1932) (dbb4a543a)
- fix(agent-host): Bind transcript effort markers into the prefix stamp (#1893) (eb50e4f46)
- fix(formal): Make the formal nightly green: simulate every graph, split agent-host's nightly (#1871) (934db8cba)
- fix(api): Retry the maintenance standby database check briefly (#1886) (df392eb14)
- fix(desktop): Retry failed update checks and restart from one request (#1847) (9e770caf4)
- fix(revisions): retry thrown fill checks and keep Try again from filling twice (#1860) (286ad1069)
- fix(api): give the image build the files CI hashes, so Nx hits the remote cache (#1867) (d4cafb68e)
- fix(api): Run the storage readiness heads together under one deadline (#1854) (f3760deaf)
- fix(api): Fit Postgres pools to the session pooler and count them (#1863) (507c65bcc)

### Other changes

- ci(nx): Give the React event-layer counter only to the projects that run it (#1971) (6b8f4ab3c)
- refactor(formal): Rename the formal Nx target to formal:tla (#1968) (27a0c168f)
- test(api): resume kernel-routing live runs and report spend (#1976) (d177dc911)
- refactor(viewer)!: Move the last graphics effects into actors and catch defects at each root (G12, part 2) (#1961) (57d2a258b)
- refactor(formal): Infer the formal and formal:lean targets from specs (#1891) (19c0fb264)
- refactor(desktop-terminal): Extract the Terminal concern into a library (#1885) (be5efe706)
- refactor(shell-service): Extract the host shell service into libs/shell-service (#1876) (769f5bd62)
- ci(docker): keep Buildx builders and build the API image on CI's Node (#1846) (1e2022f50)

## 0.10.0 (2026-11-12)

### Features

- feat(revisions): Name imported commits by their git author and register linked projects as GitHub (B3, B4c) (#1827) (43ecc4fbd)
- feat(chat): Route the kernel in turn from the chat's kernel preference (AKS M4) (#1825) (394893654)
- feat(revisions): Number versions once per project, allocated by Tau Cloud (B6) (#1816) (2252cbe73)
- feat(revisions)!: Require a typed identity and write trailer version 2 (B1) (#1818) (84e6d2c51)
- feat(api-agent-observability): Carry ledger cost on each generation and drop tau.financial rows (LW4) (#1811) (618ca6da0)
- feat(api-agent-observability): Write ratings, run termination and task success as Langfuse scores (LW7) (#1809) (e286e92ea)
- feat(agent-observability): Name tools and send run root and tool content from every host (LW5, LW6) (#1808) (b9b45beda)
- feat(revisions): Start every project with V1 · Start (#1766) (1c9fd4ee3)

### Fixes

- fix(api-database): Close the Supabase Data API and require signed bearer tokens (#1829) (1cfbd0870)
- fix(revisions): Write nothing tracked at open and fold Tau's setup entries (#1756) (cf6478ef2)
- fix(billing): Accept plan_expiry journal kind on the balance wire (#1820) (18401b34f)

### Other changes

- test(api): Add the kernel routing L2 runner on a real tau mcp process (AKS-3b) (#1828) (63284ed05)
- Langfuse LW17: host labels from browser, desktop and daemon, and per-run release and tags (#1819) (d516ab2d9)
- refactor(agent-host): Delete two model-call middlewares nothing calls (#1753) (b8a5e12a5)
- test(api): Add the kernel routing spike runner and live suite (AKS-S1) (#1783) (c3ed122d8)
- Content evidence: cap parts in UTF-8 bytes, label interrupted output truncated (#1817) (2f39ceeac)
- test(ui): Add the UI-wide React event-layer lint ceiling (#1710) (b4602c669)

## 0.9.0 (2026-11-11)

### Features

- feat(api-agent-observability): Count Langfuse units and alert at 70% of Hobby's allowance (LW24) (#1806) (f56bc5601)
- feat(ui): Redesign billing screens, copy and shared components (#1786) (91ffe6243)
- feat(api-llm-gateway): Carry host, build, kernel and model labels into the provider fact (Langfuse LW17) (#1798) (a5440ce14)
- feat(revisions): Read and write a turn's base cut as the person's (#1767) (dbabc0025)
- feat(api): Refuse pushed revisions that do not name the pusher (#1788) (665276e5f)
- feat(api-agent-observability): Langfuse v5 mapping, one trace and root per run, and trust Langfuse's delete (LW1, LW2) (#1800) (87c6fc46e)
- feat(api-email): Send each kind of email from its purpose's sender (#1797) (897a2c3b4)
- feat(camera): Give the camera actor input states, provenance and atomic events (G3) (#1761) (5b14f8f52)
- feat(agent-host): Keep the request prefix across a chat's settings (#1782) (560c9ffc9)

### Fixes

- fix(api-git-mirror): Cap blob collection and retire the unattended R2 writers (#1802) (0137fe33a)
- fix(api-billing): Require the output field Together requests carry (#1763) (bcf3929e0)
- fix(api-billing): Name the expected output field and record refusals before admission (#1792) (2584fb51f)
- fix(agent-tools): Run the GeoSpec harness test on a valid BRep in the test shards (#1779) (aa1fb2edf)
- fix(filesystem): Serialize native watcher subscribe and unsubscribe (#1776) (008728315)
- fix(revisions): give every checkout its fill word, so a new project's viewer leaves "Downloading model files" (#1742) (d8581a532)

### Other changes

- ci(root): Select native hosts and viewer parity in the CI plan, merge queue only (#1773) (0dbd19d92)
- chore(root): Apply the brand policy to names, one-liners and avatars (#1760) (ca9355b24)
- refactor(revisions): Make revision identity changes events on the open client (#1707) (20abec4ff)
- ci(api): Select the Docker smoke test by the API image's own Nx target (#1768) (fc735509b)
- refactor(ui): Cut the ui-core app library from the app's lib, utils and constants (UI wave E, first slice) (#1686) (ead76cc3d)

## 0.8.0 (2026-11-10)

### Features

- feat(api-llm-gateway): Admit an effort level carried in the transcript (#1747) (550a6fa80)
- feat(telemetry): Count each prompt-prefix break with what it cost in cache (#1741) (4ad7fd01e)
- feat(api): Turn on Free-tier cloud sync and remove its flag (#1744) (182df355d)
- feat(api): Allow funded model steps 10 minutes in production (#1740) (10bcfb96c)
- feat(agent-host): Replay native reasoning only under the prefix that minted it (#1737) (51d463248)
- feat(camera): Add the CameraAuthority TLA+ spec and its formal target (#1709) (57c5e68ca)
- feat(api-llm-gateway): Admit Anthropic's thinking binding controls (#1735) (68df918fa)
- feat(api-llm-gateway): Refuse a rejected reasoning replay with its own code (#1721) (ae04dcbb0)
- feat(agent-host): Stamp each reply with its request prefix and count typed breaks (#1716) (85bad0f83)
- feat(ui): Load PicoGK by digest from each environment's dependency mirror (#1676) (8f31a0772)
- feat(api): Report R2 usage per bucket role and add the R2 buckets dashboard (#1689) (1f0ce143a)

### Fixes

- fix(revisions): stop a model download ending in "Couldn't download model files" (#1724) (a41bcb503)
- fix(agent-host): Store the reply as the provider wrote it and normalize math at render (#1736) (4b53bf3f3)
- fix(api): cut and settle at once when Fly repeats the stop signal (#1734) (984772f97)
- fix(tscircuit): Give the 3D board a matte solder mask (#1712) (dc97df044)
- fix(api-email): Fix email rendering across clients and the sign-up verification flow (#1701) (8f9053c81)
- fix(api): Accept Cloudflare's null GraphQL errors in the R2 analytics pass (#1700) (a2045069e)

### Other changes

- test(native-process-core): Qualify the macOS Terminal own-pty rule in shell conformance (#1690) (645be1a1e)
- ci(nx): Take the workflow files out of sharedGlobals and hash the environment tests read (#1715) (7e04defbb)
- ci(desktop): Cut a staging candidate when desktop or its renderer is affected (#1671) (3d776f30f)
- test(camera): Add the camera machine totality baseline (#1705) (4060083f6)
- refactor(api-llm-gateway): Run self-host helpers on the provider wires and remove LangChain (#1606) (6259bfe1a)
- chore(picogk): Pin the PicoGK browser host to manifest 313d375b1617 (#1698) (9c56d753e)
- refactor(api): Extract api-projects, api-agent-observability and api-chat, and run the API lane on affected projects (#1685) (564371eb3)

## 0.7.0 (2026-11-09)

### Features

- feat(agent-host): Send each model step's turn step and gap as gateway headers (#1675) (cd28b4d93)

### Fixes

- fix(api-llm-gateway): Disable the Morph DeepSeek V4.1 Flash model for now (#1687) (6d7bd925b)

### Other changes

- refactor(ui): Cut the chat-ui app library from the chat domain (UI wave B) (#1678) (9ff51774b)
- refactor(api): Extract api-git-core and api-git-mirror libraries (#1682) (9c9f1c241)
- refactor(runtime): Rename runtime payloads to dependency files (#1673) (007c14ee7)

## 0.6.0 (2026-11-09)

### Features

- feat(agent-host): Ask Anthropic for a one-hour prompt cache and key OpenAI and xAI caches by chat (#1643) (bbcde6478)
- feat(nx): Add the shell tag, pin the shell import surface, and adopt the package rule (#1644) (a973dfa77)
- feat(api): Drop the retired supplier budget holds and cost evidence (0067) (#1621) (15d30731a)
- feat(billing): price Anthropic one-hour cache writes and admit prompt cache keys (#1597) (5213a7c2d)
- feat(telemetry): Report agent-loop safeguards and compactions from the Pi host (R9) (#1623) (1ab6c548e)
- feat(agent-tools): Restore web search and web browsing on the Pi agent host (#1605) (79bbd572f)
- feat(api): refresh Morph catalog to the models Morph serves today (#1631) (9fa28f697)

### Fixes

- fix(agent-host, ui): Restore the LangChain plane's interrupt reminder, recent skills, read dedup, result offloading and outage resume (R2–R6) (#1634) (723bf4c3f)
- fix(agent-host): unblock Together turns; refresh Together catalog to the cheapest provider per model (#1640) (d143e0d21)
- fix(agent-host): Keep the prompt prefix identical across turns and steps (#1629) (5fbe770fb)

### Performance

- perf(ui): Verify an installed project route without catalog discovery (#1625) (cea01b6f4)

### Other changes

- ci(cli-e2e): Run the CLI end-to-end suites in their own gated lane (#1670) (1f8e6d7e2)
- test(telemetry): Stop Grafana and OTel bootstrap edits from selecting telemetry and the native rows (#1662) (569643b0a)
- refactor(host): Move the X1C qualifier from bambu to host:qualify-x1c (#1651) (8d6c13f46)
- ci(nx): Harden the remote cache relay, write from main and the merge queue, upload behind Nx (#1645) (302ddc9ff)
- test(telemetry): Stop kernel-plugin changes from selecting telemetry, host and agent-tools (#1639) (6c5f87c2e)

## 0.5.0 (2026-11-09)

### Features

- feat(api): record free accounts by default until they opt out (#1543) (9dba60326)
- feat(api-billing): Add read-only list-cases lifecycle operation (#1611) (57c14cf56)
- feat(api-billing): Label open cases by attribution and add age gauge (#1607) (195e6fa92)
- feat(filesystem, desktop): Import a desktop folder or opened file by copying it host-side (W7.4) (#1584) (2305062c9)
- feat(api): Measure gateway upload, admission and first-step prompt-cache hits (#1578) (5321d3e8a)
- feat(filesystem, ui, api): Confirm editor saves before close and stream exports and publications (W12) (#1581) (be2ffdbcc)
- feat(revisions): Honour the checkout's own Git ignore rules on both legs (#1572) (a01585196)

### Fixes

- fix(api-billing): Refuse new collection only for an account a spend-blocking case names (#1614) (805d4d7f6)
- fix(ui): Light the Terminal's text on macOS and turn on ls colours (#1592) (a25024279)
- fix(api): Boot without a tariff and pause only billing (#1593) (bec7e7673)
- fix: report a failed Linux sandbox setup as not started, give shell cleanup a realistic deadline, and stop the location chip loop from #1558 (#1586) (595c1737d)
- fix(revisions): Give the compute worker realm its own Buffer global (#1505) (5476c70ba)
- fix(api): Idle the billing workers while Tau Cloud is off instead of exiting (#1548) (2a8303d86)

### Performance

- perf(api-llm-gateway): Sign Vertex bearer tokens locally instead of exchanging them (#1599) (2e4140a92)
- perf(api-llm-gateway): Reuse the Vertex access token across requests (#1590) (9ea11f5e2)

### Other changes

- docs(www): simplify legal documents and describe agent recording (#1457) (d2d039df7)
- ci(nx): Read and write the self-hosted Nx remote cache (#1603) (e59e3bd22)
- refactor(api): Split the API into ten module libraries and run only affected package tests (#1576) (735d178dc)
- ci(root): Run the standalone oracles only when they are affected, plus nightly (#1549) (6fc04b8d6)
- refactor(chat): share the model catalog wire schema so the UI stops importing the API (#1568) (cb1b424f4)
- test(api): pin the HTTP route table and schema-migration parity before the library split (#1565) (d5387548a)

## 0.4.0 (2026-11-08)

### Features

- feat(filesystem, revisions): Land desktop large objects by cloning them from the repository's store (W11.3) (#1564) (8a2e24c9a)
- feat(billing): Expire plan credits when Pro ends (#1536) (bf5b12040)
- feat(revisions): One .gitattributes-derived large-object rule on both legs, and native large-object read/store (W11.2) (#1561) (a98ac1f16)
- feat(filesystem, revisions, ui): Stage a linked GitHub import in the worker and build its first revision from recorded blob ids (W7.3) (#1545) (4ad3a41e0)
- feat(billing): Update billing terms and pass provider prices through (#1535) (3a1a77218)
- feat(filesystem, ui, api): Import a GitHub archive through the worker's staging, measured once from its read-back (W7.2) (#1524) (c7cc6bdef)
- feat(agent-tools, lsp-fs): Search and probe the Project Index instead of walking (W9) (#1523) (b38008c62)
- feat(filesystem): Desktop parity with batched Node writes, an incremental native mint and lazy large objects (W11) (#1522) (56e03caeb)
- feat(filesystem): Stream a disk import through staging on the compute worker (W7.1) (#1521) (f61685bf3)
- feat(revisions): Capture from index changes, stream LFS downloads and pace mints (W6.4) (#1517) (9aa5546fc)
- feat(ui): Staging browser tracing and Chromium crash/CSP reports (SB17, SB6) (#1516) (ddc45b47a)

### Fixes

- fix(api): Write the runtime.operation event without the request's fields (#1539) (020b9d3d5)
- fix(picogk): Keep the PicoGK browser runtime at one address across deploys (#1567) (d280df612)
- fix(billing): Treat a portal return as a billing update and close the checkout return defects (#1551) (62afa4b9a)
- fix(manifold): Label normals on a setMaterial part that several glTF nodes share (#1534) (067e7cdfd)
- fix: Close the kernel batching and budget audit findings (#1528) (bf8542254)
- fix(api): keep a deleted project's agent traces until retention expires them (#1526) (5ec390f16)

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
- feat(revisions): Compute worker, pack Range serving and the catalogue cold open (W5) (#1449) (7eb3193c2)
- feat(ui): Render captures with the light scheme's black edges (#1452) (396626a1e)

### Fixes

- fix(revisions): Read a moved ref from the server's compare-and-set, never from a held lock (W6.2) (#1511) (ce1488c0a)
- fix(telemetry): Fix two T12 re-run defects (machine entries from tau mcp, CLI export transcoder) (#1464) (fbffcbb41)
- fix(native-process-core): Start the sandbox again when its Linux bridge is slow (#1497) (624306ee9)
- fix(api): Boot without Better Auth CLI noise; report real worker errors (#1492) (106c7bde0)
- fix(api): settle a failed evidence delivery attempt on its own row (#1478) (2347b1b07)
- fix(api): Ignore a repeated SIGTERM or SIGINT during the graceful drain (W1) (#1471) (0912a9fc8)
- fix(tscircuit): Give every part a 3D body, show enum view options, end the pin-number flicker, edge the board by toggle (#1450) (e24ddec85)
- fix(api): Confirm Langfuse erasure on the v2 observations read and alert on stuck rechecks (W0) (#1462) (5e5dd13ac)
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

- feat(filesystem): Split metadata from content and keep a validated Project Index (W3) (#1443) (f55d4a097)
- feat(image): Draw card thumbnails from the viewer render profile's card edge weight (#1442) (1b9e943c3)
- feat(revisions): Keep .git off the pipeline with Tau's own pack reader and object store (W2) (#1441) (00410dfd3)
- feat(tscircuit): real KiCad parts, layer-built 3D boards and themed PCB and schematic views (#1422) (e48adb095)
- feat(image): Render captures from one viewer render profile on nanoraster 0.9 (#1414) (7cc511237)
- feat(filesystem): Make the changeset the only mutation, with one lock set, one event and one notice each (W1) (#1429) (22d06913f)

### Fixes

- fix(ui): Keep sign-in and app links on the host the page loaded from (#1454) (4dd3140d4)
- fix(desktop): run native kernel workers through Tau's own bwrap on Linux (#1408) (e57844129)
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
