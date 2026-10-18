/**
 * The pure half of a Python kernel's project template generator (charter D35, W9): the per-target `pylock.<target>.toml`
 * files the tau-plugin generator wrote are compacted into the one multi-environment PEP 751 `pylock.toml` a new
 * project carries, and its `pyproject.toml` pins the kernel's libraries and constrains every other distribution to
 * the closure, so `uv lock` reproduces the closure's versions instead of resolving new ones. No function here touches
 * the network or the file system.
 */

/**
 * One wheel of a per-target pylock.
 * @public
 */
export type PylockWheel = {
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256: string;
};

/**
 * One package of a per-target pylock: one wheel, chosen at lock time.
 * @public
 */
export type PylockPackage = {
  readonly name: string;
  readonly version: string;
  readonly wheel: PylockWheel;
};

/**
 * One target's pylock: its single environment marker and its packages.
 * @public
 */
export type TargetPylock = {
  readonly environment: string;
  readonly packages: readonly PylockPackage[];
};

/**
 * The kernel a project template belongs to: its npm name, its Nx project and its kernel id.
 * @public
 */
export type ProjectTemplateOwner = {
  /** The npm package name, such as `@taucad/build123d`. */
  readonly packageName: string;
  /** The Nx project name, such as `build123d`, whose `generate-project-template` target writes the template. */
  readonly project: string;
  /** The kernel id, such as `build123d`. */
  readonly kernelId: string;
};

/**
 * The placeholder project name the template carries; project creation replaces it.
 * @public
 */
export const templateProjectName = 'tau-project';

/**
 * Distributions Tau's closure carries only for its own test instrumentation; a project does not need them.
 * @public
 */
export const testOnlyDistributions: ReadonlySet<string> = new Set(['coverage']);

const tomlString = (value: string): string => JSON.stringify(value);

const field = (block: string, key: string): string => {
  const value = new RegExp(`^${key} = (?<value>.+)$`, 'mu').exec(block)?.groups?.['value'];
  if (value === undefined) {
    throw new Error(`Malformed pylock: no ${key} in ${block.trim().split('\n')[0] ?? ''}`);
  }
  return value;
};

const unquote = (value: string): string => JSON.parse(value) as string;

/**
 * Read a per-target pylock as the tau-plugin generator's `renderPylock` writes it.
 * @param text - The file's text.
 * @returns Its environment and packages.
 * @public
 */
