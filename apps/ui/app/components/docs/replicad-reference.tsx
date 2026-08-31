'use client';

import { useEffect, useMemo, useState } from 'react';
import { SharedRendererProvider } from '#components/docs/shared-renderer.js';
import { KernelModelView } from '#components/docs/kernel-model-view.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { Loader } from '#components/ui/loader.js';
import type { BuiltinProjectCardModel } from '#constants/project-examples.js';
import { loadBuiltinProjectFiles, sampleProjects } from '#constants/project-examples.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

const selectedExampleLocators = [
  'replicad.hollow-box',
  'replicad.vase',
  'replicad.birdhouse',
  'replicad.cycloidal-gear',
  'replicad.ibeam',
] as const;

function ExampleCard({ project }: { readonly project: BuiltinProjectCardModel }): React.JSX.Element {
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setCode(undefined);
    setError(undefined);
    const load = async (): Promise<void> => {
      try {
        const files = await loadBuiltinProjectFiles({ project, signal: controller.signal });
        const main = files[project.assets.main.entryPath];
        if (main) {
          setCode(decodeTextFile(main.content));
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setError(error instanceof Error ? error.message : 'Failed to load example');
        }
      }
    };
    // async-iife: bootstrap -- React effects cannot await lazy example assets; cleanup aborts the request.
    void load();
    return () => {
      controller.abort();
    };
  }, [project]);

  return (
    <div className='not-prose overflow-hidden rounded-lg border'>
      <div className='border-b px-4 py-3'>
        <h3 className='text-base font-semibold'>{project.name}</h3>
        <p className='mt-1 text-sm text-muted-foreground'>{project.description}</p>
      </div>
      {error ? (
        <div className='flex h-[400px] items-center justify-center px-6 text-sm text-destructive'>{error}</div>
      ) : code ? (
        <div className='grid grid-cols-1 md:grid-cols-2'>
          <div className='max-h-[500px] overflow-auto border-r border-b-0 md:border-b-0'>
            <div className='p-3'>
              <CodeViewer text={code} language='typescript' />
            </div>
          </div>
          <div className='h-[400px] md:h-auto md:min-h-[400px]'>
            <KernelModelView code={code} />
          </div>
        </div>
      ) : (
        <div className='flex h-[400px] items-center justify-center'>
          <Loader className='size-8' />
        </div>
      )}
    </div>
  );
}

/**
 * Interactive reference page showing Replicad examples with code and live 3D views.
 * Each example gets its own runtime client, and all views share a single WebGL context
 * via SharedRendererProvider.
 */
export function ReplicadReference(): React.JSX.Element {
  const examples = useMemo(
    () =>
      selectedExampleLocators
        .map((locator) => sampleProjects.find((project) => project.locator === locator))
        .filter((project): project is BuiltinProjectCardModel => project !== undefined),
    [],
  );

  return (
    <ClientOnly>
      <SharedRendererProvider>
        <div className='flex flex-col gap-6'>
          {examples.map((example) => (
            <ExampleCard key={example.id} project={example} />
          ))}
        </div>
      </SharedRendererProvider>
    </ClientOnly>
  );
}
