/**
 * The shell grant compiler (blueprint D4, D20, D26; A26): the admitted checkout's view plus exact extra folders and
 * host names, compiled into the provider's readable, writable, read-only and denied roots.
 *
 * The never-grantable set is refused at request time as `access-unsupported`, never silently narrowed. Everything the
 * classifier leaves read-only in the checkout (its records) stays readable but not writable; everything it hides, Tau's
 * app data and every other admitted project root are denied; the provider adds its own baseline (credential stores,
 * startup files, runtime sockets).
 */
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, sep, win32 } from 'node:path';

import { classify, pathRegistry, reservedTauDirectory } from '@taucad/filesystem/path-registry';
import { shellBaselineDenied } from '@taucad/native-process-core/shell';

import { shellLimits } from '#shell/shell-contract.js';
import type { ShellAccess } from '#shell/shell-contract.js';

/** Version-control directories no writable grant may expose (D20). */
const controlDirectoryNames: ReadonlySet<string> = new Set(['.git', '.hg', '.svn', '.jj']);

/** Directories a nested-control scan never enters: large, and never Tau's control state. */
const unscannedNames: ReadonlySet<string> = new Set(['node_modules']);

/** How far and how wide a nested-control scan looks before it stops. */
const scanDepth = 6;
const scanEntries = 20_000;

/** Exact host names only: no wildcard, IP literal, single label or local name (A06). */
const domainPattern = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u;
const localSuffixes = ['.localhost', '.local', '.internal', '.home.arpa'] as const;

/** @public */
export type ShellGrantHost = Readonly<{
  platform: NodeJS.Platform;
  /** The person's home or profile root. */
  home: string;
  /** The host environment, for `XDG_RUNTIME_DIR`, `APPDATA` and `LOCALAPPDATA`. */
  environment: Readonly<Record<string, string | undefined>>;
  /** Tau's app data (Electron `userData`, the host config directory): denied whole, never grantable. */
  appDataRoots: readonly string[];
  /** Every admitted project root on this device, the checkout's own included or not. */
  projectRoots: readonly string[];
}>;

/** A grant the compiler accepted: exact physical folders and lowercase host names. @public */
export type ShellResolvedAccess = Readonly<{
  read: readonly string[];
  write: readonly string[];
  domains: readonly string[];
}>;

/** @public */
export type ShellAccessRefusal = Readonly<{ status: 'refused'; message: string }>;

const isWindows = (platform: NodeJS.Platform): boolean => platform === 'win32';

const fold = (platform: NodeJS.Platform, path: string): string =>
  platform === 'darwin' || isWindows(platform) ? path.toLowerCase() : path;

/**
 * Whether `path` is `root` or lies inside it, compared as the platform's filesystem folds names.
 *
 * @param platform - The host platform.
 * @param path - An absolute path.
 * @param root - An absolute root.
 * @returns Whether `path` is within `root`.
 */
export const within = (platform: NodeJS.Platform, path: string, root: string): boolean => {
  const paths = isWindows(platform) ? win32 : posix;
  const relation = paths.relative(fold(platform, root), fold(platform, path));
  return relation === '' || (!relation.startsWith('..') && !paths.isAbsolute(relation));
};

/** The real path, or the nearest existing ancestor's real path joined with the rest: denied names may not exist yet. */
const physical = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(await physical(parent), basename(path));
  }
};

/** Roots no single grant may name: the filesystem and system roots, and the profile containers (D20). */
const systemRoots = (host: ShellGrantHost): readonly string[] => {
  if (isWindows(host.platform)) {
    const drive = win32.parse(host.home).root || 'C:\\';
    return [
      drive,
      host.environment['SystemRoot'] ?? win32.join(drive, 'Windows'),
      host.environment['ProgramFiles'] ?? win32.join(drive, 'Program Files'),
      host.environment['ProgramFiles(x86)'] ?? win32.join(drive, 'Program Files (x86)'),
      host.environment['ProgramData'] ?? win32.join(drive, 'ProgramData'),
      win32.join(drive, 'Users'),
      host.environment['APPDATA'] ?? win32.join(host.home, 'AppData', 'Roaming'),
      host.environment['LOCALAPPDATA'] ?? win32.join(host.home, 'AppData', 'Local'),
      win32.join(host.home, 'AppData'),
    ];
  }
  const shared = ['/', '/bin', '/sbin', '/usr', '/etc', '/var', '/opt', '/lib', '/dev', '/proc', '/sys', '/tmp'];
  return host.platform === 'darwin'
    ? [
        ...shared,
        '/System',
        '/Library',
        '/Applications',
        '/Users',
        '/Volumes',
        '/private',
        '/private/var',
        '/private/etc',
      ]
    : [...shared, '/home', '/root', '/srv', '/mnt', '/media', '/run', '/boot', '/lib64'];
};