export const parseTargetPylock = (text: string): TargetPylock => {
  const environments = /^environments = \[(?<value>"[^"]*")\]$/mu.exec(text)?.groups?.['value'];
  if (environments === undefined) {
    throw new Error('Malformed pylock: expected exactly one environment.');
  }
  const packages = text
    .split('\n[[packages]]\n')
    .slice(1)
    .map((block): PylockPackage => {
      const [packageFields = '', wheelFields = '', extra] = block.split('\n[[packages.wheels]]\n');
      if (extra !== undefined) {
        throw new Error(`Malformed pylock: ${unquote(field(packageFields, 'name'))} has more than one wheel.`);
      }
      const hashes = /^hashes = \{ sha256 = "(?<sha256>[\da-f]{64})" \}$/mu.exec(wheelFields)?.groups?.['sha256'];
      if (hashes === undefined) {
        throw new Error(`Malformed pylock: ${unquote(field(packageFields, 'name'))} has no sha256.`);
      }
      return {
        name: unquote(field(packageFields, 'name')),
        version: unquote(field(packageFields, 'version')),
        wheel: {
          name: unquote(field(wheelFields, 'name')),
          url: unquote(field(wheelFields, 'url')),
          size: Number(field(wheelFields, 'size')),
          sha256: hashes,
        },
      };
    });
  return { environment: unquote(environments), packages };
};

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Compact the per-target pylocks into one PEP 751 lock for every target: a package every target installs carries
 * no marker, any other carries the disjunction of its targets' environments, and each package lists the wheel of
 * every target that installs it. Test-only distributions are left out.
 * @param targets - Each target's pylock, in the order the tau-plugin manifest declares them.
 * @param owner - The kernel package the template belongs to.
 * @returns The compacted `pylock.toml` text.
 * @public
 */
export const renderProjectPylock = (targets: readonly TargetPylock[], owner: ProjectTemplateOwner): string => {
  const merged = new Map<string, { version: string; environments: string[]; wheels: Map<string, PylockWheel> }>();
  for (const { environment, packages } of targets) {
    for (const { name, version, wheel } of packages) {
      if (testOnlyDistributions.has(name)) {
        continue;
      }
      const entry = merged.get(name) ?? { version, environments: [], wheels: new Map<string, PylockWheel>() };
      if (entry.version !== version) {
        throw new Error(`${name} is locked at ${entry.version} and ${version} on different targets.`);
      }
      entry.environments.push(environment);
      entry.wheels.set(wheel.name, wheel);
      merged.set(name, entry);
    }
  }
  const environments = targets.map(({ environment }) => environment);
  const lines = [
    `# The libraries this project runs, locked to the wheels Tau's ${owner.kernelId} kernel runs (PEP 751).`,
    `# Generated by \`pnpm nx run ${owner.project}:generate-project-template\`; install with \`uv pip sync pylock.toml\`.`,
    'lock-version = "1.0"',
    `environments = [${environments.map((environment) => tomlString(environment)).join(', ')}]`,
    'requires-python = "==3.13.*"',
    `created-by = ${tomlString(owner.packageName)}`,
  ];
  for (const [name, { version, environments: installedOn, wheels }] of [...merged].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    lines.push('', '[[packages]]', `name = ${tomlString(name)}`, `version = ${tomlString(version)}`);
    if (installedOn.length !== environments.length) {
      lines.push(`marker = ${tomlString(installedOn.map((environment) => `(${environment})`).join(' or '))}`);
    }
    lines.push('index = "https://pypi.org/simple"');
    for (const wheel of [...wheels.values()].sort((left, right) => compareText(left.name, right.name))) {
      lines.push(
        '',
        '[[packages.wheels]]',
        `name = ${tomlString(wheel.name)}`,
        `url = ${tomlString(wheel.url)}`,
        `size = ${String(wheel.size)}`,
        `hashes = { sha256 = ${tomlString(wheel.sha256)} }`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
};

/**
 * The template `pyproject.toml`: the kernel's libraries as the project's dependencies, the targets the closure
 * exists for as uv's environments, and every closure version as a uv constraint.
 * @param libraries - The kernel's libraries, `name → version`, as a project pins them.
 * @param targets - Each target's pylock.
 * @param owner - The kernel the template belongs to.
 * @returns The file's text.
 * @public
 */
export const renderProjectPyproject = (
  libraries: Readonly<Record<string, string>>,
  targets: readonly TargetPylock[],
  owner: Pick<ProjectTemplateOwner, 'kernelId'>,
): string => {
  const pins = new Map<string, string>();
  for (const { packages } of targets) {
    for (const { name, version } of packages) {
      if (!testOnlyDistributions.has(name)) {
        pins.set(name, version);
      }
    }
  }
  const list = (items: readonly string[]): string[] => items.map((item) => `  ${tomlString(item)},`);
  return `${[
    '# Runs outside Tau with uv: `uv sync --locked`, then `uv run main.py`.',
    `# The dependencies are the libraries Tau's ${owner.kernelId} kernel runs; keep these pins when you edit the list.`,
    '[project]',
    `name = ${tomlString(templateProjectName)}`,
    'version = "0.1.0"',
    'requires-python = "==3.13.*"',
    'dependencies = [',
    ...list(Object.entries(libraries).map(([name, version]) => `${name}==${version}`)),
    ']',
    '',
    `# The platforms and versions of Tau's ${owner.kernelId} runtime, so uv.lock and pylock.toml lock the same wheels' versions.`,
    '[tool.uv]',
    'environments = [',
    ...list(targets.map(({ environment }) => environment)),
    ']',
    'constraint-dependencies = [',
    ...list(
      [...pins].sort(([left], [right]) => compareText(left, right)).map(([name, version]) => `${name}==${version}`),
    ),
    ']',
  ].join('\n')}\n`;
};

/**
 * The `name → version` pairs a uv.lock records, the virtual root project excluded.
 * @param text - A `uv.lock` file as `uv lock` writes it.
 * @returns Each locked distribution's version.
 * @public
 */
export const readUvLockVersions = (text: string): Map<string, string> => {
  const versions = new Map<string, string>();
  for (const block of text.split('\n[[package]]\n').slice(1)) {
    if (/^source = \{ virtual = "\." \}$/mu.test(block)) {
      continue;
    }
    versions.set(unquote(field(block, 'name')), unquote(field(block, 'version')));
  }
  return versions;
};
