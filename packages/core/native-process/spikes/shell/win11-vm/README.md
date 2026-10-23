# Spike W2 — consumer Windows 11 standard-user Bash lane

This lane closes the acceptance gap Spike W1 cannot: running the sandboxed-Bash harness on a
**genuine Windows 11 install, as a real standard (non-administrator) user, under stock security
(Defender / SmartScreen / UAC all ON)**, with the out-of-root fixture placed where **consumer
per-user profile isolation actually applies** — inside the invoking user's `%USERPROFILE%`.

It runs the **existing, unmodified** harness
`packages/core/native-process/spikes/shell/fs-net-probe.mts` (S0 + S1). Nothing in `lib.mts` or
`fs-net-probe.mts` is edited.

## The question this lane settles

SRT 0.0.75's Windows backend (`@anthropic-ai/sandbox-runtime`, `dist/sandbox/windows-sandbox-utils.js`)
runs the sandboxed child as a dedicated local user `srt-sandbox` via `CreateProcessWithLogonW`, with:

- a **WFP egress fence** keyed on the `srt-sandbox` SID (a real deny-by-default for **network**);
- **additive filesystem ACEs**: `allowRead`/`allowWrite` add explicit ALLOW ACEs for the sandbox
  user on named paths; `denyRead`/`denyWrite` add explicit DENY ACEs on named paths; and
- a kill-on-close Job + ambient **write**-deny stamping on world-writable system dirs.

There is **no general filesystem read-mask**. `srt-sandbox` is a member of `BUILTIN\Users`
(`in_builtin_users: true`) and has, in the backend's own words, "no inherent rights on real-user-owned
files." So whether the sandboxed child can **read an out-of-root path is governed entirely by that
path's ambient NTFS DACL**, not by SRT.

That is why the hosted `windows-2025` runner showed the S0 out-of-root read **succeeding**: its
workspace (`D:\a\...`) is `BUILTIN\Users`-readable, so `srt-sandbox` (a Users member) could read it.
The crux is whether that reproduces on a **consumer** box where the fixture lives in a second standard
user's profile — whose ACL does **not** grant `BUILTIN\Users`. This lane gets the real receipt.

## Fixture placement (the load-bearing mechanism — no harness edit)

`lib.mts` `fixtureRoot()` is:

```
process.env.RUNNER_TEMP ?? join(homedir(), '.tau-shell-spike')
```

So the override the harness already exposes is simply **leaving `RUNNER_TEMP` unset**. `run-harness.ps1`
clears `RUNNER_TEMP` before invoking the probe, so the fixture — including the out-of-root
`outside/secret.txt` — lands in the invoking standard user's `%USERPROFILE%\.tau-shell-spike`, exactly
where consumer profile isolation applies. `TAU_SPIKE_OUT` (receipts) is set separately to the host drop
share and never governs the fixture root. No change to `lib.mts`/`fs-net-probe.mts` is required.

## Image + license basis (recorded, no secrets)

There is **no stable, digest-pinnable, license-clean public _consumer_ (retail SKU) Win11 ISO URL**:
Microsoft's retail ISO uses short-lived tokenized download URLs and carries no evaluation license for
unattended CI. The only CI-usable public image is the **Windows 11 Enterprise _Evaluation_ ISO**
(90-day Microsoft evaluation license, registration-gated dynamic URL, not digest-stable).

For the profile-isolation question the SKU is **immaterial**: per-user `%USERPROFILE%` NTFS ACLs
(`SYSTEM` + `Administrators` + the owning user; `BUILTIN\Users` is **not** inherited into a user's
profile) are identical across Win11 SKUs. The Enterprise-eval image therefore answers the consumer
question faithfully for this test.

To avoid embedding a dynamic URL or any secret, the ISO is supplied by an operator at dispatch via the
`iso_url` + `iso_sha256` workflow inputs (digest verified before boot; `image.json` records the exact
URL + digest + license basis into the artifact). **With no ISO supplied (the default, and every
`pull_request` run) the job records an `image-unavailable` blocker receipt and fails** — it is never
green without a real VM run (desktop-spike testing rule 6: an unavailable prerequisite is not a pass).

## Stock security is preserved (what is and is NOT disabled)

- **UAC stays enabled** (`EnableLUA` untouched). The one elevated action (`srt-win install`) is done
  by the **built-in Administrator** (RID-500), which by Windows default is not in Admin Approval Mode,
  so it elevates without an interactive prompt — modelling "the install is a one-time elevated action"
  without disabling UAC and without running the sandboxed workload elevated.
- **Defender / SmartScreen are not disabled.** The boundary under test is SRT's, not Defender's.
- **TPM 2.0 and Secure Boot are satisfied by the host** (swtpm vTPM + OVMF secure-boot firmware with
  Microsoft keys), so **no registry check-bypass** is used — the guest is a stock Win11 install.
- The **harness runs as the genuine standard user `spikeuser`** (Users group only; the runner asserts
  it is not an Administrator and not elevated — see `whoami.txt` / `run-context.json` in the artifact).
- Credentials are **synthetic, VM-local, disposable**. No secret appears in any command, log, fixture,
  or receipt.

## Files

| File                                                     | Role                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `../../../../../.github/workflows/spike-w2-win11-vm.yml` | The workflow (triggers: `workflow_dispatch` + `pull_request`).                                                                        |
| `preflight-kvm.sh`                                       | Fails the row if `/dev/kvm` is absent (recorded blocker, never a skip).                                                               |
| `acquire-iso.sh`                                         | Fetch + digest-verify the operator ISO, or record the image-unavailable blocker.                                                      |
| `make-seed-iso.sh`                                       | Build the `autounattend.xml` seed CD.                                                                                                 |
| `autounattend.xml`                                       | Unattended Win11 install; stock security; built-in Administrator provisions.                                                          |
| `provision.ps1`                                          | (elevated, RID-500) Node + pinned Git Bash + `srt-win install`; creates `spikeuser`; `pnpm install`; arms the harness as `spikeuser`. |
| `run-harness.ps1`                                        | (standard `spikeuser`) runs the unmodified probe with `RUNNER_TEMP` cleared; drops receipts + `DONE`.                                 |
| `boot-vm.sh`                                             | Host driver: QEMU/KVM + OVMF + swtpm + slirp-SMB; waits for `DONE`; collects receipts; fail-closed on timeout.                        |
| `summarize-vm.sh`                                        | Renders the WIN11 row into the step summary.                                                                                          |

## Verification status

The scripts are a complete, honest implementation of the lane, but the end-to-end Win11-in-QEMU flow
(unattended install → provisioning → standard-user harness run) has **not been executed to a green
receipt in-session**; it runs in CI when an operator supplies an eval ISO via `workflow_dispatch`, and
on `pull_request` it deterministically records the `image-unavailable` blocker. Known fragility points,
each fail-closed (they produce a recorded failure, never a false green): the autounattend edition name
must match the supplied ISO; slirp-SMB guest-auth on stock Win11; and the in-guest `pnpm install`
runtime against the 105-minute inner budget. The decisive architectural answer (above) is derived
directly from the vendored SRT source and holds regardless of the CI run.
