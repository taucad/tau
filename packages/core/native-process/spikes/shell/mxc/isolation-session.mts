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
 *
 * Exploratory but fail-closed: the pinned SDK run() request is driven with containment.type
 * "isolation_session"; if the backend rejects that request shape or is unavailable, this records a
 * TYPED failure with the exact SDK error and exits non-zero — never a green, never a fabricated pass.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const makeSession = (base: string, id: string): Sess => {
  const root = ensureDir(join(base, id));
  const secret = `SECRET-${id}-${nonce()}`;
  const secretFile = join(root, 'secret.txt');
  writeFileSync(secretFile, secret);
  return { id, root, secret, secretFile, sidFile: join(root, 'agent-sid.out'), exfil: join(root, 'exfil.out') };
};

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
    checks.push(check('isoSession.prerequisite', 'isolation_session backend usable on a Windows host', reason, false, detail));
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

  const base = ensureDir(join(outDir(), 'iso-session'));
  const a = makeSession(base, 'A');
  const b = makeSession(base, 'B');
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

  // Each session records its agent-user SID (external), reads its own secret (control), then attempts
  // to read + tamper the OTHER session root. All in-container writes land on EXTERNAL files the
  // orchestrator inspects; nothing here trusts an in-container success/failure string.
  const cmd = (self: Sess, other: Sess): string =>
    psLaunch(shell, [
      `try { Set-Content -LiteralPath '${p(self.sidFile)}' -Value ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) } catch { Write-Output ('SIDWRITE-ERR ' + $_.Exception.Message) }`,
      `Write-Output ('AGENT-SID ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)`,
      `try { Get-Content -Raw -LiteralPath '${p(self.secretFile)}' | Set-Content -LiteralPath '${p(join(self.root, 'self-read.out'))}' } catch {}`,
      `try { Add-Content -LiteralPath '${p(self.exfil)}' -Value (Get-Content -Raw -LiteralPath '${p(other.secretFile)}') } catch {}`,
      `try { Set-Content -LiteralPath '${p(join(other.root, 'tamper.out'))}' -Value 'TAMPER-${self.id}' } catch {}`,
      'exit 0',
    ].join('; '));

  const bSecretBefore = digestOf(b.secretFile);
  const aSecretBefore = digestOf(a.secretFile);

  // Run results are recorded as DIAGNOSTIC evidence only (exit code / stderr / stdout are in-container
  // claims and never decide a verdict; the external canary files do).
  let runResults: unknown;
  try {
    const results = await Promise.all([
      sdk.run(isoSessionRequest(grantFor(a, b), cmd(a, b), denyPaths)),
      sdk.run(isoSessionRequest(grantFor(b, a), cmd(b, a), denyPaths)),
    ]);
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
    check('isoSession.agentUsers.distinct', 'two concurrent sessions run as DISTINCT agent-user SIDs', `A=${aSid} B=${bSid}`, distinct, { a: aSid, b: bSid }),
  );

  for (const s of [a, b]) {
    const own = readIfPresent(join(s.root, 'self-read.out'));
    checks.push(check(`isoSession.control.${s.id}.ownRead`, `session ${s.id} CAN read its own root`, own?.includes(s.secret) ? 'read' : 'blocked', Boolean(own?.includes(s.secret))));
  }

  const aExfil = readIfPresent(a.exfil) ?? '';
  const bExfil = readIfPresent(b.exfil) ?? '';
  const readIsolated = !aExfil.includes(b.secret) && !bExfil.includes(a.secret);
  checks.push(
    check('isoSession.read.cross', "neither session can read the other's private root (external: victim secret absent from attacker exfil)", readIsolated ? 'both denied' : 'LEAK', readIsolated, { aSawB: aExfil.includes(b.secret), bSawA: bExfil.includes(a.secret) }),
  );

  const bTamper = readIfPresent(join(b.root, 'tamper.out'));
  const aTamper = readIfPresent(join(a.root, 'tamper.out'));
  const writeIsolated =
    bSecretBefore === digestOf(b.secretFile) && aSecretBefore === digestOf(a.secretFile) && !bTamper && !aTamper;
  checks.push(
    check('isoSession.write.cross', "neither session can write the other's private root (external: victim digest unchanged, no tamper file)", writeIsolated ? 'both denied' : 'TAMPER', writeIsolated, { bTamper: Boolean(bTamper), aTamper: Boolean(aTamper) }),
  );

  const gated = checks.filter((c) => c.id !== 'isoSession.available');
  const verdict = gated.length > 0 && gated.every((c) => c.verdict === 'pass') ? 'pass' : 'fail';
  writeJson(receiptPath, {
    kind: 'isolation-session',
    identity: laneIdentity(sdk),
    conclusion: `isolation_session two-session proof: agentUsersDistinct=${distinct} readIsolated=${readIsolated} writeIsolated=${writeIsolated} isolationSessionAvailable=${isolationSessionAvailable}.`,
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
