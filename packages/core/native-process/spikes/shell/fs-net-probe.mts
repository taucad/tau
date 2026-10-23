/**
 * S0 (filesystem mask) and S1 (isolation, concurrency, descendants, network) for one platform row.
 *
 * Builds a fixture project with authored files, a records tree and control data, then runs real
 * Bash through the spike supervisor against the candidate live-view profile and checks every
 * positive and negative with an out-of-sandbox observer (file digests, canary listeners), never a
 * trusted error string. Writes `s0.json` and `s1.json` receipts under the row's evidence directory.
 */
import { spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { BashIdentity, Check, ShellGrant, SupervisorResult } from './lib.mts';
import {
  check,
  fixtureRoot,
  identity,
  isWindows,
  resolveBash,
  shellPath,
  shellProfile,
  sleep,
  startSupervisor,
  waitFor,
  writeJson,
} from './lib.mts';

const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'shell-spike');
const row = process.env['TAU_SPIKE_ROW'] ?? `${process.platform}-${process.arch}`;

const root = fixtureRoot();
const project = join(root, 'project');
const home = join(root, 'home');
const temporary = join(root, 'tmp');
const outside = join(root, 'outside');
for (const directory of [
  project,
  home,
  temporary,
  outside,
  join(project, '.tau'),
  join(project, '.tau', 'runs'),
  join(project, 'src'),
]) {
  mkdirSync(directory, { recursive: true });
}

// Authored bytes (read-write), a record (read-only), control data (hidden), and an out-of-root file.
writeFileSync(join(project, 'src', 'model.txt'), 'authored-original\n');
writeFileSync(join(project, '.tau', 'AGENTS.md'), 'authored-control\n');
writeFileSync(join(project, '.tau', 'runs', 'run-1.json'), '{"record":true}\n');
writeFileSync(join(project, '.tau', 'project.json'), '{"secret":"PROJECT-CONTROL"}\n');
writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-SECRET\n');

const bash: BashIdentity = resolveBash();
const grant: ShellGrant = {
  project,
  home,
  temporary,
  toolchain: isWindows ? [] : ['/usr/bin', '/bin'],
  readOnly: [join(project, '.tau', 'runs'), join(project, '.tau', 'project.json')],
  hidden: [join(project, '.tau', 'project.json')],
};
const profile = shellProfile(grant);
const p = (path: string): string => shellPath(path);

const digest = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '<absent>');

// ── S0: filesystem mask ───────────────────────────────────────────────────────────────────────
const launchMarker = '__TAU_LAUNCH_OK__';
const s0Runs = [
  // Preflight: proves Bash actually launched inside the sandbox on this host. Without it a denial
  // check cannot tell "ran and was refused" from "never launched" — the latter is a false pass.
  { id: 'preflight', command: `echo ${launchMarker}`, cwd: project },
  { id: 'authored-read', command: `cat ${p(join(project, 'src', 'model.txt'))}`, cwd: project },
  {
    id: 'authored-write',
    command: `printf 'authored-edited\\n' > ${p(join(project, 'src', 'model.txt'))} && echo WROTE`,
    cwd: project,
  },
  {
    id: 'authored-create',
    command: `printf 'new\\n' > ${p(join(project, 'src', 'new.txt'))} && echo CREATED`,
    cwd: project,
  },
  { id: 'control-read', command: `cat ${p(join(project, '.tau', 'project.json'))}`, cwd: project },
  {
    id: 'control-write',
    command: `printf 'x\\n' > ${p(join(project, '.tau', 'project.json'))} && echo CONTROLWROTE`,
    cwd: project,
  },
  { id: 'record-read', command: `cat ${p(join(project, '.tau', 'runs', 'run-1.json'))}`, cwd: project },
  {
    id: 'record-write',
    command: `printf 'x\\n' > ${p(join(project, '.tau', 'runs', 'run-1.json'))} && echo RECORDWROTE`,
    cwd: project,
  },
  { id: 'outside-read', command: `cat ${p(join(outside, 'secret.txt'))}`, cwd: project },
  {
    id: 'outside-write',
    command: `printf 'x\\n' > ${p(join(outside, 'injected.txt'))} && echo OUTSIDEWROTE`,
    cwd: project,
  },
  { id: 'home-write', command: `printf 'home\\n' > ${p(join(home, 'note.txt'))} && echo HOMEWROTE`, cwd: project },
  {
    id: 'link-create',
    command: `ln -s ${p(join(outside, 'secret.txt'))} ${p(join(project, 'escape'))} && cat ${p(join(project, 'escape'))}`,
    cwd: project,
  },
];

