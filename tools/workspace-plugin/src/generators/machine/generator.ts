import { formatFiles, generateFiles, names, readProjectConfiguration } from '@nx/devkit';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type MachineGeneratorSchema = {
  name: string;
  project: string;
  subpath?: string;
};

type PackageManifest = {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  publishConfig?: {
    exports?: Record<string, unknown>;
  };
};

type MachineTarget = {
  fileDirectory: string;
  fileName: string;
  machineName: string;
  className: string;
  propertyName: string;
  projectRoot: string;
  publishable: boolean;
  subpath?: string;
  testImport: string;
  manifest?: PackageManifest;
  manifestPath?: string;
  tsdownPath?: string;
  tsdownSource?: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const directSubpathPattern = /^[\da-z]+(?:-[\da-z]+)*$/;

const readText = (tree: Tree, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (content === null) {
    throw new Error(`Expected ${path} to exist.`);
  }
  return content;
};

const readJson = <T>(tree: Tree, path: string): T => {
  try {
    return JSON.parse(readText(tree, path)) as T;
  } catch (error) {
    throw new Error(`Expected valid JSON at ${path}.`, { cause: error });
  }
};

const hasFiles = (tree: Tree, path: string): boolean => tree.children(path).length > 0;

const resolveLocalMachineDirectory = (tree: Tree, project: ProjectConfiguration): string => {
  const sourceRoot = project.sourceRoot ?? project.root;
  if (project.projectType === 'application' && hasFiles(tree, join(sourceRoot, 'app'))) {
    return join(sourceRoot, 'app/machines');
  }
  return join(sourceRoot, 'src/machines');
};

type TargetIdentity = Pick<MachineTarget, 'className' | 'fileName' | 'machineName' | 'projectRoot' | 'propertyName'>;

const resolveLocalTarget = ({
  tree,
  project,
  identity,
  manifest,
  manifestPath,
  subpath,
}: {
  tree: Tree;
  project: ProjectConfiguration;
  identity: TargetIdentity;
  manifest?: PackageManifest;
  manifestPath: string;
  subpath?: string;
}): MachineTarget => {
  if (subpath !== undefined) {
    throw new Error('--subpath is only supported for publishable package targets.');
  }
  const fileDirectory = resolveLocalMachineDirectory(tree, project);
  const sourcePath = join(fileDirectory, `${identity.fileName}.machine.ts`);
  if (tree.exists(sourcePath)) {
    throw new Error(`Machine already exists: ${sourcePath}.`);
  }
  return {
    ...identity,
    fileDirectory,
    publishable: false,
    testImport: `./${identity.fileName}.machine.js`,
    manifest,
    manifestPath: manifest ? manifestPath : undefined,
  };
};

const resolvePublishableTarget = ({
  tree,
  identity,
  manifest,
  manifestPath,
  projectName,
  subpath,
}: {
  tree: Tree;
  identity: TargetIdentity;
  manifest?: PackageManifest;
  manifestPath: string;
  projectName: string;
  subpath?: string;
}): MachineTarget => {
  if (!subpath || !directSubpathPattern.test(subpath)) {
    throw new Error('Publishable package targets require --subpath as one direct kebab-case segment.');
  }
  if (!manifest?.name || !manifest.exports || !manifest.publishConfig?.exports) {
    throw new Error(`Publishable project ${projectName} has an unsupported package export shape.`);
  }

  const exportKey = `./${subpath}`;
  if (Object.hasOwn(manifest.exports, exportKey) || Object.hasOwn(manifest.publishConfig.exports, exportKey)) {
    throw new Error(`Package subpath already exists: ${manifest.name}/${subpath}.`);
  }

  const fileDirectory = join(identity.projectRoot, 'src');
  const sourcePath = join(fileDirectory, `${identity.fileName}.machine.ts`);
  if (tree.exists(sourcePath)) {
    throw new Error(`Machine already exists: ${sourcePath}.`);
  }

  const tsdownPath = join(identity.projectRoot, 'tsdown.config.ts');
  const tsdownSource = readText(tree, tsdownPath);
  const canonicalEntry = "entry: ['src/index.ts'],";
  if (tsdownSource.split(canonicalEntry).length !== 2) {
    throw new Error(`Expected the canonical single-entry tsdown shape in ${tsdownPath}.`);
  }

  return {
    ...identity,
    fileDirectory,
    publishable: true,
    subpath,
    testImport: `#${identity.fileName}.machine.js`,
    manifest,
    manifestPath,
    tsdownPath,
    tsdownSource,
  };
};

const resolveTarget = (tree: Tree, schema: MachineGeneratorSchema): MachineTarget => {
  const normalized = names(schema.name);
  if (!normalized.fileName || normalized.fileName.includes('/') || normalized.fileName.includes('\\')) {
    throw new Error('Machine name must resolve to one non-empty file name.');
  }

  let project: ProjectConfiguration;
  try {
    project = readProjectConfiguration(tree, schema.project);
  } catch (error) {
    throw new Error(`Unknown Nx project: ${schema.project}.`, { cause: error });
  }

  const projectRoot = project.root;
  const manifestPath = join(projectRoot, 'package.json');
  const manifest = tree.exists(manifestPath) ? readJson<PackageManifest>(tree, manifestPath) : undefined;
  const publishable = project.tags?.includes('type:package') === true || manifest?.private === false;
  const identity: TargetIdentity = {
    fileName: normalized.fileName,
    machineName: `${normalized.propertyName}Machine`,
    className: normalized.className,
    propertyName: normalized.propertyName,
    projectRoot,
  };

  if (!publishable) {
    return resolveLocalTarget({ tree, project, identity, manifest, manifestPath, subpath: schema.subpath });
  }

  return resolvePublishableTarget({
    tree,
    identity,
    manifest,
    manifestPath,
    projectName: schema.project,
    subpath: schema.subpath,
  });
};

const updateManifest = (target: MachineTarget): PackageManifest | undefined => {
  if (!target.manifest) {
    return undefined;
  }

  if (!target.publishable) {
    return {
      ...target.manifest,
      dependencies: {
        ...target.manifest.dependencies,
        xstate: target.manifest.dependencies?.['xstate'] ?? 'catalog:',
      },
    };
  }

  const sourceName = `${target.fileName}.machine`;
  const exportKey = `./${target.subpath}`;
  return {
    ...target.manifest,
    exports: {
      ...target.manifest.exports,
      [exportKey]: `./src/${sourceName}.ts`,
    },
    publishConfig: {
      ...target.manifest.publishConfig,
      exports: {
        ...target.manifest.publishConfig?.exports,
        [exportKey]: {
          types: `./dist/${sourceName}.d.mts`,
          import: `./dist/${sourceName}.mjs`,
          default: `./dist/${sourceName}.mjs`,
        },
      },
    },
    peerDependencies: {
      ...target.manifest.peerDependencies,
      xstate: target.manifest.peerDependencies?.['xstate'] ?? '^5.0.0',
    },
    devDependencies: {
      ...target.manifest.devDependencies,
      xstate: target.manifest.devDependencies?.['xstate'] ?? 'catalog:',
    },
  };
};

/** Add one headless XState machine to an explicit owning project. */
export const machineGenerator = async (tree: Tree, schema: MachineGeneratorSchema): Promise<void> => {
  const target = resolveTarget(tree, schema);
  const manifest = updateManifest(target);

  generateFiles(tree, join(currentDirectory, 'files'), target.fileDirectory, {
    fileName: target.fileName,
    machineName: target.machineName,
    className: target.className,
    propertyName: target.propertyName,
    testImport: target.testImport,
    tmpl: '',
  });

  if (manifest && target.manifestPath) {
    tree.write(target.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (target.publishable && target.tsdownPath && target.tsdownSource) {
    const machineEntry = `entry: ['src/index.ts', 'src/${target.fileName}.machine.ts'],`;
    tree.write(target.tsdownPath, target.tsdownSource.replace("entry: ['src/index.ts'],", machineEntry));
  }

  await formatFiles(tree);
};

export default machineGenerator;