/**
 * The checkout's own protected paths (D20, A04, E03): its records, which the shell may read but not write, and its
 * hidden control paths, which it may not touch. Each is an absolute path the provider masks.
 *
 * @public
 */
export type ShellProjectProtected = Readonly<{
  /** Records rows (`agentAccess: 'read-only'`): readable, never written, moved or replaced. */
  readOnly: readonly string[];
  /** Hidden rows, unknown `.tau` and top-level names, and nested version-control directories. */
  denied: readonly string[];
  /** The registry's directory rows among them, which are directories whenever they exist. */
  directories: readonly string[];
}>;

/**
 * The checkout's own control and record paths: every registry row the agent may not write, and every existing name
 * the classifier hides or protects, under any spelling the filesystem resolves (D20, A04). Read-only rows stay
 * readable (E03); every other protected name is denied.
 *
 * @param root - The checkout's real root.
 * @returns The read-only and denied absolute paths.
 */
export const projectProtected = async (root: string): Promise<ShellProjectProtected> => {
  const denied = new Set<string>();
  const readOnly = new Set<string>();
  const directories = new Set<string>();
  const protect = (path: string, agentAccess: string): void => {
    (agentAccess === 'read-only' ? readOnly : denied).add(path);
  };
  for (const row of pathRegistry) {
    if (row.agentAccess !== 'read-write') {
      const path = join(root, ...row.prefix.split('/'));
      protect(path, row.agentAccess);
      if (row.directory) {
        directories.add(path);
      }
    }
  }
  const denyListed = async (directory: string, prefix: string): Promise<string[]> => {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return [];
    }
    const listed: string[] = [];
    for (const name of names) {
      const { agentAccess } = classify(`${prefix}${name}`);
      if (agentAccess === 'read-write') {
        listed.push(name);
      } else {
        protect(join(directory, name), agentAccess);
      }
    }
    return listed;
  };
  const top = await denyListed(root, '');
  for (const name of top) {
    if (name.toLowerCase() === reservedTauDirectory) {
      // oxlint-disable-next-line no-await-in-loop -- the one `.tau` directory, under whatever spelling exists.
      await denyListed(join(root, name), `${reservedTauDirectory}/`);
    }
  }
  for (const path of await nestedControlDirectories(root)) {
    denied.add(path);
  }
  return {
    readOnly: [...readOnly].filter((path) => !denied.has(path)),
    denied: [...denied],
    directories: [...directories],
  };
};

/**
 * Every protected path of a checkout, read-only and denied alike: none of them may be granted (D20).
 *
 * @param checkout - The checkout's protected paths.
 * @returns The paths no grant may name.
 */
export const protectedPaths = (checkout: ShellProjectProtected): readonly string[] => [
  ...checkout.readOnly,
  ...checkout.denied,
];

/**
 * Version-control directories below `root`, within a bounded walk that skips `node_modules`. A nested repository's
 * control data is as protected as the root's (the registry's `segment` rows).
 *
 * @param root - The real root to scan.
 * @returns Absolute paths of the control directories found.
 */
export const nestedControlDirectories = async (root: string): Promise<readonly string[]> => {
  const found: string[] = [];
  let seen = 0;
  let level = [root];
  for (let depth = 0; depth < scanDepth && level.length > 0 && seen < scanEntries; depth++) {
    const next: string[] = [];
    for (const directory of level) {
      let entries;
      try {
        // oxlint-disable-next-line no-await-in-loop -- a bounded breadth-first walk.
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        seen++;
        const lower = entry.name.toLowerCase();
        if (controlDirectoryNames.has(lower)) {
          found.push(join(directory, entry.name));
        } else if (entry.isDirectory() && !unscannedNames.has(lower) && lower !== reservedTauDirectory) {
          next.push(join(directory, entry.name));
        }
      }
    }
    level = next;
  }
  return found;
};

/** The project controls an admitted project root keeps denied even when a grant opens the rest of it. */
const projectControls = (root: string): readonly string[] => [
  join(root, reservedTauDirectory),
  ...[...controlDirectoryNames].map((name) => join(root, name)),
];

/**
 * The set no grant may name (D20, D26): the provider's baseline, Tau's app data, every admitted project's own
 * controls, and the checkout's own denied paths.
 */
const neverGrantable = (host: ShellGrantHost, checkoutDenied: readonly string[]): readonly string[] => [
  ...shellBaselineDenied({ platform: host.platform, home: host.home, environment: host.environment }),
  ...host.appDataRoots,
  ...host.projectRoots.flatMap((root) => projectControls(root)),
  ...checkoutDenied,
];

