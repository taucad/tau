/**
 * W2 MXC isolation_session two-session proof (PSEC-INDEPENDENT backend).
 *
 * isolation_session mints a per-session AGENT USER + SID rather than using the process-security
 * environment feature, so it can be the stock-Windows isolation path where PSEC is flighted-off
 * (probeFacts.isolationSessionAvailable). This harness stands up TWO concurrent isolation_session
 * sessions and proves, with EXTERNAL canaries only (never a trusted in-container error string):
 *   isoSession.agentUsers.distinct   the two sessions run as DISTINCT agent-user SIDs (each session
 *                                     writes its own WindowsIdentity SID to an external file).
 *   isoSession.read.cross            session A cannot read session B private root, and vice-versa
 *                                     (victim secret absent from attacker exfil).
 *   isoSession.write.cross           session A cannot write session B private root, and vice-versa
 *                                     (victim secret digest unchanged, no tamper file).
 *   isoSession.control.*             positive controls: each session CAN read+write its own root.
 *   isoSession.hostDacls.applied     each session root carries a HOST-APPLIED protected DACL: inheritance
 *                                     broken, only SYSTEM, Administrators, the host account and THAT
 *                                     session agent SID. A cross denial counts only when the same child
 *                                     passed both own-root positive controls in the same run.
 *
 * Handoff: the backend mints the agent user per session, so its SID is unknown until the session runs.
 * Each child writes its SID to a shared control dir and waits for the host signal; the host grants that
 * SID on its own root (icacls), then writes the signal; only then does the child attempt own and cross
 * access. Until the grant, both roots are host-only, so there is no window where a cross access could
 * succeed. If the signal never comes, the positive controls fail and the verdict is fail (fail-closed).
 *
 * Exploratory but fail-closed: the pinned SDK run() request is driven with containment.type
 * "isolation_session"; if the backend rejects that request shape or is unavailable, this records a
 * TYPED failure with the exact SDK error and exits non-zero — never a green, never a fabricated pass.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type Check,
  type MxcContainerRequest,
  type MxcSdk,
  type SessionGrant,
  check,
  ensureDir,
  isWindows,
  laneIdentity,
  loadSdk,
  nonce,
  outDir,
  psLaunch,
  requestFor,
  resolveWindowsShell,
  writeJson,
} from './mxc-lib.mts';

const digestOf = (f: string): string | undefined =>
  existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex') : undefined;
const readIfPresent = (f: string): string | undefined => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);

type Sess = { id: string; root: string; secret: string; secretFile: string; sidFile: string; exfil: string };

/**
 * System tools run from their fixed System32 path, never a PATH lookup: on a hosted runner Git-bash's
 * GNU coreutils `whoami` (which rejects `/user`) can shadow the Windows one.
 */
const system32 = (exe: string): string => join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', exe);

