# Spike W2 — Linux stock-VM netns confirmation + Tau-scoped AppArmor profile

This lane settles whether Tau can run its sandboxed Bash on **stock** Ubuntu 24.04 / Debian 13
**without** the global relaxation `kernel.apparmor_restrict_unprivileged_userns=0` that Tau's own
`setup-linux-sandbox` applies — a system-wide weakening the desktop-Bash program forbids.

It runs the **existing, unmodified** harness
`packages/core/native-process/spikes/shell/fs-net-probe.mts` inside a genuine stock cloud-image VM,
in three phases, with the AppArmor unprivileged-userns sysctl left at its **shipped value** the
whole time. The lane is **image-agnostic**: the same three phases run unchanged on an Ubuntu 24.04 or
a Debian 13 cloud image (selected by the `distro` dispatch input — see **Running the rows**).

## The finding this lane resolves

`@anthropic-ai/sandbox-runtime` 0.0.75 always issues `bwrap --unshare-net` and brings loopback up in
the fresh network namespace (`RTM_NEWADDR` to add `127.0.0.1/8` to `lo`) — even for a **deny-all**
egress profile. Bringing `lo` up needs `CAP_NET_ADMIN` in the namespace.

Ubuntu 24.04 / Debian 13 ship `kernel.apparmor_restrict_unprivileged_userns=1`. Under it the kernel
still lets an unprivileged process `unshare(CLONE_NEWUSER)`, but **strips the capabilities** from the
resulting user namespace **unless the executing binary has an AppArmor profile carrying `userns,`**.
With the caps stripped, loopback setup fails:

```
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
```

