import { jscadExamples, mockProjects, openscadExamples, thumbnailAssets } from '@taucad/tau-examples';
import type { ThumbnailAssetKey } from '@taucad/tau-examples';
import type { KernelProvider } from '@taucad/runtime';
import { encodeTextFile } from '#utils/filesystem.utils.js';

// Sample data
type Model = {
  id: string;
  name: string;
  code: string;
  thumbnail: string;
  language: KernelProvider;
};

type Files = Record<string, { content: Uint8Array<ArrayBuffer> }>;

export type ProjectsWithFiles = Project & { files: Files };

const createProject = (model: Omit<Model, 'language'>, mainFile: string, kernel: KernelProvider): ProjectsWithFiles => {
  return {
    id: model.id,
    assets: {
      mechanical: {
        main: mainFile,
        parameters: {},
      },
    },
    name: model.name,
    description: `A 3D ${model.name} model built with ${kernel}`,
    author: {
      name: 'Tau Team',
      avatar: '/avatar-sample.png',
    },
    createdAt: 1_740_702_000_000,
    updatedAt: 1_740_702_000_000,
    tags: ['3d-printing', 'parametric', kernel],
    thumbnail: model.thumbnail,
    files: { [mainFile]: { content: encodeTextFile(model.code) } },
  };
};

export const replicadProjects: ProjectsWithFiles[] = mockProjects.map((model) => {
  const mainFile = 'main.ts';
  const language = 'replicad';
  return createProject(model, mainFile, language);
});

export const openscadProjects: ProjectsWithFiles[] = openscadExamples.map((model) => {
  const mainFile = 'main.scad';
  const kernel: KernelProvider = 'openrscad';
  return createProject(model, mainFile, kernel);
});

const jscadProjects: ProjectsWithFiles[] = jscadExamples.map((model) => {
  const mainFile = 'main.ts';
  const language: KernelProvider = 'jscad';
  return createProject(model, mainFile, language);
});

export const sampleProjects: ProjectsWithFiles[] = [...replicadProjects, ...openscadProjects, ...jscadProjects];