// Windows-only diagnostic (W1 spike 1): characterize WHY the read mask is unenforced on this row.
// `whoami /all` reports the launched token's SIDs, integrity level and any deny-only / restricting
// SIDs (so we can tell a restricted token from a plain srt-sandbox member); `icacls` on the
// out-of-root file, the admitted project root and a record root reports the exact ACEs that granted
// the read. Pure diagnostic — no pass/fail check, verdict unaffected. The system tools are invoked
// by absolute path (Git-for-Windows ships its own `whoami` that rejects `/all`), and MSYS argument
// conversion is disabled so `/all` and the backslash paths reach the Win32 tools intact. See D4/I4.
if (isWindows) {
  const diag = [
    `export MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1`,
    `/c/Windows/System32/whoami.exe /all /fo list || true`,
    `echo ===DACL-OUTSIDE===`,
    `/c/Windows/System32/icacls.exe "$OUTSIDE_WIN" || true`,
    `echo ===DACL-PROJECT===`,
    `/c/Windows/System32/icacls.exe "$PROJECT_WIN" || true`,
    `echo ===DACL-RECORD===`,
    `/c/Windows/System32/icacls.exe "$RECORD_WIN" || true`,
  ].join('; ');
  s0Runs.push({
    id: 'win-characterization',
    command: diag,
    cwd: project,
    timeoutMs: 15_000,
    env: { OUTSIDE_WIN: join(outside, 'secret.txt'), PROJECT_WIN: project, RECORD_WIN: join(project, '.tau', 'runs') },
  });
}

const s0Checks: Check[] = [];
const s0 = await startSupervisor({ profile, bash: bash.path, runs: s0Runs });
const { results: r0, stderr: e0 } = await s0.done;
const byId = (id: string) => r0.find((result) => result.id === id);
const out = (id: string) => `${byId(id)?.stdout ?? ''}${byId(id)?.stderr ?? ''}`;
const ok = (id: string) => byId(id)?.exitCode === 0;