/**
 * Resolve and check one access request. Folders must be absolute and exist; each is resolved to its physical path,
 * and one inside the never-grantable set, a whole home/profile/system root, or a version-control directory is refused
 * rather than narrowed. Host names must be exact.
 *
 * @param access - The request, as the model wrote it.
 * @param host - What the host knows about this device.
 * @param checkoutDenied - The checkout's own protected paths ({@link protectedPaths}).
 * @returns The resolved grant, or why it is refused.
 */
export const resolveShellAccess = async (
  access: ShellAccess | undefined,
  host: ShellGrantHost,
  checkoutDenied: readonly string[],
): Promise<ShellResolvedAccess | ShellAccessRefusal> => {
  const empty: ShellResolvedAccess = { read: [], write: [], domains: [] };
  if (access === undefined) {
    return empty;
  }
  const refuse = (message: string): ShellAccessRefusal => ({ status: 'refused', message });
  const lists = [access.read ?? [], access.write ?? [], access.domains ?? []];
  if (lists.every((list) => list.length === 0)) {
    return refuse('Name at least one folder or domain in access, or leave access out.');
  }
  if (lists.some((list) => list.length > shellLimits.accessEntries)) {
    return refuse(`Name at most ${String(shellLimits.accessEntries)} folders or domains in each access list.`);
  }
  const never = await Promise.all(neverGrantable(host, checkoutDenied).map(async (path) => physical(path)));
  const roots = await Promise.all(systemRoots(host).map(async (path) => physical(path)));
  const home = await physical(host.home);
  const folder = async (requested: string): Promise<string | ShellAccessRefusal> => {
    const absolute = isWindows(host.platform) ? win32.isAbsolute(requested) : posix.isAbsolute(requested);
    if (!absolute || requested.includes('\0')) {
      return refuse(`${requested} is not an absolute folder path.`);
    }
    let real: string;
    try {
      real = await realpath(requested);
      const info = await stat(real);
      if (!info.isDirectory()) {
        return refuse(`${requested} is not a folder. Grant the folder that holds it.`);
      }
    } catch {
      return refuse(`${requested} does not exist. Create it first, or grant an existing folder.`);
    }
    if (
      roots.some((root) => fold(host.platform, root) === fold(host.platform, real)) ||
      within(host.platform, home, real)
    ) {
      return refuse(`${requested} is a whole home, profile or system folder. Grant a named folder inside it.`);
    }
    if (
      real
        .split(isWindows(host.platform) ? /[\\/]/u : sep)
        .some((part) => controlDirectoryNames.has(part.toLowerCase()))
    ) {
      return refuse(`${requested} is version-control data, which the shell can never be granted.`);
    }
    const protectedPath = never.find((path) => within(host.platform, real, path));
    if (protectedPath !== undefined) {
      return refuse(
        `${requested} is inside ${protectedPath}, which holds credentials, Tau data or project control state and is never granted.`,
      );
    }
    return real;
  };
  const folders = async (requested: readonly string[]): Promise<string[] | ShellAccessRefusal> => {
    const resolved: string[] = [];
    for (const entry of requested) {
      // oxlint-disable-next-line no-await-in-loop -- the first refusal answers.
      const answer = await folder(entry);
      if (typeof answer !== 'string') {
        return answer;
      }
      resolved.push(answer);
    }
    return [...new Set(resolved)];
  };
  const read = await folders(access.read ?? []);
  if (!Array.isArray(read)) {
    return read;
  }
  const write = await folders(access.write ?? []);
  if (!Array.isArray(write)) {
    return write;
  }
  const domains: string[] = [];
  for (const requested of access.domains ?? []) {
    const name = requested.toLowerCase();
    if (!domainPattern.test(name) || /^[\d.]+$/u.test(name) || localSuffixes.some((suffix) => name.endsWith(suffix))) {
      return refuse(`${requested} is not an exact public host name such as registry.npmjs.org.`);
    }
    domains.push(name);
  }
  return { read, write, domains: [...new Set(domains)] };
};

/**
 * Replace each denied root that contains an allowed root with its contents minus the path down to that root, so the
 * allowed root stays reachable and everything else under the denied root stays denied. A denied root equal to an
 * allowed one is dropped: the grant names it exactly.
 */
const carve = async (
  platform: NodeJS.Platform,
  denied: readonly string[],
  allowed: readonly string[],
): Promise<readonly string[]> => {
  const result = new Set<string>();
  const expand = async (deny: string): Promise<void> => {
    const inside = allowed.filter((root) => within(platform, root, deny));
    if (inside.length === 0) {
      result.add(deny);
      return;
    }
    if (inside.some((root) => within(platform, deny, root))) {
      return;
    }
    let names: string[];
    try {
      names = await readdir(deny);
    } catch {
      return;
    }
    for (const name of names) {
      // oxlint-disable-next-line no-await-in-loop -- one level at a time down to each allowed root.
      await expand(join(deny, name));
    }
  };
  for (const deny of denied) {
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await expand(deny);
  }
  return [...result];
};

