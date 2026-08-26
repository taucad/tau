import type { ActorRefFrom } from 'xstate';
import { Badge } from '#components/ui/badge.js';
import { Separator } from '#components/ui/separator.js';
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
        <h3 className='mb-3 text-sm font-semibold'>About</h3>
        <p className='text-sm text-muted-foreground'>{project.description || 'No description provided'}</p>
      </div>

      <Separator />

      {/* Tags */}
      {project.tags.length > 0 ? (
        <>
          <div>
            <h3 className='mb-3 text-sm font-semibold'>Tags</h3>
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
        <h3 className='mb-3 text-sm font-semibold'>License</h3>
        <p className='text-sm text-muted-foreground'>MIT</p>
      </div>

      <Separator />

      {/* Downloads */}
      <div>
        <h3 className='mb-3 text-sm font-semibold'>Downloads</h3>
        {!hasGeometry ? (
          <p className='text-xs text-muted-foreground'>Render the geometry to enable export.</p>
        ) : (
          <ExportSelector cadActor={cadRef} filenameBase={project.name} variant='inline' />
        )}
      </div>

      {isDebugEnabled ? <PreviewDebugPanel cadRef={cadRef} /> : null}
    </div>
  );
}