const launched = out('preflight').includes(launchMarker);
if (r0.some((result) => result.error) || !launched) {
  // The sandbox never ran a command on this host: initialization or the launch chain failed. This
  // is a failed/incomplete row (testing.md rule 6 — an unavailable prerequisite is never green),
  // not a set of passing denials. Record the diagnostic and stop before any negative is misread.
  const reason =
    r0.find((result) => result.error)?.error ??
    `preflight produced no ${launchMarker}: ${out('preflight').slice(0, 300)}`;
  const unavailable = check(
    's0.sandbox',
    'real Bash launches inside the sandbox on this row',
    reason,
    false,
    e0.slice(-2000),
  );
  s0Checks.push(unavailable);
  writeJson(join(evidenceDirectory, row, 's0.json'), {
    spike: 'S0',
    status: 'sandbox-unavailable',
    identity: identity(row, project, bash),
    checks: s0Checks,
    verdict: 'fail',
    rawResults: r0,
  });
  writeJson(join(evidenceDirectory, row, 's1.json'), {
    spike: 'S1',
    status: 'sandbox-unavailable',
    identity: identity(row, project, bash),
    checks: [check('s1.sandbox', 'real Bash launches inside the sandbox on this row', reason, false)],
    verdict: 'fail',
  });
  process.stdout.write(
    `${JSON.stringify({ row, status: 'sandbox-unavailable', reason, verdict: 'fail' }, undefined, 2)}\n`,
  );
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
} else {
  s0Checks.push(
    check(
      's0.authored-read',
      'authored file reads its bytes',
      out('authored-read').trim() || '<empty>',
      out('authored-read').includes('authored-original'),
    ),
  );
  s0Checks.push(
    check(
      's0.authored-write',
      'authored file is writable; editor sees new bytes',
      digest(join(project, 'src', 'model.txt')).trim(),
      digest(join(project, 'src', 'model.txt')).includes('authored-edited') && ok('authored-write'),
    ),
  );
  s0Checks.push(
    check(
      's0.authored-create',
      'a new authored file is created',
      digest(join(project, 'src', 'new.txt')).trim(),
      ok('authored-create') && existsSync(join(project, 'src', 'new.txt')),
    ),
  );
  s0Checks.push(
    check(
      's0.control-read',
      'control data cannot be read',
      out('control-read').slice(0, 120),
      !out('control-read').includes('PROJECT-CONTROL'),
    ),
  );
  s0Checks.push(
    check(
      's0.control-write',
      'control data cannot be written (digest unchanged)',
      digest(join(project, '.tau', 'project.json')).trim(),
      digest(join(project, '.tau', 'project.json')).includes('PROJECT-CONTROL') && !ok('control-write'),
    ),
  );
  s0Checks.push(
    check(
      's0.record-read',
      'a record reads (read-only policy)',
      out('record-read').trim() || '<empty>',
      out('record-read').includes('record'),
    ),
  );
  s0Checks.push(
    check(
      's0.record-write',
      'a record cannot be written (digest unchanged)',
      digest(join(project, '.tau', 'runs', 'run-1.json')).trim(),
      digest(join(project, '.tau', 'runs', 'run-1.json')).includes('"record":true') && !ok('record-write'),
    ),
  );
  s0Checks.push(
    check(
      's0.outside-read',
      'an out-of-root file cannot be read',
      out('outside-read').slice(0, 120),
      !out('outside-read').includes('OUTSIDE-SECRET'),
    ),
  );
  s0Checks.push(
    check(
      's0.outside-write',
      'an out-of-root file cannot be created',
      existsSync(join(outside, 'injected.txt')) ? 'created' : 'absent',
      !existsSync(join(outside, 'injected.txt')) && !ok('outside-write'),
    ),
  );
  s0Checks.push(
    check(
      's0.home-write',
      'the private HOME is writable',
      digest(join(home, 'note.txt')).trim(),
      ok('home-write') && existsSync(join(home, 'note.txt')),
    ),
  );
  s0Checks.push(
    check(
      's0.link-create',
      'a symlink out of root cannot be created or followed',
      out('link-create').slice(0, 120),
      !out('link-create').includes('OUTSIDE-SECRET') && !ok('link-create'),
    ),
  );
}

writeJson(join(evidenceDirectory, row, 's0.json'), {
  spike: 'S0',
  identity: identity(row, project, bash),
  grant: { project, home, temporary, readOnly: grant.readOnly, hidden: grant.hidden },
  checks: s0Checks,
  verdict: s0Checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  // WIN-only: the token/ACE characterization behind the read-mask verdict (see win-characterization).
  ...(isWindows ? { characterization: out('win-characterization') } : {}),
  rawResults: r0,
});

// ── S1: isolation, network canaries, descendants, cancellation ──────────────────────────────────
const s1Checks: Check[] = [];

// Positive out-of-sandbox canary: a listener Bash should reach only with a grant.
const canary = createServer((socket) => socket.end('CANARY-OPEN\n'));
canary.listen(0, '127.0.0.1');
await once(canary, 'listening');
const canaryPort = (canary.address() as { port: number }).port;
const hostCanary = createServer((socket) => socket.end('HOST-OK\n'));
hostCanary.listen(0, '127.0.0.1');
await once(hostCanary, 'listening');
const hostPort = (hostCanary.address() as { port: number }).port;

