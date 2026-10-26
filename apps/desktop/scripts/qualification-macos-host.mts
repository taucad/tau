/** Clean-host Mac observations and LaunchServices launches for `vm` acceptance; never changes host security settings. */
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
/* oxlint-disable no-restricted-imports -- Clean-host observations share the collector's raw-fact contract. */
import { macosCleanHostApplication } from './qualification-evidence.mjs';
import type { MacosCleanHost, MacosCleanLaunch } from './qualification-evidence.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */

const run = (file: string, args: string[], timeout = 60_000) =>
  spawnSync(file, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
const output = (file: string, args: string[]): string => {
  const result = run(file, args);
  if (result.status !== 0) {
    throw new QualificationUnavailable(`${file} observation failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout.trim();
};
/** A missing sysctl OID is a distinct observation (Intel hosts lack some), not a failure to observe. */
const sysctl = (name: string): string => {
  const result = run('/usr/sbin/sysctl', ['-n', name]);
  return result.status === 0 ? result.stdout.trim() : 'absent';
};

/** Prior Tau installations and profiles that make a host unclean; the run itself never deletes them. */
export const macosCleanHostResidue = async (home = homedir()): Promise<string[]> => {
  const residue: string[] = [];
  for (const application of await readdir('/Applications')) {
    if (/^Tau(?: Staging)?\.app$/u.test(application)) {
      residue.push(join('/Applications', application));
    }
  }
  const entries = async (directory: string): Promise<string[]> => {
    try {
      return await readdir(directory);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  };
  const support = join(home, 'Library/Application Support');
  const profiles = await entries(support);
  residue.push(...profiles.filter((name) => name.startsWith('Tau')).map((name) => join(support, name)));
  // A leftover Squirrel.Mac (ShipIt) cache could carry another run's staged update.
  const caches = join(home, 'Library/Caches');
  const cached = await entries(caches);
  residue.push(...cached.filter((name) => name.startsWith('com.taucad.tau.desktop')).map((name) => join(caches, name)));
  return residue.sort();
};

/** Raw facts only; `assertMacosCleanHost` in the evidence writer decides whether they qualify. */
export const observeMacosCleanHost = async (runner: string): Promise<MacosCleanHost> => {
  if (process.platform !== 'darwin') {
    throw new QualificationUnavailable('Clean-host acceptance requires macOS');
  }
  const gatekeeper = run('/usr/sbin/spctl', ['--status']);
  return {
    runner,
    productVersion: output('/usr/bin/sw_vers', ['-productVersion']),
    machine: output('/usr/bin/uname', ['-m']),
    arm64: sysctl('hw.optional.arm64'),
    translated: sysctl('sysctl.proc_translated'),
    sip: output('/usr/bin/csrutil', ['status']),
    // The spctl tool reports a disabled assessment subsystem with a non-zero status; keep its text as the observation.
    gatekeeper: `${gatekeeper.stdout}${gatekeeper.stderr}`.trim(),
    existing: await macosCleanHostResidue(),
  };
};

/** The quarantine xattr, or undefined when the file carries none. */
export const readMacosQuarantine = (path: string): string | undefined => {
  const result = run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', path]);
  return result.status === 0 ? result.stdout.trim() : undefined;
};

const processes = (executable: string): number[] =>
  output('/bin/ps', ['-axo', 'pid=,comm='])
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(.*)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match?.[2] === executable)
    .map((match) => Number(match[1]));

/**
 * Answer Gatekeeper's "downloaded from the Internet" first-launch prompt for Tau, exactly as a user clicking Open would.
 * It needs Accessibility permission for the runner; it never changes Gatekeeper, quarantine or SIP.
 */
const approveFirstLaunchPrompt = (): { clicked: boolean; error?: string } => {
  const result = run('/usr/bin/osascript', [
    '-e',
    `tell application "System Events"
  if not (exists process "CoreServicesUIAgent") then return "none"
  tell process "CoreServicesUIAgent"
    repeat with prompt in windows
      set texts to (value of every static text of prompt) as text
      if (exists button "Open" of prompt) and texts contains "Tau" then
        click button "Open" of prompt
        return "clicked"
      end if
    end repeat
  end tell
end tell
return "none"`,
  ]);
  return result.status === 0
    ? { clicked: result.stdout.trim() === 'clicked' }
    : { clicked: false, error: result.stderr.trim() };
};

/** Launch the installed app through LaunchServices (`open`), not by executing its binary, and return its new main PID. */
export const launchMacosApplication = async (options: {
  stage: MacosCleanLaunch['stage'];
  args: readonly string[];
  env: Readonly<Record<string, string>>;
  /** Milliseconds to wait for the launched main process. */
  launchTimeout?: number;
}): Promise<MacosCleanLaunch> => {
  const application = macosCleanHostApplication;
  const quarantineBefore = readMacosQuarantine(application);
  if (!quarantineBefore) {
    throw new Error('Clean-host launch requires the installed app to still carry com.apple.quarantine');
  }
  const executable = join(application, 'Contents/MacOS/Tau');
  const before = new Set(processes(executable));
  const environment = Object.entries(options.env).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  output('/usr/bin/open', ['-n', '-a', application, ...environment, '--args', ...options.args]);
  let prompt: MacosCleanLaunch['prompt'] = 'absent';
  let promptError: string | undefined;
  const deadline = Date.now() + (options.launchTimeout ?? 180_000);
  while (Date.now() < deadline) {
    const started = processes(executable).filter((pid) => !before.has(pid));
    if (started.length > 1) {
      throw new Error('Ambiguous clean-host launch: several new Tau main processes');
    }
    if (started.length === 1) {
      return {
        stage: options.stage,
        via: 'open',
        application,
        pid: started[0]!,
        prompt,
        quarantineBefore,
        quarantineAfter: readMacosQuarantine(application) ?? 'absent',
      };
    }
    const approval = approveFirstLaunchPrompt();
    if (approval.clicked) {
      prompt = 'approved';
    }
    promptError = approval.error;
    // oxlint-disable-next-line no-await-in-loop -- Poll LaunchServices and the Gatekeeper prompt in order.
    await wait(1000);
  }
  throw new QualificationUnavailable(
    `Clean-host app did not start through LaunchServices${promptError ? `; first-launch prompt: ${promptError}` : ''}`,
  );
};