const icacls = (args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(system32('icacls.exe'), args, { encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(0, 600) };
};

/** The host account SID (the orchestrator running this harness), from `whoami /user /fo csv /nh`. */
const hostSid = (): string | undefined => {
  const r = spawnSync(system32('whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  return /"(S-1-[\d-]+)"/.exec(r.stdout ?? '')?.[1];
};

const HOST_ONLY = (host: string): string[] => [
  '/inheritance:r',
  '/grant:r',
  '*S-1-5-18:(OI)(CI)F',
  '*S-1-5-32-544:(OI)(CI)F',
  `*${host}:(OI)(CI)F`,
];

/** Create a session root locked to the host BEFORE its secret exists, then write the secret. */
const makeSession = (
  base: string,
  control: string,
  id: string,
  host: string,
): Sess & { lock: ReturnType<typeof icacls> } => {
  const root = ensureDir(join(base, id));
  const lock = icacls([root, ...HOST_ONLY(host)]);
  const secret = `SECRET-${id}-${nonce()}`;
  const secretFile = join(root, 'secret.txt');
  writeFileSync(secretFile, secret);
  return {
    id,
    root,
    secret,
    secretFile,
    sidFile: join(control, `agent-sid-${id}.out`),
    exfil: join(root, 'exfil.out'),
    lock,
  };
};

const sleep = async (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Build an isolation_session request by overriding the containment type on the shared builder.
 *
 * isolation_session rejects the processcontainer network shape: the SDK requires "an explicit network
 * policy with network.egress.default=allow, network.ingress.default=allow, and
 * network.ingress.hostLoopback=allow, without rules or runtimeConfig.networkProxy" (observed as
 * MxcError "Invalid one-shot request: IsolationSession requires an explicit network policy …"). The
 * per-session identity isolation is provided by the distinct agent user + SID, not by the network
 * policy, so opening the network here does not weaken the isolation this receipt proves (filesystem
 * read/write isolation, decided by EXTERNAL canaries). We therefore replace requestFor's deny/deny
 * network wholesale with the exact allow/allow/allow policy the backend demands, and keep
 * inheritDefaultEnv so the agent-user process is launchable.
 *
 * The isolation_session backend also rejects a processcontainer FILESYSTEM policy outright (MxcError
 * "Isolation Session policy error: filesystem policy is not supported by the isolation session
 * backend") — its isolation primitive is the distinct per-session AGENT USER + SID, not an allow-list
 * of paths. So we DROP the filesystem block entirely; the agent user still needs the default env to
 * launch, so inheritDefaultEnv stays on via the `process` field carried over from requestFor.
 */
const isoSessionRequest = (grant: SessionGrant, command: string, denyPaths: boolean): MxcContainerRequest => {
  const base = requestFor(grant, command, '', denyPaths);
  const { filesystem: _dropped, ...rest } = base;
  return {
    ...rest,
    containment: { type: 'isolation_session' },
    network: { egress: { default: 'allow' }, ingress: { default: 'allow', hostLoopback: 'allow' } },
  } as unknown as MxcContainerRequest;
};

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const { sdk, prereq } = await loadSdk();
  const receiptPath = join(outDir(), 'isolation-session.receipt.json');

  const fail = (reason: string, detail?: unknown): void => {
    checks.push(
      check('isoSession.prerequisite', 'isolation_session backend usable on a Windows host', reason, false, detail),
    );
    writeJson(receiptPath, {
      kind: 'isolation-session',
      identity: laneIdentity(sdk),
      conclusion: `isolation_session two-session proof NOT obtained: ${reason}`,
      checks,
      verdict: 'fail',
    });
    // eslint-disable-next-line no-console
    console.log(`[mxc:isolation-session] fail — ${reason}`);
    process.exitCode = 1;
  };

  if (!sdk || !isWindows) {
    fail(!isWindows ? `not Windows (${process.platform})` : (prereq.reason ?? 'SDK unavailable'), prereq.detail);
    return;
  }

  let isolationSessionAvailable = false;
  let denyPaths = false;
  try {
    const probes = (sdk.probe() as { probes?: Record<string, unknown> }).probes ?? {};
    isolationSessionAvailable = Boolean(probes['isolationSessionAvailable']);
    denyPaths = Boolean(probes['baseContainerSupportsDenyPaths']);
  } catch (error) {
    fail('sdk.probe() threw', String(error));
    return;
  }
  checks.push(
    check(
      'isoSession.available',
      'probeFacts.isolationSessionAvailable is true (per-session agent-user backend present)',
      String(isolationSessionAvailable),
      isolationSessionAvailable,
    ),
  );

  const host = hostSid();
  if (!host) {
    fail('could not resolve the host account SID (whoami /user)');
    return;
  }
  const base = ensureDir(join(outDir(), 'iso-session'));
  // Control dir keeps its inherited ACL (agent users can write it, as observed): it carries only the
  // agent SIDs and the host signal, never a secret.
  const control = ensureDir(join(base, 'control'));
  const signal = join(control, 'host-dacls-applied.flag');
  const a = makeSession(base, control, 'A', host);
  const b = makeSession(base, control, 'B', host);
  const shell = resolveWindowsShell();
  const p = (x: string): string => x.replaceAll('\\', '/');

  const grantFor = (self: Sess, other: Sess): SessionGrant => ({
    id: self.id,
    project: self.root,
    home: self.root,
    temporary: self.root,
    readOnly: self.root,
    deny: [other.root],
    proxy: { host: '127.0.0.1', port: 0, token: nonce() },
  });

  // Each session records its agent-user SID into the control dir, waits for the host signal (the host
  // has then granted ONLY this SID on its own root), then: own read (positive control), own write
  // (positive control), cross read into its own exfil, cross tamper into the other root. Every outcome
  // lands on EXTERNAL files the orchestrator inspects; no in-container string decides anything.
  const cmd = (self: Sess, other: Sess): string =>
    psLaunch(
      shell,
      [
        `try { Set-Content -LiteralPath '${p(self.sidFile)}' -Value ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) } catch { Write-Output ('SIDWRITE-ERR ' + $_.Exception.Message) }`,
        `Write-Output ('AGENT-SID ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)`,
        `$w = 0; while (-not (Test-Path -LiteralPath '${p(signal)}') -and $w -lt 240) { Start-Sleep -Milliseconds 500; $w++ }`,
        `Write-Output ('SIGNAL ' + (Test-Path -LiteralPath '${p(signal)}'))`,
        `try { Get-Content -Raw -LiteralPath '${p(self.secretFile)}' -ErrorAction Stop | Set-Content -LiteralPath '${p(join(self.root, 'self-read.out'))}' -ErrorAction Stop } catch { Write-Output ('OWNREAD-ERR ' + $_.Exception.Message) }`,
        `try { Set-Content -LiteralPath '${p(join(self.root, 'self-write.out'))}' -Value 'OWN-${self.id}' -ErrorAction Stop } catch { Write-Output ('OWNWRITE-ERR ' + $_.Exception.Message) }`,
        `try { Add-Content -LiteralPath '${p(self.exfil)}' -Value (Get-Content -Raw -LiteralPath '${p(other.secretFile)}' -ErrorAction Stop) -ErrorAction Stop } catch { Write-Output ('CROSSREAD-ERR ' + $_.Exception.Message) }`,
        `try { Set-Content -LiteralPath '${p(join(other.root, 'tamper.out'))}' -Value 'TAMPER-${self.id}' -ErrorAction Stop } catch { Write-Output ('CROSSWRITE-ERR ' + $_.Exception.Message) }`,
        'exit 0',
      ].join('; '),
    );

  // The isolation_session backend runs the command line through `cmd /c` (observed: exit 255,
  // "'C:\Program' is not recognized"). cmd strips the first and last quote when the line holds more
  // than two, which breaks a quoted "C:\Program Files\..." executable. Wrapping the whole line in one
  // extra outer pair of quotes makes cmd strip exactly that pair and run the original line verbatim.
  const cmdForCmdExe = (line: string): string => `"${line}"`;

  const bSecretBefore = digestOf(b.secretFile);
  const aSecretBefore = digestOf(a.secretFile);

  // Run results are recorded as DIAGNOSTIC evidence only (exit code / stderr / stdout are in-container
  // claims and never decide a verdict; the external canary files do).
  let runResults: unknown;
  const hostDacls: {
    a?: ReturnType<typeof icacls>;
    b?: ReturnType<typeof icacls>;
    verifyA?: string;
    verifyB?: string;
    sidWaitMs: number;
  } = { sidWaitMs: 0 };
  try {
    // The runs settle while the host is still in the handoff loop below; a rejection (e.g. backend
    // unavailable) must end the loop and surface as a typed failure, not an unhandled rejection.
    let runsSettled = false;
    const running = Promise.all([
      sdk.run(isoSessionRequest(grantFor(a, b), cmdForCmdExe(cmd(a, b)), denyPaths)),
      sdk.run(isoSessionRequest(grantFor(b, a), cmdForCmdExe(cmd(b, a)), denyPaths)),
    ]).finally(() => {
      runsSettled = true;
    });
    running.catch(() => undefined);
    // Handoff: wait for both agent SIDs, grant each ONLY on its own root, verify, then signal.
    const started = Date.now();
    while (
      !runsSettled &&
      Date.now() - started < 90_000 &&
      !(readIfPresent(a.sidFile)?.trim() && readIfPresent(b.sidFile)?.trim())
    ) {
      await sleep(500);
    }
    hostDacls.sidWaitMs = Date.now() - started;
    const sidA = readIfPresent(a.sidFile)?.trim();
    const sidB = readIfPresent(b.sidFile)?.trim();
    if (sidA && sidB && /^S-1-[\d-]+$/.test(sidA) && /^S-1-[\d-]+$/.test(sidB)) {
      hostDacls.a = icacls([a.root, '/grant', `*${sidA}:(OI)(CI)M`]);
      hostDacls.b = icacls([b.root, '/grant', `*${sidB}:(OI)(CI)M`]);
      hostDacls.verifyA = icacls([a.root]).out;
      hostDacls.verifyB = icacls([b.root]).out;
      writeFileSync(signal, 'applied');
    }
    const results = await running;
    runResults = results.map((r) => ({
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      stdout: r.stdout.slice(0, 300),
      stderr: r.stderr.slice(0, 300),
      warnings: r.warnings,
    }));
  } catch (error) {
    fail('sdk.run(isolation_session) threw (request shape rejected or backend unavailable)', String(error));
    return;
  }

  const aSid = readIfPresent(a.sidFile)?.trim();
  const bSid = readIfPresent(b.sidFile)?.trim();
  const distinct = Boolean(aSid && bSid && aSid !== bSid && /^S-\d/.test(aSid) && /^S-\d/.test(bSid));
  checks.push(
    check(
      'isoSession.agentUsers.distinct',
      'two concurrent sessions run as DISTINCT agent-user SIDs',
      `A=${aSid} B=${bSid}`,
      distinct,
      { a: aSid, b: bSid },
    ),
  );

  // Host DACLs: inheritance broken (no "(I)" entries) and each root lists its own agent SID, never the other.
  const lockOk = a.lock.code === 0 && b.lock.code === 0;
  const grantOk = hostDacls.a?.code === 0 && hostDacls.b?.code === 0;
  const verifyOk = Boolean(
    aSid &&
    bSid &&
    hostDacls.verifyA &&
    hostDacls.verifyB &&
    !/\(I\)/.test(hostDacls.verifyA) &&
    !/\(I\)/.test(hostDacls.verifyB) &&
    !hostDacls.verifyA.includes(bSid) &&
    !hostDacls.verifyB.includes(aSid),
  );
  const daclsApplied = lockOk && grantOk && verifyOk && existsSync(signal);
  checks.push(
    check(
      'isoSession.hostDacls.applied',
      'each session root has a host-applied protected DACL (inheritance broken; SYSTEM, Administrators, host, and ONLY its own agent SID) before any access is attempted',
      `lock=${lockOk} grant=${grantOk} verify=${verifyOk} signal=${existsSync(signal)} sidWaitMs=${hostDacls.sidWaitMs}`,
      daclsApplied,
      {
        lockA: a.lock,
        lockB: b.lock,
        grantA: hostDacls.a,
        grantB: hostDacls.b,
        verifyA: hostDacls.verifyA,
        verifyB: hostDacls.verifyB,
      },
    ),
  );

  const ownOk: Record<string, boolean> = {};
  for (const s of [a, b]) {
    const own = readIfPresent(join(s.root, 'self-read.out'));
    const ownWrite = readIfPresent(join(s.root, 'self-write.out'));
    const ok = Boolean(own?.includes(s.secret)) && Boolean(ownWrite?.includes(`OWN-${s.id}`));
    ownOk[s.id] = ok;
    checks.push(
      check(
        `isoSession.control.${s.id}.own`,
        `session ${s.id} CAN read AND write its own root (positive control, same child, same run)`,
        `read=${Boolean(own?.includes(s.secret))} write=${Boolean(ownWrite?.includes(`OWN-${s.id}`))}`,
        ok,
      ),
    );
  }
  const exercised = daclsApplied && Boolean(ownOk['A']) && Boolean(ownOk['B']);

  const aExfil = readIfPresent(a.exfil) ?? '';
  const bExfil = readIfPresent(b.exfil) ?? '';
  const noReadLeak = !aExfil.includes(b.secret) && !bExfil.includes(a.secret);
  const readIsolated = exercised && noReadLeak;
  checks.push(
    check(
      'isoSession.read.cross',
      "neither running session can read the other's private root (external: victim secret absent from attacker exfil; exercised only with host DACLs + both positive controls)",
      exercised ? (noReadLeak ? 'both denied' : 'LEAK') : `NOT EXERCISED (leak=${!noReadLeak})`,
      readIsolated,
      { aSawB: aExfil.includes(b.secret), bSawA: bExfil.includes(a.secret), exercised },
    ),
  );

  const bTamper = readIfPresent(join(b.root, 'tamper.out'));
  const aTamper = readIfPresent(join(a.root, 'tamper.out'));
  const noTamper =
    bSecretBefore === digestOf(b.secretFile) && aSecretBefore === digestOf(a.secretFile) && !bTamper && !aTamper;
  const writeIsolated = exercised && noTamper;
  checks.push(
    check(
      'isoSession.write.cross',
      "neither running session can write the other's private root (external: victim digest unchanged, no tamper file; exercised only with host DACLs + both positive controls)",
      exercised ? (noTamper ? 'both denied' : 'TAMPER') : `NOT EXERCISED (tamper=${!noTamper})`,
      writeIsolated,
      { bTamper: Boolean(bTamper), aTamper: Boolean(aTamper), exercised },
    ),
  );

  const gated = checks.filter((c) => c.id !== 'isoSession.available');
  const verdict = gated.length > 0 && gated.every((c) => c.verdict === 'pass') ? 'pass' : 'fail';
  writeJson(receiptPath, {
    kind: 'isolation-session',
    identity: laneIdentity(sdk),
    conclusion: `isolation_session two-session proof with host-applied per-agent-SID DACLs: agentUsersDistinct=${distinct} hostDaclsApplied=${daclsApplied} positiveControls=${Boolean(ownOk['A']) && Boolean(ownOk['B'])} readIsolated=${readIsolated} writeIsolated=${writeIsolated} isolationSessionAvailable=${isolationSessionAvailable}.`,
    agentSids: { A: aSid, B: bSid },
    runResults,
    checks,
    verdict,
  });
  // eslint-disable-next-line no-console
  console.log(`[mxc:isolation-session] ${verdict} — distinct=${distinct} read=${readIsolated} write=${writeIsolated}`);
  if (verdict !== 'pass') {
    process.exitCode = 1;
  }
};

await main();
