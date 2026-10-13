import type { CodeLanguage, ProjectManifest } from '@taucad/types';

export type CreateInitialProjectOptions = {
  projectName: string;
  mainFileName: string;
  emptyCodeContent: Uint8Array<ArrayBuffer>;
  /** The kernel's language (`KernelConfiguration.language`): only a JavaScript or TypeScript project gets `package.json`. */
  language: CodeLanguage;
  /**
   * The npm `dependencies` the project declares: the kernel's own libraries (`getKernelDependencies`), so the folder
   * runs outside Tau with `npm ci` once Install has written the lock.
   */
  dependencies?: Readonly<Record<string, string>>;
};

export type CreateInitialProjectResult = {
  projectData: Omit<ProjectManifest, '$schema' | 'id'>;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
};

/** The JavaScript and TypeScript family: the languages whose projects declare their packages in npm's `package.json`. */
const npmLanguages: ReadonlySet<CodeLanguage> = new Set(['javascript', 'jsx', 'typescript', 'tsx']);

/** Fallback npm package name when the project name has no ASCII letters or digits. */
const fallbackPackageName = 'tau-project';

/** The longest package name npm accepts. */
const maxPackageNameLength = 214;

/**
 * An npm-valid package name for a project: lowercase URL-safe ASCII, accents folded, every other run of characters
 * a single `-`, never starting with `.` or `_`.
 */
function toPackageName(projectName: string): string {
  const slug = projectName
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .slice(0, maxPackageNameLength)
    .replaceAll(/^-+|-+$/g, '');
  return slug || fallbackPackageName;
}

/**
 * The files and manifest of a new project. A JavaScript or TypeScript project also gets a minimal `package.json`: no
 * `package-lock.json` (Install writes it) and no `scripts` (Tau never runs them). Any other language gets no
 * `package.json`, since npm is not its package manager.
 */
export function createInitialProject(options: CreateInitialProjectOptions): CreateInitialProjectResult {
  const { projectName, mainFileName, emptyCodeContent, language, dependencies = {} } = options;

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
  if (npmLanguages.has(language)) {
    // Like npm, the dependency map is saved sorted by name.
    const sortedDependencies = Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right, 'en'));
    const packageJsonText = JSON.stringify(
      {
        name: toPackageName(projectName),
        private: true,
        type: 'module',
        ...(sortedDependencies.length === 0 ? {} : { dependencies: Object.fromEntries(sortedDependencies) }),
      },
      null,
      2,
    );
    files['package.json'] = { content: new TextEncoder().encode(`${packageJsonText}\n`) };
  }

  return { projectData, files };
}
