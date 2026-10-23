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

  // Native binding digest: the executable the SDK actually launches. This is the digest that binds
  // the receipt to real bytes on this host, over and above the registry integrity in pin.json.
  const wxc = wxcExecDigest(sdk);
  checks.push(
    check(
      'mxc.wxcExec.digest',
      'native wxc-exec resolvable and digestible',
      wxc ? `${wxc.path} sha256=${wxc.sha256.slice(0, 16)}…` : 'not found',
      Boolean(wxc),
      wxc,
    ),
  );

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
    verdict: checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
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
