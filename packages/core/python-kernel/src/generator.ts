/**
 * The pure half of a Python kernel's `tau-plugin.json` generator: the universal `requirements.lock` is compacted into one
 * PEP 751 `pylock.<target>.toml` per target (environment markers evaluated, one wheel chosen per package by wheel-tag
 * priority at lock time), and the manifest and CycloneDX SBOM are rendered from those choices. No function here
 * touches the network or the file system, so every rendering is byte-deterministic for the same inputs.
 */

/**
 * One `name==version` pin of the universal lock, with every wheel and sdist digest uv recorded for it.
 * @public
 */
export type LockPin = {
  readonly name: string;
  readonly version: string;
  /** Lowercase hex sha256 digests. */
  readonly hashes: ReadonlySet<string>;
  readonly marker?: string;
};

/**
 * A target as `python/interpreter.json` declares it.
 * @public
 */
export type TargetConfig = {
  /** Canonical `<os>-<arch>[-<libc>]` key, as the preparation host's `targetKey` spells it. */
  readonly key: string;
  readonly os: 'darwin' | 'linux';
  readonly arch: 'arm64' | 'x64';
  readonly libc?: 'glibc';
  /** The macOS deployment target the wheels are chosen for (the highest macOS version a chosen wheel may require). */
  readonly deploymentTarget?: string;
  /** Highest glibc version a chosen wheel may require. */
  readonly glibcCeiling?: string;
  /** The interpreter archive's own OS or glibc floor. */
  readonly interpreterFloor: string;
  readonly interpreter: {
    readonly asset: string;
    readonly sha256: string;
    readonly byteLength: number;
  };
};

/**
 * One file PyPI serves for a pinned release.
 * @public
 */
export type IndexFile = {
  readonly filename: string;
  readonly url: string;
  /** Lowercase hex sha256, as PyPI's JSON API reports it. */
  readonly sha256: string;
  readonly size: number;
  readonly yanked: boolean;
};

/**
 * The wheel a target installs for one pin.
 * @public
 */
export type SelectedWheel = {
  readonly pin: LockPin;
  readonly file: IndexFile;
  /** Lowest OS (macOS) or glibc (Linux) version the wheel supports; absent for a platform-independent wheel. */
  readonly floor?: string;
};

const cpythonMinor = 13;
/* eslint-disable @typescript-eslint/naming-convention -- PEP 508 fixes the marker variable names. */
const markerEnvironmentBase = {
  implementation_name: 'cpython',
  platform_python_implementation: 'CPython',
  python_version: `3.${String(cpythonMinor)}`,
  os_name: 'posix',
} as const;

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  return 0;
};

/**
 * The greater of two dotted versions.
 * @param left - A dotted version.
 * @param right - A dotted version.
 * @returns The greater one.
 * @public
 */
export const maximumVersion = (left: string, right: string): string =>
  compareVersions(left, right) >= 0 ? left : right;

/**
 * Normalise a distribution name as PEP 503 does.
 * @param name - A distribution name.
 * @returns The lowercase, dash-separated name.
 * @public
 */
export const normalizeName = (name: string): string => name.toLowerCase().replaceAll(/[-_.]+/gu, '-');

/**
 * Parse uv's universal `requirements.lock` (`name==version ; marker` followed by `--hash=sha256:` lines).
 * @param text - The lock file.
 * @returns The pins, in file order.
 * @public
 */
export const parseRequirementsLock = (text: string): LockPin[] => {
  const pins: Array<{ name: string; version: string; hashes: Set<string>; marker?: string }> = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\\$/u, '').trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const hash = /^--hash=sha256:(?<hex>[\da-f]{64})$/u.exec(line);
    if (hash !== null) {
      const current = pins.at(-1);
      if (current === undefined) {
        throw new Error(`requirements.lock: a hash precedes every pin: ${line}`);
      }
      current.hashes.add(hash.groups!['hex']!);
      continue;
    }
    const pin = /^(?<name>[A-Za-z\d][\w.-]*)==(?<version>[^\s;]+)\s*(?:;\s*(?<marker>.+))?$/u.exec(line);
    if (pin === null) {
      throw new Error(`requirements.lock: cannot read the line '${line}'`);
    }
    const { name, version, marker } = pin.groups!;
    pins.push({ name: normalizeName(name!), version: version!, hashes: new Set(), ...(marker ? { marker } : {}) });
  }
  for (const pin of pins) {
    if (pin.hashes.size === 0) {
      throw new Error(
        `requirements.lock: ${pin.name}==${pin.version} has no --hash; regenerate it with uv --generate-hashes`,
      );
    }
  }
  return pins;
};