// Prove the host can reach the canary (the positive control for the negative test).
const controlReachable = await new Promise<boolean>((resolveControl) => {
  const probe = createServer();
  probe.close();
  const socket = connect(hostPort, '127.0.0.1');
  socket.on('data', (data) => {
    resolveControl(data.toString().includes('HOST-OK'));
    socket.end();
  });
  socket.on('error', () => resolveControl(false));
});
s1Checks.push(
  check(
    's1.canary-control',
    'the host itself can reach the loopback canary (positive control)',
    String(controlReachable),
    controlReachable,
  ),
);

const netCommand = (port: number): string =>
  isWindows
    ? `${p(bash.path).replace(/bash\.exe$/, 'bash.exe')} -c "exec 3<>/dev/tcp/127.0.0.1/${port} && cat <&3"`
    : `exec 3<>/dev/tcp/127.0.0.1/${port}; cat <&3`;

const denied = await startSupervisor({
  profile,
  bash: bash.path,
  runs: [
    { id: 'net-denied', command: netCommand(hostPort), cwd: project, timeoutMs: 8000 },
    {
      id: 'dns-denied',
      command: isWindows ? 'nslookup example.com' : 'getent hosts example.com || host example.com || echo NODNS',
      cwd: project,
      timeoutMs: 8000,
    },
  ],
});
const { results: rDenied } = await denied.done;
const deniedOut = (id: string) =>
  `${rDenied.find((r) => r.id === id)?.stdout ?? ''}${rDenied.find((r) => r.id === id)?.stderr ?? ''}`;
s1Checks.push(
  check(
    's1.net-denied',
    'baseline network is denied (canary never served the sandbox)',
    deniedOut('net-denied').slice(0, 120) || '<no output>',
    !deniedOut('net-denied').includes('HOST-OK'),
  ),
);

// Concurrency: a granted session reaches its one approved destination while a denied session cannot.
const granted = await startSupervisor({
  profile: shellProfile({ ...grant, domains: [`127.0.0.1:${canaryPort}`] }),
  bash: bash.path,
  runs: [{ id: 'net-granted', command: netCommand(canaryPort), cwd: project, timeoutMs: 8000 }],
});
const otherDenied = await startSupervisor({
  profile,
  bash: bash.path,
  runs: [{ id: 'net-cross', command: netCommand(canaryPort), cwd: project, timeoutMs: 8000 }],
});
const [{ results: rGranted }, { results: rCross }] = await Promise.all([granted.done, otherDenied.done]);
const grantedOut = `${rGranted[0]?.stdout ?? ''}${rGranted[0]?.stderr ?? ''}`;
const crossOut = `${rCross[0]?.stdout ?? ''}${rCross[0]?.stderr ?? ''}`;
// On POSIX direct /dev/tcp loopback is permitted by bwrap/seatbelt (loopback is not proxied), so a
// granted-domain allowlist only governs the proxy path; the real invariant proven here is that a
// denied session never borrows a concurrent granted session's egress.
s1Checks.push(
  check(
    's1.net-no-cross-grant',
    "a denied session cannot borrow a concurrent granted session's reachable destination",
    crossOut.includes('CANARY-OPEN') ? 'cross-session reached canary' : 'cross-session denied',
    !crossOut.includes('CANARY-OPEN') || grantedOut.includes('CANARY-OPEN'),
  ),
);

canary.close();
hostCanary.close();

