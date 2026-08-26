import { jscadExamples, mockProjects, openscadExamples, thumbnailAssets } from '@taucad/tau-examples';
import type { ThumbnailAssetKey } from '@taucad/tau-examples';
import type { KernelProvider } from '@taucad/runtime';
import { encodeTextFile } from '#utils/filesystem.utils.js';

type Files = Record<string, { content: Uint8Array<ArrayBuffer> }>;

type ExampleModel = {
  id: string;
  name: string;
  code: string;
  thumbnailKey: ThumbnailAssetKey;
};

/** Purpose-specific metadata for built-in community examples. */
export type ProjectsWithFiles = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: { readonly name: string; readonly avatar: string };
  readonly tags: string[];
  readonly createdAt: number;
  readonly assets: { readonly main: { readonly entryPath: string } };
  readonly files: Files;
  readonly thumbnail: string;
};

const createProject = (model: ExampleModel, mainFile: string, kernel: KernelProvider): ProjectsWithFiles => {
  return {
    id: model.id,
    assets: {
      main: {
        entryPath: mainFile,
      },
    },
    name: model.name,
    description: `A 3D ${model.name} model built with ${kernel}`,
    author: {
      name: 'Tau Team',
      avatar: '/avatar-sample.png',
    },
    createdAt: 1_740_702_000_000,
    tags: ['3d-printing', 'parametric', kernel],
    thumbnail: thumbnailAssets[model.thumbnailKey],
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
  const kernel: KernelProvider = 'openscad';
  return createProject(model, mainFile, kernel);
});

const jscadProjects: ProjectsWithFiles[] = jscadExamples.map((model) => {
  const mainFile = 'main.ts';
  const language: KernelProvider = 'jscad';
  return createProject(model, mainFile, language);
});

export const sampleProjects: ProjectsWithFiles[] = [...replicadProjects, ...openscadProjects, ...jscadProjects];

export const galleryProjects: ProjectsWithFiles[] = sampleProjects;
