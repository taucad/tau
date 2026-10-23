# Spike W2 — Windows MXC `processcontainer` S1 isolation

Dev-only evidence harness for the desktop Bash/Terminal blueprint, ratification §RQ5. It proves (or
records the typed infeasibility of) the ratified Windows `ShellProvider` target: **Microsoft MXC
(Microsoft eXecution Containers) `processcontainer`** over the Windows process security environment
(PSEC), on `windows-2025` (hosted Server 2025, build ~26100 / 24H2-equivalent).

Nothing here is shipped or exported by the package. The workflow is
`.github/workflows/spike-w2-win-mxc.yml`. The scripts are standalone so the later Win11 Eval VM lane
can reuse them.

## What is pinned (`pin.json`)

| Field              | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Node SDK           | `@microsoft/mxc-sdk@1.0.1` (publishers `microsoft1es`, `microsoft-oss-releases`)                  |
| Licence            | **MIT**                                                                                           |
| Registry integrity | `sha512-2cP925G5+lQyKzjBVha8uNtVd7XESgDBtgi1yCYYSo9M3xiFyZWtCO4SWPGTk509rdI6nqjyGcZxvEP3t6l8Hg==` |
| Registry shasum    | `f1a4859f7810b34f01a238c98166012a5d63a3fb` (re-verified against the downloaded tarball)           |
| Entry              | `@microsoft/mxc-sdk/v1`                                                                           |
| Runtime deps       | `koffi` (FFI), `semver`, `node-pty`                                                               |
| Node engine        | `>= 24.0.0`                                                                                       |
| Spec upstream      | `github.com/microsoft/mxc` revision `b2112016…` (ratification §RQ5, Brain commit `96d2e015`)      |

`provision.mts` binds the receipt to **real bytes on the host**: it records the installed version
(gated `== 1.0.1`), the MIT licence, the registry integrity/shasum from `pin.json`, and the SHA-256
of the resolved native `wxc-exec` executable (`findWxcExecutable()`), which is the binding digest
over and above the registry integrity.

> The ratification pins the upstream `microsoft/mxc` **source** at `b2112016…`. The artifact Tau
> actually consumes is the published Node SDK above; that is what is pinned and digested here.

## The real SDK surface this harness targets (`@microsoft/mxc-sdk/v1`)

Confirmed from the pinned package's own type declarations:

- `getPlatformSupport() → { isSupported, availableMethods, isolationTier, uiCapabilities }`
- `getAvailableBackends() → AvailableBackend[]`
- `probe(request?) → { tier, needsDaclAugmentation, warnings, probes: ProbeFacts }` (Windows-only,
  synchronous, creates no container)
- `run(ContainerRequest) / spawnWithPty(...)` — the **one-shot** APIs the `processcontainer` backend
  uses (`destroyOnExit`, kill-on-close)
- `ContainerRequest.containment = { type: 'processcontainer', config }`,
  `filesystem: { readwritePaths, readonlyPaths, deniedPaths, clearPolicyOnExit }`,
  directional `network: { egress, ingress: { hostLoopback } , runtimeConfig: { networkProxy } }`

`ProbeFacts` carries the capability facts this lane reports, notably
`baseContainerApiPresent` (PSEC API present), **`baseContainerSupportsDenyPaths`** (the
`PSE_SUPPORT_FS_DENY` capability), `baseContainerSupportsIdentitylessLoopbackProxy`,
`baseContainerSupportsIngressHostLoopbackAllow`, and `isolationSessionAvailable`.

## Evidence discipline

- **External observation only.** Every allow/deny verdict is decided by an out-of-container
  observer — a file digest the harness placed on the host, or a credential-authenticated loopback
  listener's own request log — never by a trusted in-container error string or exit code.
- **Preflight sentinel.** `probe.mts` launches a real `processcontainer` whose child writes a nonce
  to an out-of-container read-write path; the probe counts as "ran inside a container" only when the
  host sees that nonce. An unavailable prerequisite is a typed `{ available: false, reason }` state
  and a **failed** check — never a skip, never an unsupported-platform green.
- **Positive controls.** `isolation.mts` first proves each container CAN read/write its own roots and
  reach its own proxy, so "everything denied because the container did nothing" cannot masquerade as
  isolation.
- **Receipts** (`$RUNNER_TEMP/mxc-spike/*.receipt.json`) bind MXC revision + SDK digest + licence +
  OS build + source SHA to every observation.

## The isolation receipt (`isolation.mts`) — two concurrent containers

Sessions A and B run **concurrently** (two live containers), each with its own read-only /
read-write / deny lists, private HOME and temp, an approved folder, and its own proxy canary:

| check             | proven by (external)                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `iso.read.cross`  | A's exfiltration output never contains B's secret, and vice-versa                                |
| `iso.write.cross` | B's secret-file digests unchanged and no tamper file in B's roots, and vice-versa                |
| `iso.proxy.cross` | the OTHER session's listener logs a refusal (401) and never releases its secret                  |
| `iso.reaping`     | a session-escaping, TERM-ignoring writer's sentinel **stops growing** after the foreground exits |

`iso.proxy.cross` exercises the **Tau-side** proxy-auth requirement, not MXC: MXC shares loopback
bidirectionally between containers, so denial comes from the per-session bearer token, proven by the
other listener's log. The two proxies are distinct credential-authenticated loopback canaries.

When `baseContainerSupportsDenyPaths` is **false**, `deniedPaths` are omitted from the request and
`iso.read.cross` is annotated: the read isolation then reflects the ambient DACL, not an MXC deny
list — a typed limit, not a silent pass.

## Fallback (`fallback.mts` + `fallback.ps1`) — taken where the MXC probe fails on the row

Proves Codex's elevated-backend design instead: a **`WRITE_RESTRICTED` token per session whose
restricting SIDs include a per-session capability SID** (derived via
`DeriveCapabilitySidsFromName`), plus **Tau deny-read ACEs** for the other session's capability SID.
Verified externally (host thread, after `RevertToSelf`):

- `fallback.write.own` / `fallback.write.cross` — a write lands only where the capability SID has an
  ACE, so writes are isolated **without** deny ACEs.
- `fallback.read.cross` — `WRITE_RESTRICTED` does not gate reads, so cross-reads are isolated **only
  if the deny-read ACE holds**; where it does not, sessions must serialize per device
  (`session-limit`). This is exactly the ratification's caveat.

A missing capability API is a typed prerequisite failure, not a green.

## Running

CI: `workflow_dispatch`, or any PR touching `mxc/**` or the workflow. The job installs the pinned
SDK, provisions, probes, then — gated on the probe — collects either the isolation receipt or the
capability-SID fallback, summarizes to the step summary, and uploads the receipts. The row never
goes green on an absent prerequisite.

Local (Windows, Node ≥ 24): `npm install` in this directory, then
`node provision.mts && node probe.mts && node isolation.mts` (or `node fallback.mts`).

## Not proven / open

- Microsoft publishes **no formal security-boundary commitment for the process tier**. Container-to-
  container isolation is this receipt, never an assumption.
- Architectural finding for the design note: in the pinned SDK, `processcontainer` is a **one-shot**
  backend (not in `LifecycleContainmentKind`), so a persistent Tau session is modelled as a
  supervisor owning repeated one-shot `processcontainer` execs. The SDK's **`isolation_session`**
  backend, by contrast, mints a **distinct per-instance agent user account + SID**
  (`IsolationSessionProvisionMetadata`) — the distinct security identity §RQ5 noted `processcontainer`
  does not document. The design note weighs this.