and the sandbox never launches. The distro ships exactly the exempting profile for **its** bwrap
(`/etc/apparmor.d/bwrap-userns-restrict` → `profile bwrap /usr/bin/bwrap flags=(unconfined) { userns, }`),
which is why `apt install bubblewrap` + `/usr/bin/bwrap` keeps working. **Tau does not run the distro
bwrap:** an Electron desktop app ships its own bwrap bundled under its install prefix
(`/opt/<App>/…`), a path the stock profile does not match — so Tau's bundled bwrap falls under the
restriction and loopback setup fails. (`sandbox-runtime`'s own README names the two escapes: set the
sysctl to 0 — forbidden here — **or** "add an AppArmor profile that grants `userns` to the relevant
binaries" — this lane.)

## The three phases (real receipts)

The in-guest orchestrator (`run-in-guest.sh`) runs the unmodified harness three times and also
captures a **direct** `bwrap` loopback repro each time (the exact error string, independent of the
harness):

| Phase        | Row                | bwrap path                         | Profile                                  | Expected                                    |
| ------------ | ------------------ | ---------------------------------- | ---------------------------------------- | ------------------------------------------- |
| A — confirm  | `LNX-VM-NOPROFILE` | `/opt/Tau/resources/sandbox/bwrap` | none                                     | `RTM_NEWADDR` EPERM → `sandbox-unavailable` |
| B — profile  | `LNX-VM-PROFILE`   | same                               | `tau-bwrap` loaded via `apparmor_parser` | loopback OK → real S0/S1                    |
| C — AppImage | `LNX-VM-APPIMAGE`  | AppImage mount path                | none (no install step)                   | blocked, like A                             |

`apparmor_restrict_unprivileged_userns` stays at its shipped value in **all three** (recorded in
`context.json` and `apparmor_parser.log`). The decisive proof is **A blocked + B launches, sysctl
unchanged**.

The repro and harness run as an **unprivileged user** (`tau`), not root: the AppArmor restriction only
strips capabilities from _unprivileged_ user namespaces, so running as root (cloud-init's default) would
bypass the restriction and make every phase spuriously succeed. The guest also installs the repo's Node
(>= 24, because the harness runs `node fs-net-probe.mts` and only Node 24 strips `.mts` natively) and
`ripgrep` (a hard `SandboxManager.initialize` dependency).

### Two bwrap paths: the direct repro vs. the harness

The **direct loopback repro** execs Tau's bundled bwrap at the phase's own path (`/opt/Tau/...` for A/B,
the AppImage mount path for C) — it tests exactly the path-scoped behaviour the profile targets.

The **harness** reuses the UNMODIFIED `supervisor.mts`, which spawns the sandbox with a hardcoded
`env PATH=/usr/bin:/bin`. SRT therefore always resolves `bwrap` to **`/usr/bin/bwrap`**, regardless of
where Tau's bundled copy lives, and `shellProfile` in `lib.mts` sets no `bwrapPath` the spike could
override without editing a non-owned file. So to obtain the full-sandbox S0/S1 receipt for goal 2, Phase
B also loads a **spike-only** profile granting `userns,` to `/usr/bin/bwrap` (`tau-bwrap-spike-usrbin`,
generated in `run-in-guest.sh`, unloaded before Phase C). In **production** this shim is unnecessary: Tau
points SRT at its bundled bwrap (via `bwrapPath` or `PATH`) and the shipped `apparmor/tau-bwrap` profile —
attached to the bundled path — applies. The mechanism (grant `userns,` to the bwrap binary the sandbox
execs, via `apparmor_parser` at install time, sysctl untouched) is identical.

## The Tau-scoped AppArmor profile

`apparmor/tau-bwrap` — attaches **only** to Tau's bundled bwrap path and grants it `userns,`:

```
abi <abi/4.0>,
include <tunables/global>

profile tau-bwrap /opt/Tau/resources/sandbox/bwrap flags=(unconfined) {
  userns,
  include if exists <local/tau-bwrap>
}
```

What it is and is not:

- **Scoped, not global.** Attachment is a single absolute path; no other binary and no system default
  changes behaviour. It does **not** touch `apparmor_restrict_unprivileged_userns` (stays 1).
- **The Electron-app pattern.** Installed by `apparmor_parser` in the `.deb` `postinst` (install-time,
  elevated once — **not** running the sandboxed workload elevated). Google Chrome ships the identical
  shape at `/etc/apparmor.d/chrome` for `/opt/google/chrome/chrome`.
- **One profile covers `apply-seccomp` too.** SRT's seccomp helper creates its own nested userns but
  runs as a descendant _inside_ bwrap's namespace under this profile's label; `flags=(unconfined)` +
  `userns,` grants the nested userns the same way Chrome's single profile covers its zygote children.
- `flags=(unconfined)` mirrors the distro bwrap profile exactly; the safety is the narrow attachment,
  not internal confinement. A fully enumerated confined profile is possible but would have to re-derive
  bwrap's entire mount/cap/bind surface — the distro itself chose this form.

**Change the single path** in `apparmor/tau-bwrap` to match the real `productName`/prefix of the Tau
`.deb`, and keep it in sync with the `postinst` and the `bwrapPath` Tau passes to `sandbox-runtime`.

## Packaging recommendation (Linux containment)

- **`.deb` (and `.rpm`): ship the scoped AppArmor profile and load it in `postinst`
  (`apparmor_parser -r -W /etc/apparmor.d/tau-bwrap`), remove it in `postrm`.** This is the supported,
  non-global path: Tau runs on stock Ubuntu 24.04 / Debian 13 with the sysctl untouched. No per-user
  action, no global relaxation.
- **AppImage: a scoped profile does not help.** An AppImage runs no install step, mounts its bwrap at a
  randomised `/tmp/.mount_*` path each launch, and so can never carry a matching AppArmor profile. Under
  stock security its bundled bwrap is blocked (Phase C). AppImage therefore needs a **different
  containment story**: prefer the **distro `/usr/bin/bwrap`** (already profiled) when present, or ship a
  first-run helper that installs a profile with a stable attachment path (defeats AppImage's
  no-install promise), or fall back to a non-userns boundary. The clean recommendation is **the `.deb`
  as the containment-bearing Linux artifact**, with AppImage treated as best-effort / unsupported for
  the sandbox on stock 24.04+.

## Running the rows (Ubuntu / Debian 13)

The lane is image-agnostic, so the two distros are expressed as a single `workflow_dispatch` input
rather than duplicated jobs:

- **Ubuntu 24.04 (default).** Dispatch with `distro=ubuntu-2404` (or just defaults; `pull_request`
  runs use it too). Acquires `ubuntu-24.04-server-cloudimg-amd64.img` from `cloud-images.ubuntu.com`,
  verified against the publisher `SHA256SUMS`. Artifact `shell-spike-LNX-VM`.
- **Debian 13 / trixie.** Dispatch with `distro=debian-13`. Acquires
  `debian-13-generic-amd64.qcow2` from `cloud.debian.org`, verified against the publisher
  `SHA512SUMS` (Debian ships no `SHA256SUMS` in that dir). Artifact `shell-spike-LNX-VM-debian-13`.
  This row exists to confirm the AppArmor-profile approach **generalizes beyond Ubuntu**.

`acquire-image.sh` picks the per-distro stock URL + checksum algorithm from `DISTRO`; `image_url` /
`image_sha256` still override it. `image_url` is constrained to `https` on an allow-listed publisher
host (`cloud-images.ubuntu.com`, `cloud.debian.org`) as an SSRF guard — the checksum file is fetched
from the same host. Nothing distro-specific lives in the guest orchestrator: `run-in-guest.sh` reads
`/etc/os-release`, provisions via `apt`, and records the **as-booted** sysctl value untouched, so the
three phases and their verdicts are identical across the two images.

## KVM reality

`preflight-kvm.sh` reports the `/dev/kvm` verdict (a first-class output of this lane). A cloud image
boots in minutes even under QEMU **TCG** software emulation, so a missing `/dev/kvm` is **not** a hard
blocker here (unlike the Win11 lane): the lane falls back to TCG with a longer inner deadline and
**records the accelerator used** in every receipt. `allow_tcg=false` turns a missing `/dev/kvm` into a
recorded `kvm-unavailable` blocker instead. Under TCG the 9p-shared `node_modules` read path is slow;
if the lane times out under TCG that is itself the signal that the VM rows want self-hosted / larger
(KVM-bearing) runners.

## Files

- `../fs-net-probe.mts` — the **unmodified** harness this lane invokes by path (not edited).
- `apparmor/tau-bwrap` — the Tau-scoped AppArmor profile (the key artifact).
- `cloud-init/{user-data,meta-data}` — NoCloud seed: mounts the 9p shares, provisions, runs the
  orchestrator, powers off.
- `preflight-kvm.sh`, `acquire-image.sh` (distro-aware: Ubuntu/Debian stock image + publisher
  checksum, SSRF allow-list), `make-seed-iso.sh`, `boot-vm.sh`, `summarize-vm.sh` — host-side lane steps.
- `run-in-guest.sh` — the in-guest three-phase orchestrator (image-agnostic).

No secrets: the only credential is a synthetic VM-local console password; the host↔guest channel is
the 9p drop share, not the network.
