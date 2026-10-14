import { maxSatisfying, satisfies, validRange } from 'semver';

import type { PackageIssue, PackageLock, PackageLockEntry } from '#package-lock.types.js';
import { fetchPackument, isPackageName, isRecord, stringRecord } from '#package-registry.js';
import type { Packument, PackageRegistry } from '#package-registry.js';

/** Input for one deterministic resolution of a project's dependency tree. @public */
export type ResolveDependencyTreeInput = {
  /** Parsed package.json; `dependencies`, `devDependencies` and `optionalDependencies` are resolved. */
  readonly manifest: Readonly<Record<string, unknown>>;
  /** Existing lock whose versions are preferred for unchanged ranges, as `npm install` does. */
  readonly previousLock?: PackageLock;
  /** Package names resolved afresh even when `previousLock` holds a satisfying version. */
  readonly upgrade?: readonly string[];
  /** Packument source; defaults to the public npm registry. */
  readonly registry?: PackageRegistry;
  readonly signal: AbortSignal;
};

/** Resolution outcome. `lock` is absent when any issue other than `install-script-skipped` was found. @public */
export type ResolveDependencyTreeResult = {
  readonly lock?: PackageLock;
  readonly issues: readonly PackageIssue[];
};

type EdgeKind = 'prod' | 'dev' | 'optional' | 'peer';

type Spec = { readonly name: string; readonly alias: boolean } & (
  | { readonly range: string; readonly tag?: undefined }
  | { readonly tag: string; readonly range?: undefined }
);

type TreeNode = {
  readonly path: string;
  readonly parent: TreeNode | undefined;
  readonly depth: number;
  readonly children: Map<string, TreeNode>;
  readonly realName: string;
  readonly version: string;
  /** Lock row without location-dependent fields (`name`, flags). */
  readonly entry: PackageLockEntry;
  readonly edges: Edge[];
};

type Edge = { readonly name: string; readonly raw: string; readonly kind: EdgeKind; spec?: Spec; to?: TreeNode };

type Choice =
  | { readonly version: string; readonly entry: PackageLockEntry }
  | { readonly issue: PackageIssue }
  | 'skip';

// ponytail: fixed ceiling on tree size; make it an input if a real project needs more.
const maximumPackages = 10_000;
const registryPrefix = 'https://registry.npmjs.org/';
const installScripts = ['preinstall', 'install', 'postinstall'];

const parseSpec = (name: string, raw: string): Spec | undefined => {
  let realName = name;
  let spec = raw.trim();
  const alias = spec.startsWith('npm:');
  if (alias) {
    const body = spec.slice(4);
    const at = body.indexOf('@', 1);
    realName = at === -1 ? body : body.slice(0, at);
    spec = at === -1 ? '' : body.slice(at + 1);
  }
  if (!isPackageName(realName)) {
    return undefined;
  }
  if (validRange(spec, { loose: true }) !== null) {
    return { name: realName, alias, range: spec === '' ? '*' : spec };
  }
  return /^[A-Za-z][\w.-]*$/u.test(spec) && !/\.(?:tgz|tar|tar\.gz)$/u.test(spec)
    ? { name: realName, alias, tag: spec }
    : undefined;
};

// As npm's dep-valid: a tag accepts any registry version, `*` accepts prereleases.
const satisfiesSpec = (node: Pick<TreeNode, 'realName' | 'version'>, spec: Spec): boolean =>
  node.realName === spec.name &&
  (spec.tag !== undefined || spec.range === '*' || satisfies(node.version, spec.range, { loose: true }));

// As npm-pick-manifest: prefer the `latest` tag when it satisfies, then the highest non-deprecated version.
const pickVersion = (packument: Packument, spec: Spec): string | undefined => {
  const { versions } = packument;
  if (spec.tag !== undefined) {
    return packument['dist-tags'][spec.tag];
  }
  const { latest } = packument['dist-tags'];
  if (
    latest !== undefined &&
    Object.hasOwn(versions, latest) &&
    versions[latest]?.deprecated === undefined &&
    (spec.range === '*' || satisfies(latest, spec.range, { loose: true }))
  ) {
    return latest;
  }
  const all = Object.keys(versions);
  const current = all.filter((version) => versions[version]?.deprecated === undefined);
  return (
    maxSatisfying(current, spec.range, { loose: true }) ?? maxSatisfying(all, spec.range, { loose: true }) ?? undefined
  );
};

