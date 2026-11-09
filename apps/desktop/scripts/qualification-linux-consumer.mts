/**
 * Linux clean-host consumer: a standard account without administrator rights runs the browser download, the AppImage
 * `chmod +x` and the app itself, and owns the app's profile, processes and FUSE mount. The administrator orchestrator
 * reaches it only through this unprivileged agent, which it starts as that account; the consumer has no path back.
 *
 * Usage (agent side, started by {@link startLinuxConsumer}): `sudo -n -u <consumer> -- env -i ... node --import
 * @oxc-node/core/register apps/desktop/scripts/qualification-linux-consumer.mts --serve`. Requests and replies are
 * single JSON lines on stdin/stdout; diagnostics go to stderr.
 */
/* oxlint-disable no-restricted-imports -- The agent composes adjacent private qualification owners. */
import { execFile, spawn, spawnSync } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Dirent } from 'node:fs';
import { chmod, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { downloadWithBrowser } from './qualification-browser-download.mjs';
import { linuxRuntimeFacts, measureLinuxSecurity } from './qualification-linux.mjs';
import type { LinuxCleanHostConsumer, LinuxRuntimeFacts } from './qualification-linux.mjs';
import type { LinuxCleanHost } from './qualification-evidence.mjs';
import { discoverQualificationProcesses } from './qualification-processes.mjs';
import type { QualificationProcesses, QualificationSecurity } from './qualification-platform-types.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
import {
  assertConsumerAgentHost,
  handleConsumerReply,
  linuxAccount,
  linuxConsumerEnvironment,
} from './qualification-linux-consumer-protocol.mjs';
/* oxlint-enable no-restricted-imports */

const absent = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const sha256File = async (path: string): Promise<string> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolvePath(path)) {
    throw new Error('Consumer digest requires a canonical regular file');
  }
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError('Expected binary file data');
    }
    hash.update(data);
  }
  return hash.digest('hex');
};
const run = async (
  file: string,
  args: readonly string[],
  options: { env: Record<string, string>; /** Milliseconds. */ killAfter: number },
): Promise<{ status: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      {
        env: { ...process.env, ...options.env },
        // The consumer's own home: a clean consumer cannot read the admin checkout the agent was started from.
        cwd: homedir(),
        timeout: options.killAfter,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const code = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ status: code, stdout, stderr: stderr || (error?.message ?? '') });
      },
    );
  });
/** Tau state a consumer home may hold: profiles, desktop entries and AppImages; a clean consumer has none. */
const consumerResidue = async (home: string): Promise<string[]> => {
  const found: string[] = [];
  const list = async (directory: string): Promise<string[]> => {
    try {
      return await readdir(directory);
    } catch (error) {
      if (absent(error)) {
        return [];
      }
      throw error;
    }
  };
  for (const name of await list(join(home, '.config'))) {
    if (/^tau\b/iu.test(name)) {
      found.push(join(home, '.config', name));
    }
  }
  for (const name of await list(join(home, '.local/share/applications'))) {
    if (/tau/iu.test(name)) {
      found.push(join(home, '.local/share/applications', name));
    }
  }
  const walk = async (directory: string, depth: number): Promise<void> => {
    let entries: Dirent[] = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // An unreadable folder holds nothing this account could launch.
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && /^tau.*\.appimage$/iu.test(entry.name)) {
        found.push(path);
      } else if (entry.isDirectory() && depth > 0 && !entry.name.startsWith('.')) {
        // oxlint-disable-next-line no-await-in-loop -- Bounded, ordered walk of the consumer's own folders.
        await walk(path, depth - 1);
      }
    }
  };
  await walk(home, 3);
  return found.sort();
};
/** The consumer's own main processes (no Chromium `--type=` child) whose executable matches `pattern`. */
const mainProcesses = async (pattern: string): Promise<Array<{ pid: number; uid: number; executable: string }>> => {
  const expression = new RegExp(pattern, 'u');
  const uid = process.getuid?.();
  const found: Array<{ pid: number; uid: number; executable: string }> = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/u.test(name)) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- A bounded /proc scan; processes may exit while it runs.
      const status = await readFile(`/proc/${name}/status`, 'utf8');
      const owner = Number(/^Uid:\s+(\d+)/mu.exec(status)?.[1]);
      if (owner !== uid) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Same bounded scan.
      const executable = await readlink(`/proc/${name}/exe`);
      // oxlint-disable-next-line no-await-in-loop -- Same bounded scan.
      const rawCommandLine = await readFile(`/proc/${name}/cmdline`, 'utf8');
      const commandLine = rawCommandLine.split('\0');
      if (expression.test(executable) && !commandLine.some((argument) => argument.startsWith('--type='))) {
        found.push({ pid: Number(name), uid: owner, executable });
      }
    } catch {
      // The process exited during the scan.
    }
  }
  return found;
};

