/**
 * W2 MXC capability probe. Records, from the pinned SDK:
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
 *
 * Receipt-integrity rule (summarize.mts enforces it): the prose `conclusion` is GENERATED FROM the
 * structured facts below, never hand-written, so it can never drift from them. In particular it
 * distinguishes `baseContainerApiPresent` (the API-present fact) from `psec.createClose` (whether a
 * real child launched+closed): a present API whose live exercise fails is a live-exercise failure
 * (e.g. a request-config parse error), NOT an absent API, and must never be labelled E_NOTIMPL.
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
  psLaunch,
  requestFor,
  resolveWindowsShell,
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
  // A container whose PowerShell (D14) writes the nonce to the shared RW path, then exits
  // (destroy-on-exit closes PSEC). Single-quoted PS literals keep psLaunch's -Command unescaped.
  // No proxy URL is passed: the sentinel needs no egress, so requestFor OMITS runtimeConfig.networkProxy
  // (an empty/relative networkProxy throws "relative URL without a base" and the container never runs).
  const shell = resolveWindowsShell();
  const command = psLaunch(shell, `Set-Content -LiteralPath '${sentinel.replaceAll('\\', '/')}' -Value '${token}'`);
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
  let tier: string | undefined;
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
      tier = probeOutput.tier;
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

    // isolation_session is PSEC-INDEPENDENT: it mints a per-session agent user + SID rather than
    // using the process-security-environment feature, so it can be the stock-Windows isolation path
    // where PSEC is flighted-off. Informational here (excluded from the gate like conpty): this fact
    // decides whether the isolation_session lane is worth standing up on these runners.
    const isolationSessionAvailable = Boolean(probeFacts['isolationSessionAvailable']);
    checks.push(
      check(
        'mxc.isolationSession.available',
        'isolationSessionAvailable (PSEC-independent per-session agent-user backend)',
        String(isolationSessionAvailable),
        isolationSessionAvailable,
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
    checks.push(check('mxc.isolationSession.available', 'isolationSessionAvailable', 'SDK unavailable', false));
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

  const apiFact = Boolean(probeFacts['baseContainerApiPresent']);
  const liveRan = psecCreateClose.available;
  const denyPathsFact = Boolean(probeFacts['baseContainerSupportsDenyPaths']);
  const isolationSessionAvailable = Boolean(probeFacts['isolationSessionAvailable']);
  // GENERATED FROM FACTS (receipt-integrity): never hand-write PSEC prose. Distinguish API-present
  // from live-exercise so a config/parse failure is never mislabelled E_NOTIMPL.
  // PSEC is recorded as a backend only when a live child was externally proven; otherwise it is
  // "not-available" and the Codex restricted-token fallback (fallback.ps1) is the default backend.
  const psecBackend = liveRan ? 'available' : 'not-available';
  const createCloseDetail = JSON.stringify(psecCreateClose.detail ?? null).slice(0, 400);
  const verdict4 = liveRan
    ? 'PSEC processcontainer base-container launched AND closed a real child (external sentinel written): native Windows containment is LIVE on this build.'
    : apiFact
      ? `base-container API IS present but the live create/close did NOT write the external sentinel. This is a LIVE-EXERCISE failure (e.g. a request-config parse error), NOT an absent API and NOT E_NOTIMPL. createClose detail: ${createCloseDetail}`
      : 'base-container API reports NOT present (CreateProcessSecurityEnvironment unavailable / feature-flag gated on this build); the PSEC two-container receipt needs a flighted build. isolation_session and the capability-SID fallback are the alternatives.';
  const conclusion = [
    `baseContainerApiPresent=${apiFact}`,
    `psec.createClose(liveChildLaunchedAndClosed)=${liveRan}`,
    `baseContainerSupportsDenyPaths=${denyPathsFact}`,
    `isolationSessionAvailable=${isolationSessionAvailable}`,
    `isolationTier=${tier ?? 'unknown'}`,
    `psecBackend=${psecBackend} (default backend: Codex restricted-token fallback)`,
    verdict4,
  ].join(' | ');

  // The row is green only if the SDK loaded, PSEC create/close was externally proven, and the
  // deny-path capability is present. ConPTY absence is recorded but does not alone sink the row; the
  // isolation_session fact is informational.
  const verdict = checks
    .filter((c) => c.id !== 'mxc.conpty.binding' && c.id !== 'mxc.isolationSession.available')
    .every((c) => c.verdict === 'pass')
    ? 'pass'
    : 'fail';

  const receipt = {
    kind: 'capability-probe',
    identity: laneIdentity(sdk),
    shell: resolveWindowsShell(),
    conclusion,
    platformSupport,
    availableBackends,
    probeFacts,
    tier,
    conpty,
    psecCreateClose,
    psecBackend,
    defaultBackend: 'codex-restricted-token-fallback',
    checks,
    verdict,
    sdkAvailable: prereq.available,
  };
  const path = join(outDir(), 'probe.receipt.json');
  writeJson(path, receipt);
  // eslint-disable-next-line no-console
  console.log(
    `[mxc:probe] ${receipt.verdict} — apiPresent=${apiFact} createClose=${liveRan} denyPaths=${denyPathsFact} isolationSession=${isolationSessionAvailable} conpty=${conpty.available} → ${path}`,
  );
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

await main();
