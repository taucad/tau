import { Heading } from '@taucad/ui/components/heading';
import type { ActorRefFrom } from 'xstate';
import { Badge } from '@taucad/ui/components/badge';
import { Separator } from '@taucad/ui/components/separator';
import { ExportSelector } from '#components/files/export-selector.js';
import { useFeature } from '#flags/use-feature.js';
import { PreviewDebugPanel } from '#routes/w.$workspace.$project_.preview/preview-debug-panel.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { PreviewProjectMetadata } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';

type PreviewDetailsProps = {
  readonly project: PreviewProjectMetadata;
  readonly hasGeometry: boolean;
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
};

export function PreviewDetails({ project, hasGeometry, cadRef }: PreviewDetailsProps): React.JSX.Element {
  const isDebugEnabled = useFeature('tauDebug');

  return (
    <div className='space-y-6 p-6'>
      {/* About */}
      <div>
        <Heading level={3} variant='label' className='mb-3'>
          About
        </Heading>
        <p className='text-sm text-muted-foreground'>{project.description || 'No description provided'}</p>
      </div>

      <Separator />

      {/* Tags */}
      {project.tags.length > 0 ? (
        <>
          <div>
            <Heading level={3} variant='label' className='mb-3'>
              Tags
            </Heading>
            <div className='flex flex-wrap gap-2'>
              {project.tags.map((tag) => (
                <Badge key={tag} variant='secondary'>
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <Separator />
        </>
      ) : null}

      {/* License */}
      <div>
        <Heading level={3} variant='label' className='mb-3'>
          License
        </Heading>
        <p className='text-sm text-muted-foreground'>MIT</p>
      </div>

      <Separator />

      {/* Downloads */}
      <div>
        <Heading level={3} variant='label' className='mb-3'>
          Downloads
        </Heading>
        {hasGeometry ? (
          <ExportSelector cadActor={cadRef} filenameBase={project.name} variant='inline' />
        ) : (
          <p className='text-xs text-muted-foreground'>Render the geometry to enable export.</p>
        )}
      </div>

      {isDebugEnabled ? <PreviewDebugPanel cadRef={cadRef} /> : null}
    </div>
  );
}