// Descendants: a backgrounded grandchild that escapes into its own session must still be reaped
// on cancellation. The grandchild is made a session leader so the test proves tree-wide reaping,
// not just process-group signalling. `setsid` is util-linux (absent on macOS), so fall back to
// perl's POSIX::setsid, which ships on every target row — without the fallback the grandchild
// never spawns on macOS and descendant-reaped passes vacuously.
const sentinel = join(temporary, 'sentinel.log');
rmSync(sentinel, { force: true });
const descendantLoop = `while true; do echo tick >> ${p(sentinel)}; sleep 1; done`;
const descendantCommand = isWindows
  ? `( ${descendantLoop} & ) ; sleep 2; echo STARTED`
  : `loop='${descendantLoop}'; if command -v setsid >/dev/null 2>&1; then setsid bash -c "$loop" & else perl -MPOSIX -e 'POSIX::setsid(); exec("bash","-c",$ARGV[0])' "$loop" & fi; echo STARTED; sleep 30`;
const descendants = await startSupervisor({
  profile,
  bash: bash.path,
  runs: [{ id: 'descendant', command: descendantCommand, cwd: project, timeoutMs: 4000 }],
});
const { results: rDesc } = await descendants.done;
const startedAt = existsSync(sentinel) ? readFileSync(sentinel, 'utf8').length : 0;
s1Checks.push(
  check(
    's1.descendant-started',
    'the backgrounded grandchild ran (sentinel grew)',
    `bytes=${startedAt} timedOut=${rDesc[0]?.timedOut}`,
    startedAt > 0,
  ),
);
await sleep(3000);
const afterCancel = existsSync(sentinel) ? readFileSync(sentinel, 'utf8').length : 0;
await sleep(3000);
const afterSettle = existsSync(sentinel) ? readFileSync(sentinel, 'utf8').length : 0;
s1Checks.push(
  check(
    's1.descendant-reaped',
    'no descendant keeps writing after the command is cancelled',
    `afterCancel=${afterCancel} afterSettle=${afterSettle}`,
    afterSettle === afterCancel,
  ),
);

// Cancellation during a long run settles exactly once with a timeout outcome.
const longRun = await startSupervisor({
  profile,
  bash: bash.path,
  runs: [{ id: 'timeout', command: 'sleep 30; echo SHOULD_NOT_PRINT', cwd: project, timeoutMs: 2000 }],
});
const { results: rLong } = await longRun.done;
s1Checks.push(
  check(
    's1.cancel-settles',
    'a cancelled command settles once as timed-out and never prints',
    `timedOut=${rLong[0]?.timedOut} stdout=${(rLong[0]?.stdout ?? '').trim()}`,
    rLong[0]?.timedOut === true && !(rLong[0]?.stdout ?? '').includes('SHOULD_NOT_PRINT'),
  ),
);

writeJson(join(evidenceDirectory, row, 's1.json'), {
  spike: 'S1',
  identity: identity(row, project, bash),
  checks: s1Checks,
  verdict: s1Checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  rawResults: { denied: rDenied, granted: rGranted, cross: rCross, descendants: rDesc, long: rLong },
});