/**
 * The PEP 508 marker variables of a target's CPython 3.13 interpreter.
 * @param target - A target.
 * @returns Each marker variable's value, such as `sys_platform` → `darwin`.
 * @public
 */
export const markerEnvironment = (target: TargetConfig): Readonly<Record<string, string>> => ({
  ...markerEnvironmentBase,
  sys_platform: target.os,
  platform_system: target.os === 'darwin' ? 'Darwin' : 'Linux',
  platform_machine:
    target.os === 'darwin'
      ? target.arch === 'arm64'
        ? 'arm64'
        : 'x86_64'
      : target.arch === 'arm64'
        ? 'aarch64'
        : 'x86_64',
});
/* eslint-enable @typescript-eslint/naming-convention -- Tau names resume after the marker environment. */

const markerTokens = (marker: string): string[] =>
  [...marker.matchAll(/\s*(?<token>\(|\)|'[^']*'|"[^"]*"|===|==|!=|<=|>=|~=|<|>|not\s+in\b|\w+)/gu)].map((match) =>
    match.groups!['token']!.replaceAll(/\s+/gu, ' '),
  );

/**
 * Evaluate a PEP 508 environment marker against a target's environment. Supports `and`, `or`, parentheses, the
 * comparison operators and `in` / `not in`; version variables compare as dotted versions.
 * @param marker - The marker text after `;`.
 * @param environment - The marker variables.
 * @returns Whether the pin applies.
 * @public
 */
export const evaluateMarker = (marker: string, environment: Readonly<Record<string, string>>): boolean => {
  const tokens = markerTokens(marker);
  if (tokens.join('').replaceAll(' ', '') !== marker.replaceAll(/\s+/gu, '')) {
    throw new Error(`Unsupported environment marker: ${marker}`);
  }
  let position = 0;
  const value = (): { readonly text: string; readonly variable?: string } => {
    const token = tokens[position++];
    if (token === undefined) {
      throw new Error(`Truncated environment marker: ${marker}`);
    }
    if (/^['"]/u.test(token)) {
      return { text: token.slice(1, -1) };
    }
    const text = environment[token];
    if (text === undefined) {
      throw new Error(`Unknown marker variable '${token}' in: ${marker}`);
    }
    return { text, variable: token };
  };
  const comparison = (): boolean => {
    if (tokens[position] === '(') {
      position += 1;
      const result = disjunction();
      if (tokens[position++] !== ')') {
        throw new Error(`Unbalanced parentheses in marker: ${marker}`);
      }
      return result;
    }
    const left = value();
    const operator = tokens[position++];
    const right = value();
    const versioned = [left.variable, right.variable].some((name) => name?.startsWith('python_') === true);
    switch (operator) {
      case '==':
      case '===': {
        return versioned ? compareVersions(left.text, right.text) === 0 : left.text === right.text;
      }
      case '!=': {
        return versioned ? compareVersions(left.text, right.text) !== 0 : left.text !== right.text;
      }
      case '<': {
        return compareVersions(left.text, right.text) < 0;
      }
      case '<=': {
        return compareVersions(left.text, right.text) <= 0;
      }
      case '>': {
        return compareVersions(left.text, right.text) > 0;
      }
      case '>=': {
        return compareVersions(left.text, right.text) >= 0;
      }
      case 'in': {
        return right.text.includes(left.text);
      }
      case 'not in': {
        return !right.text.includes(left.text);
      }
      default: {
        throw new Error(`Unsupported marker operator '${String(operator)}' in: ${marker}`);
      }
    }
  };
  const conjunction = (): boolean => {
    let result = comparison();
    while (tokens[position] === 'and') {
      position += 1;
      result = comparison() && result;
    }
    return result;
  };
  const disjunction = (): boolean => {
    let result = conjunction();
    while (tokens[position] === 'or') {
      position += 1;
      result = conjunction() || result;
    }
    return result;
  };
  const result = disjunction();
  if (position !== tokens.length) {
    throw new Error(`Trailing tokens in marker: ${marker}`);
  }
  return result;
};

const macosBinaryFormats = (major: number, minor: number, arch: string): string[] => {
  if (arch === 'x86_64') {
    if (major === 10 && minor < 4) {
      return [];
    }
    return ['x86_64', 'intel', 'fat64', 'fat32', 'universal2', 'universal'];
  }
  return ['arm64', 'universal2'];
};

/**
 * The platform tags a target accepts, best first, as `packaging.tags` orders them for a host at the target's
 * deployment target (macOS) or glibc ceiling (Linux).
 * @param target - A target.
 * @returns Platform tags such as `macosx_12_0_arm64` or `manylinux_2_31_x86_64`, best first.
 * @public
 */
export const platformTags = (target: TargetConfig): string[] => {
  if (target.os === 'darwin') {
    const arch = target.arch === 'arm64' ? 'arm64' : 'x86_64';
    const [major] = (target.deploymentTarget ?? '11.0').split('.').map(Number) as [number];
    if (major < 11) {
      throw new Error(`${target.key}: a deployment target below macOS 11 is not supported`);
    }
    const tags: string[] = [];
    for (let version = major; version >= 11; version -= 1) {
      tags.push(...macosBinaryFormats(version, 0, arch).map((format) => `macosx_${String(version)}_0_${format}`));
    }
    for (let minor = 16; minor >= 4; minor -= 1) {
      tags.push(
        ...(arch === 'x86_64' ? macosBinaryFormats(10, minor, arch) : ['universal2']).map(
          (format) => `macosx_10_${String(minor)}_${format}`,
        ),
      );
    }
    return tags;
  }
  const arch = target.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const [, ceiling] = (target.glibcCeiling ?? '2.17').split('.').map(Number) as [number, number];
  const lowest = arch === 'x86_64' ? 5 : 17;
  const legacy: Readonly<Record<number, string>> =
    arch === 'x86_64' ? { 17: 'manylinux2014', 12: 'manylinux2010', 5: 'manylinux1' } : { 17: 'manylinux2014' };
  const tags: string[] = [];
  for (let minor = ceiling; minor >= lowest; minor -= 1) {
    tags.push(`manylinux_2_${String(minor)}_${arch}`);
    const alias = legacy[minor];
    if (alias !== undefined) {
      tags.push(`${alias}_${arch}`);
    }
  }
  return tags;
};

/**
 * Every `python-abi-platform` tag a CPython 3.13 interpreter on the target accepts, best first (PEP 425 order as
 * `packaging.tags.sys_tags` yields it).
 * @param target - A target.
 * @returns Tags such as `cp313-cp313-macosx_12_0_arm64`, best first.
 * @public
 */
export const supportedTags = (target: TargetConfig): string[] => {
  const platforms = platformTags(target);
  const interpreter = `cp3${String(cpythonMinor)}`;
  const tags: string[] = [];
  tags.push(...platforms.map((platform) => `${interpreter}-${interpreter}-${platform}`));
  tags.push(...platforms.map((platform) => `${interpreter}-abi3-${platform}`));
  tags.push(...platforms.map((platform) => `${interpreter}-none-${platform}`));
  for (let minor = cpythonMinor - 1; minor >= 2; minor -= 1) {
    tags.push(...platforms.map((platform) => `cp3${String(minor)}-abi3-${platform}`));
  }
  const pythons = [`py3${String(cpythonMinor)}`, 'py3'];
  for (let minor = cpythonMinor - 1; minor >= 0; minor -= 1) {
    pythons.push(`py3${String(minor)}`);
  }
  for (const python of pythons) {
    tags.push(...platforms.map((platform) => `${python}-none-${platform}`));
  }
  tags.push(`${interpreter}-none-any`);
  tags.push(...pythons.map((python) => `${python}-none-any`));
  return tags;
};

/**
 * The tags a wheel's file name declares, with compressed tag sets (`a.b`) expanded.
 * @param filename - A `.whl` file name.
 * @returns The expanded `python-abi-platform` tags.
 * @public
 */
export const wheelTags = (filename: string): string[] => {
  const parts = filename.replace(/\.whl$/u, '').split('-');
  if (!filename.endsWith('.whl') || (parts.length !== 5 && parts.length !== 6)) {
    throw new Error(`'${filename}' is not a wheel file name`);
  }
  const [pythons, abis, platforms] = parts.slice(-3).map((part) => part.split('.')) as [string[], string[], string[]];
  return pythons.flatMap((python) =>
    abis.flatMap((abi) => platforms.map((platform) => `${python}-${abi}-${platform}`)),
  );
};

// The OS or glibc version a platform tag requires, or undefined for `any`.
const platformFloor = (platform: string): string | undefined => {
  const mac = /^macosx_(?<major>\d+)_(?<minor>\d+)_/u.exec(platform);
  if (mac !== null) {
    return `${mac.groups!['major']!}.${mac.groups!['minor']!}`;
  }
  const many = /^manylinux_(?<major>\d+)_(?<minor>\d+)_/u.exec(platform);
  if (many !== null) {
    return `${many.groups!['major']!}.${many.groups!['minor']!}`;
  }
  const legacy: Readonly<Record<string, string>> = { manylinux2014: '2.17', manylinux2010: '2.12', manylinux1: '2.5' };
  const alias = /^(?<alias>manylinux\d+)_/u.exec(platform)?.groups?.['alias'];
  return alias === undefined ? undefined : legacy[alias];
};

/**
 * Choose the wheel a target installs for one pin: among the files whose digest the lock pins and PyPI does not mark
 * yanked, the one whose best tag ranks highest for the target. The choice is made here, at lock time, never at run
 * time (I8).
 * @param pin - One `name==version` line of the universal lock, with the digests it allows.
 * @param files - Every file PyPI serves for the pin's release.
 * @param target - The interpreter target the wheel must install on.
 * @returns The selected wheel and its floor.
 * @throws {Error} When no pinned wheel fits the target, or a pinned file is yanked.
 * @public
 */
export const selectWheel = (pin: LockPin, files: readonly IndexFile[], target: TargetConfig): SelectedWheel => {
  const supported = supportedTags(target);
  const rank = new Map(supported.map((tag, index) => [tag, index]));
  let best: { readonly file: IndexFile; readonly rank: number; readonly tags: readonly string[] } | undefined;
  for (const file of files) {
    if (!file.filename.endsWith('.whl') || !pin.hashes.has(file.sha256)) {
      continue;
    }
    if (file.yanked) {
      throw new Error(`${file.filename} (${pin.name}==${pin.version}) is yanked on PyPI; bump the pin`);
    }
    const tags = wheelTags(file.filename).filter((tag) => rank.has(tag));
    const fileRank = Math.min(...tags.map((tag) => rank.get(tag)!));
    if (
      tags.length > 0 &&
      (best === undefined || fileRank < best.rank || (fileRank === best.rank && file.filename < best.file.filename))
    ) {
      best = { file, rank: fileRank, tags };
    }
  }
  if (best === undefined) {
    throw new Error(
      `${pin.name}==${pin.version} has no pinned wheel for ${target.key} (accepted platforms start ${supported[0]!})`,
    );
  }
  const floors = best.tags
    .map((tag) => platformFloor(tag.split('-')[2]!))
    .filter((floor): floor is string => floor !== undefined);
  // A multi-platform wheel (universal2, or several manylinux tags) installs wherever its lowest tag does.
  let floor: string | undefined;
  for (const candidate of floors) {
    if (floor === undefined || compareVersions(candidate, floor) < 0) {
      floor = candidate;
    }
  }
  return { pin, file: best.file, ...(floor === undefined ? {} : { floor }) };
};

/**
 * Every pin a target installs, in lock order, with its wheel.
 * @param pins - The universal lock.
 * @param index - PyPI's files per `name==version`.
 * @param target - The interpreter target whose markers and tags select the pins and wheels.
 * @returns The compacted selection.
 * @public
 */
export const compactLock = (
  pins: readonly LockPin[],
  index: ReadonlyMap<string, readonly IndexFile[]>,
  target: TargetConfig,
): SelectedWheel[] => {
  const environment = markerEnvironment(target);
  return pins
    .filter((pin) => pin.marker === undefined || evaluateMarker(pin.marker, environment))
    .map((pin) => {
      const files = index.get(`${pin.name}==${pin.version}`);
      if (files === undefined) {
        throw new Error(`No index metadata for ${pin.name}==${pin.version}`);
      }
      return selectWheel(pin, files, target);
    });
};

/**
 * The target's floor: the interpreter's and every chosen wheel's, whichever is highest (D15).
 * @param target - The interpreter target, whose own floor is the lowest the result can be.
 * @param wheels - Its compacted selection.
 * @returns The dotted floor.
 * @public
 */
export const variantFloor = (target: TargetConfig, wheels: readonly SelectedWheel[]): string => {
  let floor = target.interpreterFloor;
  for (const wheel of wheels) {
    if (wheel.floor !== undefined) {
      floor = maximumVersion(floor, wheel.floor);
    }
  }
  return floor;
};

const tomlString = (value: string): string => JSON.stringify(value);

/**
 * Which kernel package a generated file belongs to: its npm name and its Nx project, whose targets regenerate it.
 * @public
 */
export type GeneratedFor = {
  /** The npm package name, such as `@taucad/build123d`. */
  readonly packageName: string;
  /** The Nx project name, such as `build123d`. */
  readonly project: string;
};

/**
 * PEP 751 `pylock.<target>.toml` for one target: one package per pin, one wheel per package.
 * @param target - The interpreter target, whose marker environment the file declares.
 * @param wheels - Its compacted selection.
 * @param owner - The kernel package the file belongs to.
 * @returns The file's text.
 * @public
 */
export const renderPylock = (target: TargetConfig, wheels: readonly SelectedWheel[], owner: GeneratedFor): string => {
  const environment = markerEnvironment(target);
  const lines = [
    `# Generated by \`pnpm nx run ${owner.project}:generate-tau-plugin\` from requirements.lock; do not edit.`,
    `# The wheels ${target.key} installs: environment markers evaluated and one wheel per package chosen at lock time.`,
    'lock-version = "1.0"',
    `environments = [${tomlString(`sys_platform == '${environment['sys_platform']!}' and platform_machine == '${environment['platform_machine']!}' and implementation_name == 'cpython'`)}]`,
    `requires-python = "==3.${String(cpythonMinor)}.*"`,
    `created-by = ${tomlString(`${owner.packageName} tau-plugin generator`)}`,
  ];
  for (const { pin, file } of wheels) {
    lines.push(
      '',
      '[[packages]]',
      `name = ${tomlString(pin.name)}`,
      `version = ${tomlString(pin.version)}`,
      'index = "https://pypi.org/simple"',
      '',
      '[[packages.wheels]]',
      `name = ${tomlString(file.filename)}`,
      `url = ${tomlString(file.url)}`,
      `size = ${String(file.size)}`,
      `hashes = { sha256 = ${tomlString(file.sha256)} }`,
    );
  }
  return `${lines.join('\n')}\n`;
};

/**
 * The wheels a committed `pylock.<target>.toml` names, as `filename → sha256`. Reads only what `renderPylock` writes.
 * @param text - The file's text.
 * @returns Each wheel's URL, SHA-256 and size, keyed by file name.
 * @public
 */
export const readPylockWheels = (
  text: string,
): Map<string, { readonly url: string; readonly sha256: string; readonly size: number }> => {
  const wheels = new Map<string, { readonly url: string; readonly sha256: string; readonly size: number }>();
  for (const block of text.split('[[packages.wheels]]').slice(1)) {
    const name = /^name = "(?<value>[^"]+)"$/mu.exec(block)?.groups?.['value'];
    const url = /^url = "(?<value>[^"]+)"$/mu.exec(block)?.groups?.['value'];
    const size = /^size = (?<value>\d+)$/mu.exec(block)?.groups?.['value'];
    const sha256 = /^hashes = \{ sha256 = "(?<value>[\da-f]{64})" \}$/mu.exec(block)?.groups?.['value'];
    if (name === undefined || url === undefined || size === undefined || sha256 === undefined) {
      throw new Error(`Malformed pylock wheel entry: ${block.trim().split('\n')[0] ?? ''}`);
    }
    wheels.set(name, { url, sha256, size: Number(size) });
  }
  return wheels;
};
