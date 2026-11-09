import type { ProjectManifest } from '@taucad/types';

export type ProjectOpenFixtureOptions = {
  readonly totalProjects: 1 | 20 | 64 | 500;
  readonly targetFileCount: 10 | 1000 | 10_000;
  readonly layout: 'shallow' | 'deep';
};

export const projectOpenSeedReceiptKey = 'tau:e2e:project-open-seed';
export const projectOpenTargetEntryPath = 'main.ts';

const targetSource = `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(18, 12, 6);
}
`;
const otherSource = `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(8, 8, 8);
}
`;
const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Parse only the bounded corpus sizes supported by the project-open benchmark. */
export const parseProjectOpenFixtureOptions = (searchParams: URLSearchParams): ProjectOpenFixtureOptions => {
  const totalProjects = searchParams.get('projects');
  const targetFileCount = searchParams.get('files');
  const layout = searchParams.get('layout') ?? 'shallow';
  if (totalProjects !== '1' && totalProjects !== '20' && totalProjects !== '64' && totalProjects !== '500') {
    throw new Error('Project-open fixture projects must be 1, 20, 64, or 500.');
  }
  if (targetFileCount !== '10' && targetFileCount !== '1000' && targetFileCount !== '10000') {
    throw new Error('Project-open fixture files must be 10, 1000, or 10000.');
  }
  if (layout !== 'shallow' && layout !== 'deep') {
    throw new Error('Project-open fixture layout must be shallow or deep.');
  }
  return {
    totalProjects: Number(totalProjects) as ProjectOpenFixtureOptions['totalProjects'],
    targetFileCount: Number(targetFileCount) as ProjectOpenFixtureOptions['targetFileCount'],
    layout,
  };
};

/** The selected producer is byte-for-byte identical at every catalog size. */
export const projectOpenTargetManifest = (): Omit<ProjectManifest, '$schema'> => ({
  name: 'Project Open Target',
  description: 'Deterministic Home project for opening performance measurements.',
  tags: ['e2e', 'project-open'],
  assets: { main: { entryPath: projectOpenTargetEntryPath } },
});

/** Count includes main.ts; only the remaining authored files change with the selected file cohort. */
export const projectOpenTargetFiles = (
  options: Pick<ProjectOpenFixtureOptions, 'targetFileCount' | 'layout'>,
): Record<string, { content: Uint8Array<ArrayBuffer> }> => {
  const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {
    [projectOpenTargetEntryPath]: { content: encode(targetSource) },
  };
  for (let index = 1; index < options.targetFileCount; index += 1) {
    const part = `part-${String(index).padStart(5, '0')}.ts`;
    const path =
      options.layout === 'deep' ? `parts/group-${String(Math.floor(index / 100)).padStart(3, '0')}/${part}` : part;
    files[path] = { content: encode(`export const part = ${String(index)};\n`) };
  }
  return files;
};

export const projectOpenOtherManifest = (index: number): Omit<ProjectManifest, '$schema'> => ({
  name: `Project Open Unrelated ${String(index).padStart(4, '0')}`,
  description: 'Deterministic unrelated Home project for catalog-size measurements.',
  tags: ['e2e', 'project-open'],
  assets: { main: { entryPath: projectOpenTargetEntryPath } },
});

export const projectOpenOtherFiles = (): Record<string, { content: Uint8Array<ArrayBuffer> }> => ({
  [projectOpenTargetEntryPath]: { content: encode(otherSource) },
});

export const projectOpenTargetSourceSha256 = async (): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encode(targetSource));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