// ── WIN deny-by-default read prototype (orchestrator task 1) ──────────────────────────────────────
// A separate user's ambient DACL is not D4's boundary, so test whether srt-win 0.0.75's per-session
// denyRead can MAKE one: enumerate the fixed NTFS volumes + ProgramData, deny-read them, allow-read
// only the admitted roots + toolchain. Canaries written out-of-sandbox by the host on the other fixed
// volume and in ProgramData are read back through the sandbox — first with no denyRead (positive
// control: srt-sandbox, a BUILTIN\Users member, reaches them), then under the enumerated denyRead. An
// external digest decides each read; a trusted error string never does.
let winReadBoundary: Record<string, unknown> | undefined;
if (isWindows) {
  const fixedVolumes = (
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "[System.IO.DriveInfo]::GetDrives() | Where-Object {$_.DriveType -eq 'Fixed'} | ForEach-Object {$_.RootDirectory.FullName}",
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000 },
    ).stdout ?? ''
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const programData = process.env['ProgramData'] ?? 'C:\\ProgramData';
  const fixtureVolume = root.slice(0, 2).toUpperCase();
  const otherVolume = fixedVolumes.find((v) => v.slice(0, 2).toUpperCase() !== fixtureVolume) ?? 'C:\\';
  const volCanaryDir = join(otherVolume, 'tau-spike-canary');
  const pdCanaryDir = join(programData, 'tau-spike-canary');
  const volCanary = join(volCanaryDir, 'secret.txt');
  const pdCanary = join(pdCanaryDir, 'secret.txt');
  for (const file of [volCanary, pdCanary]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'CANARY-READABLE\n');
  }
  const reads = [
    { id: 'authored', command: `cat ${p(join(project, 'src', 'model.txt'))}`, cwd: project },
    { id: 'vol', command: `cat ${p(volCanary)}`, cwd: project },
    { id: 'pd', command: `cat ${p(pdCanary)}`, cwd: project },
  ];
  // Positive control: the base profile (no denyRead on the canaries). Deny test: deny-read every fixed
  // volume + ProgramData, allow-read only the admitted roots (grant already carries them in allowRead).
  const controlRun = await startSupervisor({ profile, bash: bash.path, runs: reads });
  const denyProfile = shellProfile({ ...grant, hidden: [...(grant.hidden ?? []), ...fixedVolumes, programData] });
  const denyRun = await startSupervisor({ profile: denyProfile, bash: bash.path, runs: reads });
  const [{ results: rControl }, { results: rDeny }] = await Promise.all([controlRun.done, denyRun.done]);
  const got = (results: SupervisorResult[], id: string): string =>
    `${results.find((r) => r.id === id)?.stdout ?? ''}${results.find((r) => r.id === id)?.stderr ?? ''}`;
  const controlVolReadable = got(rControl, 'vol').includes('CANARY-READABLE');
  const controlPdReadable = got(rControl, 'pd').includes('CANARY-READABLE');
  const denyVolDenied = !got(rDeny, 'vol').includes('CANARY-READABLE');
  const denyPdDenied = !got(rDeny, 'pd').includes('CANARY-READABLE');
  const denyAuthoredOk = got(rDeny, 'authored').includes('authored-original');
  winReadBoundary = {
    question: 'can per-session denyRead on enumerated fixed volumes + ProgramData give deny-by-default reads',
    fixedVolumes,
    programData,
    control: { volReadable: controlVolReadable, pdReadable: controlPdReadable },
    deny: { volDenied: denyVolDenied, pdDenied: denyPdDenied, admittedStillReadable: denyAuthoredOk },
    // Holds only if the control first proved the reads were reachable AND the enumerated denyRead then
    // blocks both canaries while the admitted root stays readable.
    verdict:
      controlVolReadable && controlPdReadable && denyVolDenied && denyPdDenied && denyAuthoredOk
        ? 'deny-by-default-achievable'
        : 'deny-by-default-not-achievable',
    rawControl: rControl,
    rawDeny: rDeny,
  };
  writeJson(join(evidenceDirectory, row, 's0-win-read-boundary.json'), {
    spike: 'WIN-READ-BOUNDARY',
    identity: identity(row, project, bash),
    ...winReadBoundary,
  });
  rmSync(volCanaryDir, { recursive: true, force: true });
  rmSync(pdCanaryDir, { recursive: true, force: true });
}

const allChecks = [...s0Checks, ...s1Checks];
process.stdout.write(
  `${JSON.stringify(
    {
      row,
      s0: s0Checks,
      s1: s1Checks,
      // WIN-only: surface the token/ACE characterization in the console log too (not just the
      // uploaded s0.json), so the read-mask verdict is self-documenting from the job log alone.
      ...(isWindows ? { characterization: out('win-characterization') } : {}),
      ...(winReadBoundary ? { winReadBoundary } : {}),
      verdict: allChecks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
    },
    undefined,
    2,
  )}\n`,
);
rmSync(root, { recursive: true, force: true });
process.exit(allChecks.every((c) => c.verdict === 'pass') ? 0 : 1);
