/**
 * W2 MXC provisioning receipt. Verifies the installed `@microsoft/mxc-sdk` matches the committed
 * `pin.json` (exact version), records the licence, the registry integrity/shasum, the resolved
 * native `wxc-exec` on-disk digest, and the OS build. Nothing is faked: a missing or mismatched SDK
 * is written as a failed receipt with a typed prerequisite reason, and the process exits non-zero so
 * the workflow row fails rather than going green.
 *
 * Run on windows-2025 after `npm install` in this directory.
 */
import { join } from 'node:path';

import { type Check, check, laneIdentity, loadSdk, outDir, readPin, wxcExecDigest, writeJson } from './mxc-lib.mts';

const main = async (): Promise<void> => {
  const pin = readPin();
  const { sdk, prereq } = await loadSdk();
  const checks: Check[] = [];

  checks.push(
    check(
      'mxc.sdk.present',
      `${pin.nodeSdk.name} importable from this spike`,
      prereq.available ? 'imported' : (prereq.reason ?? 'absent'),
      prereq.available,
      prereq.detail,
    ),
  );

  // Exact-version gate. The installed package's own package.json (read by the loader) is the source
  // of truth for what is on disk; the committed integrity/shasum bind what that version resolved to
  // at publish time.
  const installedVersion = sdk?.packageVersion ?? 'not-loaded';
  checks.push(
    check(
      'mxc.sdk.version',
      `installed == pinned ${pin.nodeSdk.version}`,
      installedVersion,
      installedVersion === pin.nodeSdk.version,
    ),
  );

  // Native binding digest: the executable the SDK would launch. Recorded when resolvable, but
  // INFORMATIONAL (not gating): the pin is authoritatively bound by the exact version plus the
  // committed registry integrity/shasum (re-verified offline against the tarball). findWxcExecutable
  // can legitimately return null on a host/arch where the native backend ships no binary (e.g. the
  // hosted runner where PSEC is absent), and that must not fail the provision gate.
  const wxc = wxcExecDigest(sdk);
  checks.push(
    check(
      'mxc.wxcExec.digest',
      'native wxc-exec resolvable and digestible (informational; pin is bound by version + integrity)',
      wxc ? `${wxc.path} sha256=${wxc.sha256.slice(0, 16)}…` : 'not found (non-gating)',
      true,
      wxc ?? { resolved: false },
    ),
  );

  // The gate is the authoritative pin: the SDK imported AND its installed version equals the pin.
  const gating = checks.filter((c) => c.id === 'mxc.sdk.present' || c.id === 'mxc.sdk.version');
  const receipt = {
    kind: 'provision',
    identity: laneIdentity(sdk),
    pin: {
      sdk: pin.nodeSdk,
      specRevisionPrefix: pin.spec.upstreamRevisionPrefix,
      specRepo: pin.spec.upstreamRepo,
    },
    installedVersion,
    license: pin.nodeSdk.license,
    wxcExec: wxc ?? null,
    checks,
    verdict: gating.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  };
  const path = join(outDir(), 'provision.receipt.json');
  writeJson(path, receipt);
  // eslint-disable-next-line no-console
  console.log(`[mxc:provision] ${receipt.verdict} — ${installedVersion} (${pin.nodeSdk.license}) → ${path}`);
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

await main();