const pidSchema = z.number().int().positive();
const envSchema = z.record(z.string(), z.string());
/** Each request is validated here, in the consumer's process; the orchestrator is never trusted with more. */
const handlers = {
  identity: async () => {
    const groups = spawnSync('id', ['-Gn'], { encoding: 'utf8', timeout: 30_000 });
    const sudo = spawnSync('sudo', ['-n', 'true'], { encoding: 'utf8', timeout: 30_000 });
    const glxinfo = spawnSync('glxinfo', ['-B'], { encoding: 'utf8', timeout: 60_000 });
    if (groups.status !== 0 || glxinfo.status !== 0) {
      throw new QualificationUnavailable(`Consumer observation failed: ${groups.stderr}${glxinfo.stderr}`);
    }
    return {
      name: userInfo().username,
      uid: process.getuid?.() ?? -1,
      home: homedir(),
      groups: groups.stdout.trim().split(/\s+/u),
      sudo: sudo.status === 0 ? 'allowed' : 'refused',
      glxinfo: glxinfo.stdout,
      existing: await consumerResidue(homedir()),
    };
  },
  readFile: async (params: unknown) => {
    const path = z.string().parse(params);
    try {
      const bytes = await readFile(path);
      return bytes.toString('base64');
    } catch (error) {
      if (absent(error)) {
        return null;
      }
      throw error;
    }
  },
  writeFile: async (params: unknown) => {
    const { path, data } = z.strictObject({ path: z.string(), data: z.string() }).parse(params);
    await writeFile(`${path}.tmp`, Buffer.from(data, 'base64'), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    return null;
  },
  stat: async (params: unknown) => {
    const path = z.string().parse(params);
    try {
      const info = await lstat(path);
      return { size: info.size, mode: info.mode, uid: info.uid };
    } catch (error) {
      if (absent(error)) {
        return null;
      }
      throw error;
    }
  },
  realpath: async (params: unknown) => realpath(z.string().parse(params)),
  mkdir: async (params: unknown) => {
    const { path, recursive } = z.strictObject({ path: z.string(), recursive: z.boolean() }).parse(params);
    await mkdir(path, { recursive, mode: 0o700 });
    return null;
  },
  readdir: async (params: unknown) => {
    try {
      return await readdir(z.string().parse(params));
    } catch (error) {
      if (absent(error)) {
        return null;
      }
      throw error;
    }
  },
  rm: async (params: unknown) => {
    await rm(z.string().parse(params), { force: true });
    return null;
  },
  sha256: async (params: unknown) => sha256File(z.string().parse(params)),
  chmod: async (params: unknown) => {
    const { path, mode } = z.strictObject({ path: z.string(), mode: z.number().int().min(0).max(0o777) }).parse(params);
    await chmod(path, mode);
    const info = await lstat(path);
    return info.mode;
  },
  alive: async (params: unknown) => {
    try {
      process.kill(pidSchema.parse(params), 0);
      return true;
    } catch {
      return false;
    }
  },
  signal: async (params: unknown) => {
    const { pid, signal } = z.strictObject({ pid: pidSchema, signal: z.enum(['SIGTERM', 'SIGKILL']) }).parse(params);
    process.kill(pid, signal);
    return null;
  },
  exec: async (params: unknown) => {
    const { file, args, env, timeout } = z
      .strictObject({
        file: z.string(),
        args: z.array(z.string()),
        env: envSchema,
        timeout: z.number().int().positive().max(1_800_000),
      })
      .parse(params);
    return run(file, args, { env, killAfter: timeout });
  },
  spawn: async (params: unknown) => {
    const { file, args, env } = z
      .strictObject({ file: z.string(), args: z.array(z.string()), env: envSchema })
      .parse(params);
    const child = spawn(file, args, {
      env: { ...process.env, ...env },
      cwd: homedir(),
      detached: true,
      // Keep native loader/FUSE/sandbox startup errors in the disposable job log.
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    return pidSchema.parse(child.pid);
  },
  mainProcesses: async (params: unknown) => mainProcesses(z.string().parse(params)),
  download: async (params: unknown) => {
    const options = z.strictObject({ url: z.url(), directory: z.string(), name: z.string() }).parse(params);
    const downloaded = await downloadWithBrowser(options);
    const info = await lstat(downloaded.path);
    return {
      ...downloaded,
      sha256: await sha256File(downloaded.path),
      size: info.size,
      mode: info.mode,
      uid: info.uid,
    };
  },
  measureSecurity: async (params: unknown) =>
    measureLinuxSecurity(
      z
        .strictObject({
          mainPid: pidSchema,
          rendererPids: z.array(pidSchema),
          nativeChildPids: z.array(pidSchema),
        })
        .parse(params),
    ),
  discoverProcesses: async (params: unknown) => {
    const { mainPid, rendererPid } = z.strictObject({ mainPid: pidSchema, rendererPid: pidSchema }).parse(params);
    return discoverQualificationProcesses(mainPid, rendererPid);
  },
  runtime: async (params: unknown) => {
    const { pid, resource, image } = z
      .strictObject({ pid: pidSchema, resource: z.string(), image: z.boolean() })
      .parse(params);
    return linuxRuntimeFacts(pid, resource, image);
  },
} satisfies Record<string, (params: unknown) => Promise<unknown>>;
type Method = keyof typeof handlers;

/** Agent side: answer the orchestrator's requests as this (consumer) account until stdin closes. */
const serve = async (input: Readable, output: Writable): Promise<void> => {
  assertConsumerAgentHost(process.getuid?.(), process.env['TAU_QUALIFICATION_DISPOSABLE_HOST']);
  // Each request settles itself (it never rejects); the agent drains them all before it exits.
  const pending: Array<Promise<void>> = [];
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const { id, method, params } = z
      .strictObject({ id: z.number().int(), method: z.string(), params: z.unknown() })
      .parse(JSON.parse(line));
    const task = (async () => {
      try {
        if (!Object.hasOwn(handlers, method)) {
          throw new Error(`Unknown consumer request ${method}`);
        }
        const result = await handlers[method as Method](params);
        output.write(`${JSON.stringify({ id, ok: true, result })}\n`);
      } catch (error) {
        output.write(
          `${JSON.stringify({ id, ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
        );
      }
    })();
    pending.push(task);
  }
  await Promise.all(pending);
};

export type LinuxConsumer = LinuxCleanHostConsumer & {
  identity(): Promise<{
    name: string;
    uid: number;
    home: string;
    groups: string[];
    sudo: 'refused' | 'allowed';
    glxinfo: string;
    existing: string[];
  }>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  writeFile(path: string, data: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mode: number; uid: number } | undefined>;
  realpath(path: string): Promise<string>;
  mkdirOne(path: string): Promise<void>;
  readdir(path: string): Promise<string[] | undefined>;
  rm(path: string): Promise<void>;
  alive(pid: number): Promise<boolean>;
  signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): Promise<void>;
  discoverProcesses(mainPid: number, rendererPid: number): Promise<ReturnType<typeof discoverQualificationProcesses>>;
  close(): Promise<void>;
};

/** Administrator side: start the agent as `name` and expose its operations; a dead agent fails every request. */
export const startLinuxConsumer = async (options: { name: string; repository: string }): Promise<LinuxConsumer> => {
  const account = linuxAccount(options.name);
  if (account.uid === process.getuid?.() || account.uid < 1000) {
    throw new Error('The consumer must be a separate standard account');
  }
  const environment = Object.entries(linuxConsumerEnvironment(account)).map(([key, value]) => `${key}=${value}`);
  // oxlint-disable-next-line typescript/no-restricted-types -- Node's type for an inherited stderr stream.
  const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
    'sudo',
    [
      '-n',
      '-u',
      account.name,
      '--',
      '/usr/bin/env',
      '-i',
      ...environment,
      process.execPath,
      '--import',
      '@oxc-node/core/register',
      join(options.repository, 'apps/desktop/scripts/qualification-linux-consumer.mts'),
      '--serve',
    ],
    { cwd: options.repository, stdio: ['pipe', 'pipe', 'inherit'] },
  );
  let next = 0;
  let failure: Error | undefined;
  const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const fail = (error: Error): void => {
    failure ??= error;
    for (const entry of waiting.values()) {
      entry.reject(failure);
    }
    waiting.clear();
  };
  child.once('error', fail);
  child.once('exit', (code, signal) => {
    fail(new Error(`Consumer agent exited (${code ?? signal})`));
  });
  const replies = createInterface({ input: child.stdout, crlfDelay: Infinity });
  replies.on('line', (line) => {
    handleConsumerReply(line, {
      waiting,
      account: account.name,
      fail: (error) => {
        fail(error);
        child.kill('SIGTERM');
      },
    });
  });
  const call = async (method: Method, params: unknown = null): Promise<unknown> => {
    if (failure) {
      throw failure;
    }
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  };
  const runtimeSchema = z.strictObject({
    pid: pidSchema,
    startTime: z.string(),
    executable: z.string(),
    resourcePath: z.string(),
    resourceSha256: z.string(),
    image: z.strictObject({ executableSha256: z.string(), asarSha256: z.string() }).optional(),
  });
  const consumer: LinuxConsumer = {
    ...account,
    identity: async () =>
      z
        .strictObject({
          name: z.string(),
          uid: z.number().int(),
          home: z.string(),
          groups: z.array(z.string()),
          sudo: z.enum(['refused', 'allowed']),
          glxinfo: z.string(),
          existing: z.array(z.string()),
        })
        .parse(await call('identity')),
    readFile: async (path) => {
      const data = z
        .string()
        .nullable()
        .parse(await call('readFile', path));
      return data === null ? undefined : Buffer.from(data, 'base64');
    },
    writeFile: async (path, data) => {
      await call('writeFile', { path, data: Buffer.from(data).toString('base64') });
    },
    stat: async (path) =>
      z
        .strictObject({ size: z.number(), mode: z.number(), uid: z.number() })
        .nullable()
        .parse(await call('stat', path)) ?? undefined,
    realpath: async (path) => z.string().parse(await call('realpath', path)),
    mkdir: async (path) => {
      await call('mkdir', { path, recursive: true });
    },
    mkdirOne: async (path) => {
      await call('mkdir', { path, recursive: false });
    },
    readdir: async (path) =>
      z
        .array(z.string())
        .nullable()
        .parse(await call('readdir', path)) ?? undefined,
    rm: async (path) => {
      await call('rm', path);
    },
    sha256: async (path) => z.string().parse(await call('sha256', path)),
    chmod: async (path, mode) =>
      z
        .number()
        .int()
        .parse(await call('chmod', { path, mode })),
    alive: async (pid) => z.boolean().parse(await call('alive', pid)),
    signal: async (pid, signal) => {
      await call('signal', { pid, signal });
    },
    exec: async (file, args, options = {}) =>
      z.strictObject({ status: z.number().int(), stdout: z.string(), stderr: z.string() }).parse(
        await call('exec', {
          file,
          args: [...args],
          env: options.env ?? {},
          timeout: options.killAfter ?? 180_000,
        }),
      ),
    spawn: async (file, args, env) => pidSchema.parse(await call('spawn', { file, args: [...args], env })),
    mainProcesses: async (pattern) =>
      z
        .array(z.strictObject({ pid: pidSchema, uid: z.number().int(), executable: z.string() }))
        .parse(await call('mainProcesses', pattern)),
    download: async (download) =>
      z
        .strictObject({
          path: z.string(),
          browser: z.string(),
          sha256: z.string(),
          size: z.number().int(),
          mode: z.number().int(),
          uid: z.number().int(),
        })
        .parse(await call('download', download)),
    // The agent accepts exactly these fields; the admin-side nativeAncestry stays on this side.
    measureSecurity: async ({ mainPid, rendererPids, nativeChildPids }: QualificationProcesses) =>
      (await call('measureSecurity', { mainPid, rendererPids, nativeChildPids })) as QualificationSecurity,
    discoverProcesses: async (mainPid, rendererPid) =>
      (await call('discoverProcesses', { mainPid, rendererPid })) as ReturnType<typeof discoverQualificationProcesses>,
    runtime: async (pid, resource, image): Promise<LinuxRuntimeFacts> => {
      const facts = runtimeSchema.parse(await call('runtime', { pid, resource, image }));
      return {
        pid: facts.pid,
        startTime: facts.startTime,
        executable: facts.executable,
        resourcePath: facts.resourcePath,
        resourceSha256: facts.resourceSha256,
        ...(facts.image ? { image: facts.image } : {}),
      };
    },
    close: async () => {
      child.stdin.end();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
        } else {
          child.once('exit', () => {
            resolve();
          });
        }
      });
    },
  };
  // The agent must answer as the requested account before anything else uses it.
  const identity = await consumer.identity();
  if (identity.uid !== account.uid || identity.name !== account.name || identity.home !== account.home) {
    throw new Error('Consumer agent runs as another account');
  }
  return consumer;
};

const metadata = async (path: string): Promise<string> => {
  const response = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/${path}`, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new QualificationUnavailable(`Compute Engine metadata ${path} unavailable`);
  }
  const text = await response.text();
  return text.trim();
};
const sudoOutput = (args: string[]): string => {
  const result = spawnSync('sudo', ['-n', ...args], { encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) {
    throw new QualificationUnavailable(`Host observation failed: ${result.stderr}`);
  }
  return result.stdout;
};
/** Tau packages, trees, repository, trust and launchers already on the host; the run itself never deletes them. */
const systemResidue = async (): Promise<string[]> => {
  const found: string[] = [];
  // oxlint-disable-next-line no-template-curly-in-string -- dpkg-query's own field format, not a template.
  const packages = spawnSync('dpkg-query', ['-W', '-f=${binary:Package} ${db:Status-Status}\n'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (packages.status !== 0) {
    throw new QualificationUnavailable('Package database unreadable');
  }
  found.push(
    ...packages.stdout
      .split('\n')
      .filter((line) => /^tau(?:-staging)?(?:-appimage)?(?:-runtime-\S+)? (?!not-installed)/u.test(line))
      .map((line) => `dpkg:${line}`),
  );
  for (const [directory, pattern] of [
    ['/opt', /^tau/u],
    ['/usr/bin', /^tau(?:-staging)?(?:-appimage)?$/u],
    ['/usr/share/applications', /^tau/iu],
    ['/etc/apt/sources.list.d', /tau/u],
    ['/etc/apt/keyrings', /tau/u],
    ['/usr/share/keyrings', /tau/u],
    ['/etc/apt/apt.conf.d', /tau/u],
    ['/etc/apparmor.d', /^tau/u],
    ['/usr/local/share/ca-certificates', /^tau-qualification/u],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- A short ordered list of system folders.
    for (const name of await readdir(directory).catch(() => [])) {
      if (pattern.test(name)) {
        found.push(join(directory, name));
      }
    }
  }
  return found;
};
/**
 * Raw facts only; `assertLinuxCleanHost` in the evidence writer decides whether they qualify. The trusted host identity
 * (`compute`) is the runner's Compute API description of the instance it created; the guest's metadata-server instance
 * name and zone must match it. Consumer facts come from the consumer's own agent.
 */
export const observeLinuxCleanHost = async (
  consumer: LinuxConsumer,
  compute: { template: string; instance: string; zone: string },
): Promise<LinuxCleanHost> => {
  const identity = await consumer.identity();
  let restriction = 'absent';
  try {
    const value = await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8');
    restriction = value.trim();
  } catch (error) {
    if (!absent(error)) {
      throw error;
    }
  }
  const appArmorEnabled = await readFile('/sys/module/apparmor/parameters/enabled', 'utf8');
  return {
    gcp: {
      instance: await metadata('name'),
      zone: await metadata('zone'),
      compute,
    },
    osRelease: await readFile('/etc/os-release', 'utf8'),
    kernel: spawnSync('uname', ['-r'], { encoding: 'utf8' }).stdout.trim(),
    machine: spawnSync('uname', ['-m'], { encoding: 'utf8' }).stdout.trim(),
    appArmorEnabled: appArmorEnabled.trim(),
    usernsRestriction: restriction,
    glxinfo: identity.glxinfo,
    consumer: {
      name: identity.name,
      uid: identity.uid,
      home: identity.home,
      groups: identity.groups,
      sudo: identity.sudo,
    },
    administrator: { name: userInfo().username, uid: process.getuid?.() ?? -1 },
    // Root lists the consumer home too, so a residue the consumer cannot see still counts.
    existing: [
      ...(await systemResidue()),
      ...identity.existing,
      ...sudoOutput([
        'find',
        identity.home,
        '-maxdepth',
        '4',
        '(',
        '-iname',
        'tau*.appimage',
        '-o',
        '-path',
        `${identity.home}/.config/Tau*`,
        ')',
        '-print',
      ])
        .split('\n')
        .filter((line) => line.length > 0 && !identity.existing.includes(line)),
    ].sort(),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  if (process.argv[2] !== '--serve') {
    throw new Error('Usage: qualification-linux-consumer.mts --serve');
  }
  await serve(process.stdin, process.stdout);
}
