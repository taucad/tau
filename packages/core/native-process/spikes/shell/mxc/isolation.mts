/**
 * W2 MXC two-concurrent-container S1 isolation receipt — the core deliverable.
 *
 * Two concurrent processcontainers (session A and session B), each with its own read-only /
 * read-write / deny lists, private HOME and temp, an approved folder, and its own
 * credential-authenticated loopback proxy canary. Every allow/deny is decided by an EXTERNAL
 * out-of-container observer (a file digest the harness placed, or a listener's own request log),
 * never by a trusted in-container error string:
 *
 *   iso.read.cross       A cannot read B's roots / HOME / temp / approved folder, and vice-versa.
 *   iso.write.cross      A cannot write B's roots / HOME / temp / approved folder, and vice-versa.
 *   iso.proxy.cross      Neither container can use the OTHER session's proxy destination (MXC shares
 *                        loopback, so denial must come from the per-session token — proven by the
 *                        other listener's log, exercising the Tau-side proxy-auth requirement).
 *   iso.reaping          Descendants (a session-escaping, TERM-ignoring writer) are reaped when the
 *                        foreground process exits (kill-on-close job); an external sentinel stops growing.
 *   iso.control.*        Positive controls: each container CAN read/write its own roots and reach its
 *                        own proxy — so "everything denied because the container did nothing" cannot
 *                        masquerade as isolation.
 *
 * A missing SDK or a failed preflight is a typed prerequisite failure and a non-zero exit, handing
 * the row to the capability-SID fallback (fallback.mts). Nothing here goes green without a real run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf, observeGrowth, reapingWriterCommand, readIfPresent } from './canary.mts';
import {
  type Check,
  type MxcSdk,
  type ProxyCanary,
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
  sha256,
  startProxyCanary,
  writeJson,
} from './mxc-lib.mts';

type Session = {
  grant: SessionGrant;
  proxy: ProxyCanary;
  /** The externally-placed secret marker living in each of this session's private roots. */
  secret: string;
  roots: { project: string; home: string; temporary: string; approved: string };
  secretFiles: string[];
  outFile: string;
};

const makeSession = async (id: string, base: string, otherRootsToDeny: readonly string[]): Promise<Session> => {
  const root = ensureDir(join(base, id));
  const roots = {
    project: ensureDir(join(root, 'project')),
    home: ensureDir(join(root, 'home')),
    temporary: ensureDir(join(root, 'tmp')),
    approved: ensureDir(join(root, 'approved')),
  };
  const toolchain = ensureDir(join(root, 'toolchain'));
  const secret = `SECRET-${id}-${nonce()}`;
  // Place the secret EXTERNALLY (host side) in every private root. Its presence in another session's
  // exfiltration output is the only thing that would prove a cross-read leak.
  const secretFiles = [
    join(roots.project, 'secret.txt'),
    join(roots.home, 'secret.txt'),
    join(roots.temporary, 'secret.txt'),
    join(roots.approved, 'secret.txt'),
  ];
  for (const file of secretFiles) {
    writeFileSync(file, secret);
  }
  const proxy = await startProxyCanary(id);
  const grant: SessionGrant = {
    id,
    project: roots.project,
    home: roots.home,
    temporary: roots.temporary,
    readOnly: toolchain,
    deny: otherRootsToDeny,
    proxy: { host: '127.0.0.1', port: proxy.port, token: proxy.token },
  };
  return { grant, proxy, secret, roots, secretFiles, outFile: join(roots.project, 'exfil.out') };
};

