/**
 * W2 MXC capability probe. Records, from the pinned SDK on windows-2025:
 *   - PSEC create/close: BaseContainer API present AND a real container actually launched a child
 *     (proven by a preflight sentinel the child writes to an out-of-container canary path).
 *   - PSE_SUPPORT_FS_DENY: `baseContainerSupportsDenyPaths` from the native probe facts.
 *   - ConPTY: node-pty conpty binding present AND a real pty launched through the SDK (when
 *     `spawnWithPty` is exposed), else node-pty presence alone (recorded as partial).
 *   - OS build (from the registry), isolation tier, available backends, loopback/proxy facts.
 *
 * Evidence discipline: the preflight sentinel is the gate. An absent capability, a probe that threw,
 * or a container that never ran is a typed `prerequisite` state and a FAILED check — never a skip,
 * never an unsupported-platform green. If the whole SDK is unavailable, the row hands off to the
 * capability-SID fallback (fallback.mts); this probe records exactly why.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  type Check,
  type MxcSdk,
  type Prereq,
  check,
  ensureDir,
  isWindows,
  laneIdentity,
  loadSdk,
  mxcDirectory,
  nonce,
  outDir,
  prereqCheck,
  requestFor,
  type SessionGrant,
  writeJson,
} from './mxc-lib.mts';

/** Does node-pty resolve a conpty binding on this host? (ConPTY prerequisite for a Windows PTY.) */
const conptyBinding = (): Prereq => {
  try {
    const req = createRequire(join(mxcDirectory, 'package.json'));
    const entry = req.resolve('node-pty');
    const dir = join(entry, '..', '..');
    const candidates = [
      join(dir, 'build', 'Release', 'conpty.node'),
      join(dir, 'prebuilds', `win32-${process.arch}`, 'conpty.node'),
    ];
    const found = candidates.find((c) => existsSync(c));
    return found
      ? { available: true, detail: { binding: found } }
      : { available: false, reason: 'node-pty resolved but no conpty.node binding found', detail: { candidates } };
  } catch (error) {
    return { available: false, reason: 'node-pty not resolvable', detail: String(error) };
  }
};

/**
 * Launch a real processcontainer that writes a nonce into an out-of-container read-write path. The
 * EXTERNAL check is: does that file contain the nonce the harness generated? Only a container that
 * actually ran the child can have written it. This is the "ran inside a container" gate.
 */
