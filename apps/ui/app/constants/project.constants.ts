import type { ProjectManifest } from '@taucad/types';

export type CreateInitialProjectOptions = {
  projectName: string;
  mainFileName: string;
  emptyCodeContent: Uint8Array<ArrayBuffer>;
};

export type CreateInitialProjectResult = {
  projectData: Omit<ProjectManifest, '$schema' | 'id'>;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
};

const defaultPackageJsonText = JSON.stringify(
  {
    type: 'module',
  },
  null,
  2,
);

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

  const files = Object.fromEntries([
    [mainFileName, { content: new Uint8Array(emptyCodeContent) }],
    ['package.json', { content: new TextEncoder().encode(defaultPackageJsonText) }],
  ]);

  return { projectData, files };
}