// Drop absent fields so lock rows compare and serialize without `undefined` keys.
const compact = <T extends Record<string, unknown>>(value: T): T =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- filtering undefined values keeps every remaining field's type
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

const sha1Integrity = (shasum: string): string | undefined => {
  if (!/^[\da-f]{40}$/u.test(shasum)) {
    return undefined;
  }
  const bytes = shasum.match(/../gu)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  // oxlint-disable-next-line no-restricted-globals -- btoa is the standard browser API; one call does not justify a dependency
  return `sha1-${btoa(String.fromCodePoint(...bytes))}`;
};

const stringList = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string') ? value : undefined;

const nonEmptyRecord = (value: unknown): Readonly<Record<string, string>> | undefined =>
  stringRecord(value) && Object.keys(value).length > 0 ? value : undefined;

const normalizeBin = (name: string, bin: unknown): Readonly<Record<string, string>> | undefined => {
  const map = typeof bin === 'string' ? { [name.split('/').at(-1) ?? name]: bin } : bin;
  if (!stringRecord(map) || Object.keys(map).length === 0) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(map).map(([key, path]) => [key, path.replace(/^(?:\.\/)+/u, '')]));
};

// Convert one registry version document into the lock row npm writes for it.
const versionEntry = (document: unknown, name: string, version: string): PackageLockEntry | undefined => {
  if (!isRecord(document) || document['name'] !== name || document['version'] !== version) {
    return undefined;
  }
  const { dist, scripts, license, peerDependenciesMeta } = document;
  if (!isRecord(dist) || typeof dist['tarball'] !== 'string' || !dist['tarball'].startsWith(registryPrefix)) {
    return undefined;
  }
  const integrity =
    typeof dist['integrity'] === 'string'
      ? dist['integrity']
      : typeof dist['shasum'] === 'string'
        ? sha1Integrity(dist['shasum'])
        : undefined;
  if (integrity === undefined || !/^sha(?:1|256|384|512)-[\d+/A-Za-z]+={0,2}$/u.test(integrity)) {
    return undefined;
  }
  const meta = isRecord(peerDependenciesMeta)
    ? Object.fromEntries(
        Object.entries(peerDependenciesMeta).map(([peer, flags]) => [
          peer,
          isRecord(flags) && flags['optional'] === true ? { optional: true } : {},
        ]),
      )
    : undefined;
  const licenseName = typeof license === 'string' ? license : isRecord(license) ? license['type'] : undefined;
  const entry: PackageLockEntry = {
    version,
    resolved: dist['tarball'],
    integrity,
    dependencies: nonEmptyRecord(document['dependencies']),
    optionalDependencies: nonEmptyRecord(document['optionalDependencies']),
    peerDependencies: nonEmptyRecord(document['peerDependencies']),
    peerDependenciesMeta: meta !== undefined && Object.keys(meta).length > 0 ? meta : undefined,
    engines: nonEmptyRecord(document['engines']),
    bin: normalizeBin(name, document['bin']),
    license: typeof licenseName === 'string' ? licenseName : undefined,
    os: stringList(document['os']),
    cpu: stringList(document['cpu']),
    hasInstallScript:
      document['hasInstallScript'] === true ||
      (isRecord(scripts) && installScripts.some((script) => Object.hasOwn(scripts, script))) ||
      undefined,
  };
  return compact(entry);
};

// Strip location-dependent fields from a previously locked row.
const baseEntry = (entry: PackageLockEntry): PackageLockEntry => {
  const { name: _name, dev: _dev, optional: _optional, devOptional: _devOptional, peer: _peer, ...rest } = entry;
  return rest;
};

const comparePaths = (left: string, right: string): number => left.localeCompare(right, 'en');

const childPath = (level: TreeNode, name: string): string =>
  `${level.path === '' ? '' : `${level.path}/`}node_modules/${name}`;

const isWithin = (node: TreeNode | undefined, level: TreeNode): boolean => {
  for (let current = node; current !== undefined; current = current.parent) {
    if (current === level) {
      return true;
    }
  }
  return false;
};