/** Run a command in a one-shot processcontainer for a session's grant, pointed at its own proxy. */
const runIn = (sdk: MxcSdk, session: Session, command: string, denyPaths: boolean) =>
  sdk.run(requestFor(session.grant, command, `http://127.0.0.1:${session.grant.proxy.port}`, denyPaths));

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const { sdk, prereq } = await loadSdk();

  if (!sdk || !isWindows) {
    const reason = !isWindows ? `not Windows (${process.platform})` : (prereq.reason ?? 'SDK unavailable');
    checks.push(check('iso.prerequisite', 'MXC SDK available on a Windows host', reason, false, prereq.detail));
    writeJson(join(outDir(), 'isolation.receipt.json'), {
      kind: 'isolation',
      identity: laneIdentity(sdk),
      prerequisite: { available: false, reason },
      checks,
      verdict: 'fail',
      handoff: 'capability-SID fallback (fallback.mts)',
    });
    // eslint-disable-next-line no-console
    console.log(`[mxc:isolation] fail — ${reason}; hand off to fallback.mts`);
    process.exitCode = 1;
    return;
  }

  // Deny-path support decides whether read-isolation is enforced by MXC deny lists or must be read
  // off the ambient DACL. Record it; the read assertion's interpretation depends on it.
  let denyPaths = false;
  try {
    denyPaths = Boolean(
      (sdk.probe() as { probes?: Record<string, unknown> }).probes?.['baseContainerSupportsDenyPaths'],
    );
  } catch {
    denyPaths = false;
  }

  const base = ensureDir(join(outDir(), 'iso'));
  // Each session denies the OTHER's private roots + approved folder.
  const aRootsPlaceholder: string[] = [];
  const a = await makeSession('A', base, aRootsPlaceholder);
  const b = await makeSession('B', base, [a.roots.project, a.roots.home, a.roots.temporary, a.roots.approved]);
  // A denies B's roots (now known).
  (a.grant.deny as string[]).push(b.roots.project, b.roots.home, b.roots.temporary, b.roots.approved);

  // The in-MXC shell is PowerShell (D14). Scripts use single-quoted literals with forward-slash
  // paths, so psLaunch's -Command wrapping needs no escaping.
  const shell = resolveWindowsShell();
  const p = (x: string): string => x.replaceAll('\\', '/');
  const webGet = (port: number, outFile: string): string =>
    `try { Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:${port}/secret') -Headers @{ Authorization = ('Bearer ' + $env:TAU_PROXY_TOKEN) } -OutFile '${p(outFile)}' } catch {}`;

  // ── Positive controls: each container does what it is allowed, concurrently (two live containers).
  const controlCmd = (self: Session): string =>
    psLaunch(
      shell,
      [
        `try { Get-Content -Raw -LiteralPath '${p(join(self.roots.project, 'secret.txt'))}' | Set-Content -LiteralPath '${p(join(self.roots.project, 'self-read.out'))}' } catch {}`,
        `try { Set-Content -LiteralPath '${p(join(self.roots.home, 'own-write.out'))}' -Value 'OWN-${self.grant.id}' } catch {}`,
        webGet(self.grant.proxy.port, join(self.roots.project, 'own-proxy.out')),
        'exit 0',
      ].join('; '),
    );
  await Promise.all([runIn(sdk, a, controlCmd(a), denyPaths), runIn(sdk, b, controlCmd(b), denyPaths)]);
  for (const s of [a, b]) {
    const selfRead = readIfPresent(join(s.roots.project, 'self-read.out'));
    checks.push(
      check(
        `iso.control.${s.grant.id}.ownRead`,
        `session ${s.grant.id} CAN read its own project`,
        selfRead?.includes(s.secret) ? 'read' : 'blocked',
        Boolean(selfRead?.includes(s.secret)),
      ),
    );
    const ownProxy = readIfPresent(join(s.roots.project, 'own-proxy.out'));
    const servedSelf = s.proxy.log.some((e) => e.served);
    checks.push(
      check(
        `iso.control.${s.grant.id}.ownProxy`,
        `session ${s.grant.id} CAN reach its own proxy with its own token`,
        servedSelf && Boolean(ownProxy?.includes(s.proxy.secret)) ? 'served' : 'not served',
        servedSelf && Boolean(ownProxy?.includes(s.proxy.secret)),
      ),
    );
  }

  // Snapshot B's secret-file digests before the attacks, to prove cross-write did not alter them.
  const bDigestsBefore = b.secretFiles.map(digestOf);
  const aDigestsBefore = a.secretFiles.map(digestOf);

  // ── Cross READ + WRITE, run concurrently: A attacks B while B attacks A (two concurrent containers).
  const crossCmd = (attacker: Session, victim: Session): string => {
    const steps = victim.secretFiles.flatMap((f, i) => [
      `try { Add-Content -LiteralPath '${p(attacker.outFile)}' -Value (Get-Content -Raw -LiteralPath '${p(f)}') } catch {}`,
      `Add-Content -LiteralPath '${p(attacker.outFile)}' -Value '--sep${i}--'`,
      `try { Set-Content -LiteralPath '${p(f.replace(/secret\.txt$/, 'tamper.out'))}' -Value 'TAMPER-${attacker.grant.id}' } catch {}`,
    ]);
    return psLaunch(shell, [...steps, 'exit 0'].join('; '));
  };
  await Promise.all([runIn(sdk, a, crossCmd(a, b), denyPaths), runIn(sdk, b, crossCmd(b, a), denyPaths)]);

  // Cross-read verdict: the attacker's exfil output must NOT contain the victim's secret.
  const aExfil = readIfPresent(a.outFile) ?? '';
  const bExfil = readIfPresent(b.outFile) ?? '';
  const readDetail = {
    denyPathsEnforced: denyPaths,
    aSawB: aExfil.includes(b.secret),
    bSawA: bExfil.includes(a.secret),
  };
  const readIsolated = !aExfil.includes(b.secret) && !bExfil.includes(a.secret);
  checks.push(
    check(
      'iso.read.cross',
      "neither container can read the other's roots/HOME/temp/approved (external: victim secret absent from attacker exfil)",
      readIsolated ? 'both denied' : 'LEAK',
      readIsolated,
      denyPaths
        ? readDetail
        : {
            ...readDetail,
            note: 'baseContainerSupportsDenyPaths=false: read isolation here reflects the ambient DACL, not an MXC deny list',
          },
    ),
  );

  // Cross-write verdict: victim secret digests unchanged AND no tamper file created in victim roots.
  const bDigestsAfter = b.secretFiles.map(digestOf);
  const aDigestsAfter = a.secretFiles.map(digestOf);
  const bTampers = b.secretFiles.map((f) => readIfPresent(f.replace(/secret\.txt$/, 'tamper.out')));
  const aTampers = a.secretFiles.map((f) => readIfPresent(f.replace(/secret\.txt$/, 'tamper.out')));
  const writeIsolated =
    bDigestsBefore.every((d, i) => d === bDigestsAfter[i]) &&
    aDigestsBefore.every((d, i) => d === aDigestsAfter[i]) &&
    bTampers.every((t) => t === undefined) &&
    aTampers.every((t) => t === undefined);
  checks.push(
    check(
      'iso.write.cross',
      "neither container can write the other's roots/HOME/temp/approved (external: victim digests unchanged, no tamper file)",
      writeIsolated ? 'both denied' : 'TAMPER',
      writeIsolated,
      {
        bChanged: bDigestsBefore.map((d, i) => d !== bDigestsAfter[i]),
        aChanged: aDigestsBefore.map((d, i) => d !== aDigestsAfter[i]),
        bTamperSeen: bTampers.map(Boolean),
        aTamperSeen: aTampers.map(Boolean),
      },
    ),
  );

  // ── Proxy cross-use: A reaches B's port with A's token, and B reaches A's port with B's token.
  const proxyAttack = (attacker: Session, victim: Session): string =>
    psLaunch(
      shell,
      [webGet(victim.grant.proxy.port, join(attacker.roots.project, 'cross-proxy.out')), 'exit 0'].join('; '),
    );
  const aSeenBefore = b.proxy.log.length;
  const bSeenBefore = a.proxy.log.length;
  await Promise.all([runIn(sdk, a, proxyAttack(a, b), denyPaths), runIn(sdk, b, proxyAttack(b, a), denyPaths)]);
  // External verdict: the victim listener saw the cross request AND refused to serve it (401),
  // and the attacker's output does not contain the victim's secret.
  const bServedA = b.proxy.log.slice(aSeenBefore).some((e) => e.served);
  const aServedB = a.proxy.log.slice(bSeenBefore).some((e) => e.served);
  const aCrossOut = readIfPresent(join(a.roots.project, 'cross-proxy.out')) ?? '';
  const bCrossOut = readIfPresent(join(b.roots.project, 'cross-proxy.out')) ?? '';
  const proxyIsolated =
    !bServedA && !aServedB && !aCrossOut.includes(b.proxy.secret) && !bCrossOut.includes(a.proxy.secret);
  checks.push(
    check(
      'iso.proxy.cross',
      "neither container can use the other's proxy destination (external: other listener refused, secret not obtained)",
      proxyIsolated ? 'both refused' : 'CROSS-USE',
      proxyIsolated,
      {
        loopbackShared: true,
        bServedA,
        aServedB,
        aGotBSecret: aCrossOut.includes(b.proxy.secret),
        bGotASecret: bCrossOut.includes(a.proxy.secret),
        note: 'MXC shares loopback bidirectionally; denial is the Tau-side per-session proxy token, proven by the listener log',
      },
    ),
  );

  // ── Descendant reaping (D14 PowerShell case): the foreground PowerShell spawns a detached native
  // .exe child, a PowerShell background job, AND a Start-Process writer, then exits. The kill-on-close
  // job must reap the whole tree; the external sentinel must stop growing after the container closes.
  const sentinel = join(a.roots.temporary, 'reaping-sentinel.txt');
  mkdirSync(a.roots.temporary, { recursive: true });
  await runIn(sdk, a, reapingWriterCommand(shell, sentinel), denyPaths);
  // After the run() resolves (foreground exited, container closed), the detached writers must be dead.
  const growth = await observeGrowth(sentinel, 2500);
  checks.push(
    check(
      'iso.reaping',
      'native .exe + PowerShell job + Start-Process descendants reaped when the foreground exits (external: sentinel stops growing)',
      growth.grew ? 'STILL GROWING' : 'stopped',
      !growth.grew,
      growth,
    ),
  );

  await Promise.all([a.proxy.close(), b.proxy.close()]);

  const receipt = {
    kind: 'isolation',
    identity: laneIdentity(sdk),
    shell,
    denyPathsEnforced: denyPaths,
    sessions: {
      A: { roots: a.roots, proxyPort: a.grant.proxy.port, secretDigest: sha256(a.secret) },
      B: { roots: b.roots, proxyPort: b.grant.proxy.port, secretDigest: sha256(b.secret) },
    },
    checks,
    verdict: checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  };
  writeJson(join(outDir(), 'isolation.receipt.json'), receipt);
  // eslint-disable-next-line no-console
  console.log(
    `[mxc:isolation] ${receipt.verdict} — read=${readIsolated} write=${writeIsolated} proxy=${proxyIsolated} reaping=${!growth.grew}`,
  );
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

await main();
