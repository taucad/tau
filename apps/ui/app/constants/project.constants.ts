import type { ProjectManifest } from '@taucad/types';
import type { KernelEcosystem } from '@taucad/types/constants';

export type CreateInitialProjectOptions = {
  projectName: string;
  mainFileName: string;
  emptyCodeContent: Uint8Array<ArrayBuffer>;
  /** The kernel's package ecosystem (`KernelConfiguration.ecosystem`): it picks the files the project starts with. */
  ecosystem: KernelEcosystem;
  /**
   * The npm `dependencies` an `npm` project declares: the kernel's own libraries (`getKernelDependencies`), so the
   * folder runs outside Tau with `npm ci` once Install has written the lock.
   */
  dependencies?: Readonly<Record<string, string>>;
  /**
   * The kernel's project template (`getKernelProjectTemplate`), required for `pypi` and `nuget`: the manifest and
   * lock files, pinned to the kernel's own closure, that a project of that kernel starts with.
   */
  template?: Readonly<Record<string, string>>;
};

export type CreateInitialProjectResult = {
  projectData: Omit<ProjectManifest, '$schema' | 'id'>;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
};

/** Fallback npm and Python project name when the project name has no ASCII letters or digits. */
const fallbackPackageName = 'tau-project';

/** Fallback .NET project name, for the same case. */
const fallbackDotnetProjectName = 'TauProject';

/** The longest package name npm accepts. */
const maxPackageNameLength = 214;

/** The project name the Python kernel templates' `pyproject.toml` and `uv.lock` carry until creation names the project. */
const templateProjectName = 'tau-project';

/** Zoo's project file: the settings Zoo's tools read beside `main.kcl`, in the units Tau's KCL template starts in. */
const kclProjectToml = '[settings.modeling]\nbase_unit = "mm"\n';

const encoder = new TextEncoder();

/** The project name's ASCII words: accents folded, every other run of characters a separator. */
const asciiWords = (projectName: string): string[] =>
  projectName
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .split(/[^\dA-Za-z]+/u)
    .filter(Boolean);

/**
 * An npm-valid package name for a project, also a valid normalized Python project name: lowercase URL-safe ASCII,
 * words joined by `-`, never starting with `.` or `_`.
 */
function toPackageName(projectName: string): string {
  const slug = asciiWords(projectName).join('-').toLowerCase().slice(0, maxPackageNameLength).replaceAll(/-+$/gu, '');
  return slug || fallbackPackageName;
}

/** A .NET project name: its words in PascalCase, so the `.csproj`, assembly and root namespace share one identifier. */
function toDotnetProjectName(projectName: string): string {
  const name = asciiWords(projectName)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('')
    .slice(0, maxPackageNameLength);
  if (!name) {
    return fallbackDotnetProjectName;
  }
  return /^\d/u.test(name) ? `Project${name}` : name;
}

/**
 * Read one template file, which the ecosystem requires.
 * @param template - The kernel's project template.
 * @param path - The file's template path.
 * @param ecosystem - The project's ecosystem, for the error.
 * @returns The file's text.
 */
function templateFile(template: CreateInitialProjectOptions['template'], path: string, ecosystem: string): string {
  const text = template?.[path];
  if (text === undefined) {
    throw new Error(`A ${ecosystem} project starts from its kernel's template, which has no ${path}.`);
  }
  return text;
}

/**
 * Give the template's `uv.lock` the project's name, keeping its packages sorted by name as uv writes them.
 * @param lock - The template's `uv.lock`.
 * @param name - The project's normalized Python name.
 * @returns The project's `uv.lock`.
 */
function renameUvLock(lock: string, name: string): string {
  const separator = '\n[[package]]\n';
  const [header = '', ...packages] = lock.split(separator);
  const renamed = packages.map((block) =>
    block.includes('\nsource = { virtual = "." }\n') ? block.replace(/^name = ".*"$/mu, `name = "${name}"`) : block,
  );
  const blockName = (block: string): string => /^name = "(.*)"$/mu.exec(block)?.[1] ?? '';
  renamed.sort((left, right) => (blockName(left) < blockName(right) ? -1 : blockName(left) > blockName(right) ? 1 : 0));
  return [header, ...renamed].join(separator);
}

/**
 * The manifest and lock files a new project of this ecosystem starts with, keyed by project path.
 * @param options - The project's name, ecosystem, npm dependencies and kernel template.
 * @returns The text of each file.
 */
function ecosystemFiles(options: CreateInitialProjectOptions): Record<string, string> {
  const { projectName, ecosystem, dependencies = {}, template } = options;
  switch (ecosystem) {
    case 'npm': {
      // Like npm, the dependency map is saved sorted by name. No package-lock.json (Install writes it) and no scripts
      // (Tau never runs them).
      const sortedDependencies = Object.entries(dependencies).sort(([left], [right]) =>
        left.localeCompare(right, 'en'),
      );
      const packageJson = {
        name: toPackageName(projectName),
        private: true,
        type: 'module',
        ...(sortedDependencies.length === 0 ? {} : { dependencies: Object.fromEntries(sortedDependencies) }),
      };
      return { 'package.json': `${JSON.stringify(packageJson, null, 2)}\n` };
    }

    case 'pypi': {
      const name = toPackageName(projectName);
      const pyproject = templateFile(template, 'pyproject.toml', ecosystem);
      return {
        'pyproject.toml': pyproject.replace(`\nname = "${templateProjectName}"\n`, `\nname = "${name}"\n`),
        'pylock.toml': templateFile(template, 'pylock.toml', ecosystem),
        'uv.lock': renameUvLock(templateFile(template, 'uv.lock', ecosystem), name),
      };
    }

    case 'nuget': {
      return {
        [`${toDotnetProjectName(projectName)}.csproj`]: templateFile(template, 'project.csproj', ecosystem),
        'packages.lock.json': templateFile(template, 'packages.lock.json', ecosystem),
      };
    }

    case 'kcl': {
      return { 'project.toml': kclProjectToml };
    }

    case 'none': {
      return {};
    }
  }
}

/**
 * The files and manifest of a new project: the main file plus the files its ecosystem's own tools read, so the folder
 * runs outside Tau. An `npm` project gets a minimal `package.json`; a `pypi` project the kernel's `pyproject.toml`,
 * `pylock.toml` and `uv.lock`; a `nuget` project a `<Name>.csproj` and its `packages.lock.json`; a `kcl` project Zoo's
 * `project.toml`; a `none` project only its main file.
 */
export function createInitialProject(options: CreateInitialProjectOptions): CreateInitialProjectResult {
  const { projectName, mainFileName, emptyCodeContent } = options;

  const projectData: Omit<ProjectManifest, '$schema' | 'id'> = {
    name: projectName,
    description: '',
    tags: [],
    assets: {
      main: {
        entryPath: mainFileName,
      },
    },
  };

  const files: CreateInitialProjectResult['files'] = { [mainFileName]: { content: new Uint8Array(emptyCodeContent) } };
  for (const [path, text] of Object.entries(ecosystemFiles(options))) {
    files[path] = { content: encoder.encode(text) };
  }

  return { projectData, files };
}