// Node resolution: the nearest `node_modules/<name>` from `start` upward.
const resolveFrom = (start: TreeNode, name: string): TreeNode | undefined => {
  for (let level: TreeNode | undefined = start; level !== undefined; level = level.parent) {
    const found = level.children.get(name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

const edgesOf = (node: TreeNode, manifest: Readonly<Record<string, unknown>> | undefined): Edge[] => {
  const edges = new Map<string, Edge>();
  const add = (deps: unknown, kind: EdgeKind, include: (name: string) => boolean = () => true): void => {
    if (!isRecord(deps)) {
      return;
    }
    for (const [name, raw] of Object.entries(deps)) {
      if (include(name)) {
        edges.set(name, { name, raw: typeof raw === 'string' ? raw : String(raw), kind });
      }
    }
  };
  if (manifest === undefined) {
    const { entry } = node;
    add(entry.dependencies, 'prod');
    add(entry.optionalDependencies, 'optional');
    add(entry.peerDependencies, 'peer', (name) => entry.peerDependenciesMeta?.[name]?.optional !== true);
  } else {
    // Root precedence as in npm: optional overrides prod, which overrides dev.
    add(manifest['devDependencies'], 'dev');
    add(manifest['dependencies'], 'prod');
    add(manifest['optionalDependencies'], 'optional');
  }
  return [...edges.values()].sort((left, right) => comparePaths(left.name, right.name));
};

// As npm's dependency flags: a node is `dev` when every path to it crosses a dev edge, and so on.
const applyFlags = (root: TreeNode, nodes: readonly TreeNode[]): Map<TreeNode, Partial<PackageLockEntry>> => {
  type Reach = { withoutDev: boolean; withoutOptional: boolean; withoutPeer: boolean; prod: boolean };
  const reach = new Map<TreeNode, Reach>([
    [root, { withoutDev: true, withoutOptional: true, withoutPeer: true, prod: true }],
  ]);
  const pending = [root];
  while (pending.length > 0) {
    const from = pending.pop();
    const source = from === undefined ? undefined : reach.get(from);
    if (from === undefined || source === undefined) {
      continue;
    }
    for (const edge of from.edges) {
      if (edge.to === undefined) {
        continue;
      }
      const target = reach.get(edge.to) ?? {
        withoutDev: false,
        withoutOptional: false,
        withoutPeer: false,
        prod: false,
      };
      const next = {
        withoutDev: target.withoutDev || (source.withoutDev && edge.kind !== 'dev'),
        withoutOptional: target.withoutOptional || (source.withoutOptional && edge.kind !== 'optional'),
        withoutPeer: target.withoutPeer || (source.withoutPeer && edge.kind !== 'peer'),
        prod: target.prod || (source.prod && (edge.kind === 'prod' || edge.kind === 'peer')),
      };
      const changed =
        !reach.has(edge.to) ||
        next.withoutDev !== target.withoutDev ||
        next.withoutOptional !== target.withoutOptional ||
        next.withoutPeer !== target.withoutPeer ||
        next.prod !== target.prod;
      if (changed) {
        reach.set(edge.to, next);
        pending.push(edge.to);
      }
    }
  }
  return new Map(
    nodes.map((node) => {
      const state = reach.get(node);
      const dev = state?.withoutDev === false;
      const optional = state?.withoutOptional === false;
      return [
        node,
        {
          ...(dev ? { dev: true } : {}),
          ...(optional ? { optional: true } : {}),
          ...(state?.prod === false && !dev && !optional ? { devOptional: true } : {}),
          ...(state?.withoutPeer === false ? { peer: true } : {}),
        },
      ];
    }),
  );
};

const rootEntry = (manifest: Readonly<Record<string, unknown>>): PackageLockEntry => {
  const entry: PackageLockEntry = {
    name: typeof manifest['name'] === 'string' ? manifest['name'] : undefined,
    version: typeof manifest['version'] === 'string' ? manifest['version'] : undefined,
    dependencies: nonEmptyRecord(manifest['dependencies']),
    devDependencies: nonEmptyRecord(manifest['devDependencies']),
    optionalDependencies: nonEmptyRecord(manifest['optionalDependencies']),
  };
  return compact(entry);
};

/**
 * Resolve package.json ranges into a complete lockfileVersion 3 tree, placing each package at the shallowest
 * conflict-free `node_modules` level as npm 7+ does. Missing non-optional peers are installed beside their dependent;
 * optional dependencies are recorded with their `os`/`cpu` constraints. Nothing is downloaded or executed.
 * @param input - Manifest, optional previous lock and upgrade names, packument source and cancellation.
 * @returns The lock, or the issues that prevent one; `install-script-skipped` issues are warnings.
 * @public
 */
export const resolveDependencyTree = async (
  input: ResolveDependencyTreeInput,
): Promise<ResolveDependencyTreeResult> => {
  const { manifest, previousLock, signal } = input;
  const registry = input.registry ?? fetchPackument;
  const upgrade = new Set(input.upgrade ?? []);
  const issues: PackageIssue[] = [];
  const seenIssues = new Set<string>();
  const report = (issue: PackageIssue): void => {
    const key = `${issue.code}\0${issue.name ?? ''}\0${issue.path ?? ''}`;
    if (!seenIssues.has(key)) {
      seenIssues.add(key);
      issues.push(issue);
    }
  };

  const previous = new Map<string, Map<string, PackageLockEntry>>();
  for (const [path, entry] of Object.entries(previousLock?.packages ?? {})) {
    if (path === '' || entry.version === undefined || entry.resolved === undefined || entry.integrity === undefined) {
      continue;
    }
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const versions = previous.get(name) ?? new Map<string, PackageLockEntry>();
    versions.set(entry.version, baseEntry(entry));
    previous.set(name, versions);
  }
  const reusable = (edge: Edge, spec: Spec): string | undefined => {
    const versions = previous.get(spec.name);
    if (versions === undefined || upgrade.has(edge.name) || upgrade.has(spec.name)) {
      return undefined;
    }
    const candidates = [...versions.keys()];
    return (
      maxSatisfying(candidates, spec.tag === undefined && spec.range !== '*' ? spec.range : '*', {
        loose: true,
        includePrerelease: spec.tag !== undefined || spec.range === '*',
      }) ?? undefined
    );
  };

  type Lookup = { readonly packument: Packument | undefined } | { readonly error: unknown };
  const load = async (name: string): Promise<Lookup> => {
    try {
      return { packument: await registry(name, signal) };
    } catch (error) {
      return { error };
    }
  };
  // Lookups never reject, so prefetched ones awaited later in deterministic order cannot go unhandled.
  const packuments = new Map<string, Promise<Lookup>>();
  const packument = async (name: string): Promise<Lookup> => {
    const pending = packuments.get(name) ?? load(name);
    packuments.set(name, pending);
    return pending;
  };
  const prefetch = (node: TreeNode): void => {
    for (const edge of node.edges) {
      edge.spec = parseSpec(edge.name, edge.raw);
      if (edge.spec !== undefined && reusable(edge, edge.spec) === undefined) {
        void packument(edge.spec.name);
      }
    }
  };

  const choose = async (edge: Edge, spec: Spec, path: string): Promise<Choice> => {
    const reused = reusable(edge, spec);
    const locked = reused === undefined ? undefined : previous.get(spec.name)?.get(reused);
    if (reused !== undefined && locked !== undefined) {
      return { version: reused, entry: locked };
    }
    const lookup = await packument(spec.name);
    if ('error' in lookup) {
      signal.throwIfAborted();
      const detail = lookup.error instanceof Error ? ` ${lookup.error.message}` : '';
      return {
        issue: {
          code: 'registry-unavailable',
          name: spec.name,
          message: `Could not read registry metadata for '${spec.name}'.${detail} Retry Install when online.`,
        },
      };
    }
    const document = lookup.packument;
    const version = document === undefined ? undefined : pickVersion(document, spec);
    if (document === undefined || version === undefined) {
      return edge.kind === 'optional'
        ? 'skip'
        : {
            issue: {
              code: 'no-matching-version',
              name: spec.name,
              path,
              message: `No published version of '${spec.name}' matches '${edge.raw}'. Change the range in package.json.`,
            },
          };
    }
    const entry = versionEntry(document.versions[version], spec.name, version);
    return entry === undefined
      ? {
          issue: {
            code: 'registry-unavailable',
            name: spec.name,
            message: `Registry metadata for '${spec.name}@${version}' lacks a registry tarball or integrity. Retry Install.`,
          },
        }
      : { version, entry };
  };

  const root: TreeNode = {
    path: '',
    parent: undefined,
    depth: 0,
    children: new Map(),
    realName: '',
    version: '',
    entry: {},
    edges: [],
  };
  root.edges.push(...edgesOf(root, manifest));
  prefetch(root);
  const nodes: TreeNode[] = [];
  const queue: TreeNode[] = [root];

  // Placing at `level` must not change what an already-resolved edge below it sees, unless the new node satisfies it.
  const canPlace = (level: TreeNode, name: string, candidate: Pick<TreeNode, 'realName' | 'version'>): boolean =>
    [root, ...nodes].every(
      (holder) =>
        !isWithin(holder, level) ||
        holder.edges.every((edge) => {
          if (edge.name !== name || edge.to === undefined || edge.spec === undefined) {
            return true;
          }
          const start = edge.kind === 'peer' ? holder.parent : holder;
          const shadowed = isWithin(start, level) && !isWithin(edge.to.parent, level);
          return !shadowed || satisfiesSpec(candidate, edge.spec);
        }),
    );

  while (queue.length > 0) {
    signal.throwIfAborted();
    queue.sort((left, right) => left.depth - right.depth || comparePaths(left.path, right.path));
    const node = queue.shift();
    if (node === undefined) {
      break;
    }
    for (const edge of node.edges) {
      const { spec } = edge;
      if (spec === undefined || !isPackageName(edge.name)) {
        report({
          code: 'unsupported-dependency-protocol',
          name: edge.name,
          ...(node.path === '' ? {} : { path: node.path }),
          message: `'${edge.name}': '${edge.raw}' is not a registry range, dist-tag or npm: alias. Tau installs only from the npm registry; replace it with a published version.`,
        });
        continue;
      }
      const start = edge.kind === 'peer' ? node.parent : node;
      if (start === undefined) {
        continue;
      }
      const visible = resolveFrom(start, edge.name);
      if (visible !== undefined && satisfiesSpec(visible, spec)) {
        edge.to = visible;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- breadth-first order makes placement deterministic
      const choice = await choose(edge, spec, node.path);
      if (choice === 'skip') {
        continue;
      }
      if ('issue' in choice) {
        report(choice.issue);
        continue;
      }
      const levels: TreeNode[] = [];
      for (
        let level: TreeNode | undefined = start;
        level !== undefined && level !== visible?.parent;
        level = level.parent
      ) {
        levels.unshift(level);
      }
      const candidate = { realName: spec.name, version: choice.version };
      const level = levels.find((option) => !option.children.has(edge.name) && canPlace(option, edge.name, candidate));
      if (level === undefined) {
        report({
          code: 'peer-conflict',
          name: spec.name,
          path: node.path,
          message: `'${node.realName}@${node.version}' needs '${edge.name}@${edge.raw}', but '${visible?.realName ?? edge.name}@${visible?.version ?? '?'}' is already required beside it. Align the versions in package.json.`,
        });
        continue;
      }
      if (nodes.length >= maximumPackages) {
        throw new Error(`Dependency tree exceeds ${maximumPackages} packages; Tau refuses to resolve it.`);
      }
      const placed: TreeNode = {
        path: childPath(level, edge.name),
        parent: level,
        depth: level.depth + 1,
        children: new Map(),
        realName: spec.name,
        version: choice.version,
        entry: choice.entry,
        edges: [],
      };
      placed.edges.push(...edgesOf(placed, undefined));
      level.children.set(edge.name, placed);
      edge.to = placed;
      nodes.push(placed);
      queue.push(placed);
      prefetch(placed);
    }
  }

  if (issues.length > 0) {
    return { issues };
  }
  const flags = applyFlags(root, nodes);
  const sorted = [...nodes].sort((left, right) => comparePaths(left.path, right.path));
  const packages: Record<string, PackageLockEntry> = { '': rootEntry(manifest) };
  for (const node of sorted) {
    const alias = node.path.slice(node.path.lastIndexOf('node_modules/') + 'node_modules/'.length) !== node.realName;
    packages[node.path] = { ...(alias ? { name: node.realName } : {}), ...node.entry, ...flags.get(node) };
    if (node.entry.hasInstallScript === true) {
      issues.push({
        code: 'install-script-skipped',
        name: node.realName,
        path: node.path,
        message: `'${node.realName}@${node.version}' has an install script; Tau never runs package scripts. Run 'npm rebuild ${node.realName}' outside Tau if it needs one.`,
      });
    }
  }
  const { name, version } = packages[''] ?? {};
  return {
    lock: {
      ...(name === undefined ? {} : { name }),
      ...(version === undefined ? {} : { version }),
      lockfileVersion: 3,
      requires: true,
      packages,
    },
    issues,
  };
};