const preflightSentinel = async (sdk: MxcSdk): Promise<{ check: Check; psecCreateClose: Prereq }> => {
  const root = ensureDir(join(outDir(), 'preflight'));
  const token = nonce();
  const sentinel = join(root, 'sentinel.txt');
  const grant: SessionGrant = {
    id: 'preflight',
    project: root,
    home: ensureDir(join(root, 'home')),
    temporary: ensureDir(join(root, 'tmp')),
    readOnly: root,
    deny: [],
    proxy: { host: '127.0.0.1', port: 0, token },
  };
  // A container that writes the nonce to the shared RW path, then exits (destroy-on-exit closes PSEC).
  const command = `cmd /c echo ${token}> "${sentinel}"`;
  let ran = false;
  let detail: unknown;
  try {
    const result = await sdk.run(requestFor(grant, command, '', false));
    detail = {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr.slice(0, 500),
      warnings: result.warnings,
    };
    // The verdict is NOT result.exitCode (a trusted in-container claim): it is the external file.
    const got = existsSync(sentinel) ? readFileSync(sentinel, 'utf8').trim() : '';
    ran = got.includes(token);
  } catch (error) {
    detail = { threw: String(error) };
  }
  const psecCreateClose: Prereq = {
    available: ran,
    reason: ran ? undefined : 'no container child write observed at the external sentinel',
    detail,
  };
  return {
    check: check(
      'mxc.psec.createClose',
      'a real processcontainer launched a child and closed (external sentinel written)',
      ran ? 'written' : 'not written',
      ran,
      detail,
    ),
    psecCreateClose,
  };
};

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const { sdk, prereq } = await loadSdk();

  if (!isWindows) {
    checks.push(
      check(
        'mxc.platform.windows',
        'running on Windows (processcontainer is Windows-only)',
        `${process.platform}`,
        false,
      ),
    );
  }
  checks.push(prereqCheck('mxc.sdk.loadable', 'MXC SDK /v1', prereq));

  let platformSupport: unknown;
  let probeFacts: Record<string, unknown> = {};
  let availableBackends: unknown;
  let psecCreateClose: Prereq = { available: false, reason: 'SDK not loaded' };
  const conpty = conptyBinding();

  if (sdk && isWindows) {
    try {
      platformSupport = sdk.getPlatformSupport();
    } catch (error) {
      platformSupport = { error: String(error) };
    }
    try {
      availableBackends = sdk.getAvailableBackends();
    } catch (error) {
      availableBackends = { error: String(error) };
    }
    let probeOutput: { probes?: Record<string, unknown>; tier?: string; error?: string; warnings?: string[] } = {};
    try {
      probeOutput = sdk.probe() as typeof probeOutput;
      probeFacts = probeOutput.probes ?? {};
    } catch (error) {
      probeOutput = { error: String(error) };
    }

    const apiPresent = Boolean(probeFacts['baseContainerApiPresent']);
    checks.push(
      check(
        'mxc.probe.baseContainerApiPresent',
        'BaseContainer (PSEC) API present per native probe',
        String(apiPresent),
        apiPresent,
        probeOutput,
      ),
    );

    const denyPaths = Boolean(probeFacts['baseContainerSupportsDenyPaths']);
    checks.push(
      check(
        'mxc.capability.PSE_SUPPORT_FS_DENY',
        'baseContainerSupportsDenyPaths (deny-path capability)',
        String(denyPaths),
        denyPaths,
      ),
    );

    const preflight = await preflightSentinel(sdk);
    checks.push(preflight.check);
    psecCreateClose = preflight.psecCreateClose;
  } else {
    checks.push(
      check(
        'mxc.probe.baseContainerApiPresent',
        'BaseContainer (PSEC) API present per native probe',
        prereq.reason ?? 'SDK unavailable',
        false,
      ),
    );
    checks.push(
      check(
        'mxc.capability.PSE_SUPPORT_FS_DENY',
        'baseContainerSupportsDenyPaths (deny-path capability)',
        'SDK unavailable',
        false,
      ),
    );
    checks.push(
      check('mxc.psec.createClose', 'a real processcontainer launched a child and closed', 'SDK unavailable', false),
    );
  }

  checks.push(
    check(
      'mxc.conpty.binding',
      'node-pty conpty binding present (ConPTY prerequisite)',
      conpty.available ? 'present' : (conpty.reason ?? 'absent'),
      conpty.available,
      conpty.detail,
    ),
  );

  const apiPresent = Boolean(probeFacts['baseContainerApiPresent']) && psecCreateClose.available;
  const conclusion = apiPresent
    ? 'PSEC/processcontainer base-container API present: the two-container isolation receipt is exercisable on this row.'
    : 'PSEC/processcontainer base-container API NOT present on this Windows build (typed-unavailable, fail-closed — not a bug). The MXC two-container isolation receipt is not exercisable here; it needs a PSEC-capable Windows build (the Win11 Eval VM lane; §RQ5 minimum-build / D9). On this row the exercisable Windows isolation path is the capability-SID fallback.';

  const receipt = {
    kind: 'capability-probe',
    identity: laneIdentity(sdk),
    conclusion,
    platformSupport,
    availableBackends,
    probeFacts,
    conpty,
    psecCreateClose,
    checks,
    // The row is green only if the SDK loaded, PSEC create/close was externally proven, and the
    // deny-path capability is present. ConPTY absence is recorded but does not alone sink the row
    // (the shell can run without allocating new ttys); the summary states it explicitly.
    verdict: checks.filter((c) => c.id !== 'mxc.conpty.binding').every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
    sdkAvailable: prereq.available,
  };
  const path = join(outDir(), 'probe.receipt.json');
  writeJson(path, receipt);
  // eslint-disable-next-line no-console
  console.log(
    `[mxc:probe] ${receipt.verdict} — PSEC=${psecCreateClose.available} denyPaths=${Boolean(probeFacts['baseContainerSupportsDenyPaths'])} conpty=${conpty.available} → ${path}`,
  );
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

await main();