/** @public */
export type ShellFilesystemPlan = Readonly<{
  readable: readonly string[];
  writable: readonly string[];
  readOnly: readonly string[];
  denied: readonly string[];
  /** Protected paths that are directories when present, so an absent one is never stood in for by a file. */
  directories: readonly string[];
}>;

/**
 * Compile one launch's filesystem: the checkout and the private session roots writable, granted folders as granted,
 * toolchain roots readable, the checkout's records read-only, and everything else protected denied.
 *
 * @param input - The checkout's real root and its protected paths, the private roots, the grant and the host.
 * @returns The provider's roots.
 */
export const compileShellFilesystem = async (
  input: Readonly<{
    checkout: string;
    checkoutProtected: ShellProjectProtected;
    session: readonly string[];
    toolchain: readonly string[];
    access: ShellResolvedAccess;
    host: ShellGrantHost;
  }>,
): Promise<ShellFilesystemPlan> => {
  const { checkout, host, access } = input;
  const writable = [checkout, ...input.session, ...access.write];
  const readable = [...input.toolchain, ...access.read];
  const projects = await Promise.all(host.projectRoots.map(async (root) => physical(root)));
  /* Every other admitted project is denied whole (D20, F-22); a grant inside one is carved out exactly. */
  const others = projects.filter((root) => fold(host.platform, root) !== fold(host.platform, checkout));
  const appData = await Promise.all(host.appDataRoots.map(async (root) => physical(root)));
  const writeControlLists = await Promise.all(
    access.write.map(async (root) => [
      ...[...controlDirectoryNames].map((name) => join(root, name)),
      ...(await nestedControlDirectories(root)),
    ]),
  );
  const writeControls = writeControlLists.flat();
  const opened = await carve(host.platform, [...others, ...appData], [...writable, ...readable]);
  const denied = [
    ...input.checkoutProtected.denied,
    ...opened,
    ...others.flatMap((root) => projectControls(root)),
    ...writeControls,
  ];
  const deniedPaths = [...new Set(denied)].filter((path) => isAbsolute(path));
  return {
    readable: [...new Set(readable)],
    writable: [...new Set(writable)],
    /* A read-only path under a denied one stays denied: the provider re-allows reads of every read-only root. */
    readOnly: input.checkoutProtected.readOnly.filter(
      (path) => isAbsolute(path) && !deniedPaths.some((deny) => within(host.platform, path, deny)),
    ),
    denied: deniedPaths,
    directories: [...new Set([...input.checkoutProtected.directories, ...writeControls])],
  };
};

/**
 * The physical identity of a root: its real path and file identity, compared again just before a launch so a
 * replaced or re-pointed root is refused (A03, `root-changed`).
 *
 * @param path - The root.
 * @returns The real path and `realpath:dev:ino`, or `undefined` when it is not a resolvable folder.
 */
export const rootIdentity = async (
  path: string,
): Promise<Readonly<{ real: string; fingerprint: string }> | undefined> => {
  try {
    const real = await realpath(path);
    const status = await lstat(real);
    return status.isDirectory()
      ? { real, fingerprint: `${real}:${String(status.dev)}:${String(status.ino)}` }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Resolve a project-relative working directory inside the checkout, refusing traversal, absolute paths and a link
 * that leaves the checkout (A03).
 *
 * @param checkout - The checkout's real root.
 * @param requested - The requested project-relative directory; the checkout root when absent.
 * @returns The absolute directory, or why it is refused.
 */
export const resolveShellCwd = async (
  checkout: string,
  requested = '',
): Promise<Readonly<{ path: string; relative: string }> | ShellAccessRefusal> => {
  const refuse = (message: string): ShellAccessRefusal => ({ status: 'refused', message });
  if (
    requested.includes('\0') ||
    requested.includes('\\') ||
    requested.startsWith('/') ||
    /^[A-Za-z]:/u.test(requested) ||
    requested.split('/').some((part) => part === '..' || part === '.' || (part === '' && requested !== ''))
  ) {
    return refuse(`${requested} is not a project-relative folder. Use a path such as models/bracket, or omit cwd.`);
  }
  let real: string;
  try {
    real = await realpath(join(checkout, ...requested.split('/').filter(Boolean)));
    const info = await stat(real);
    if (!info.isDirectory()) {
      return refuse(`${requested} is not a folder.`);
    }
  } catch {
    return refuse(`${requested} does not exist in the project.`);
  }
  const relation = relative(checkout, real);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    return refuse(`${requested} leads outside the project.`);
  }
  if (classify(relation.split(sep).join('/')).agentAccess !== 'read-write' && relation !== '') {
    return refuse(`${requested} is Tau's own data, which the shell cannot use as its folder.`);
  }
  return { path: real, relative: relation.split(sep).join('/') };
};
