import { useSelector } from '@xstate/react';
import { AlertCircle } from 'lucide-react';
import { describeProjectManifestIssue } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { useProject } from '#hooks/use-project.js';

const maxIssueLines = 4;

/**
 * Names what is wrong with `tau.json` while its project is open (blueprint R5).
 *
 * The project keeps working. Tau only refuses to write the manifest, because
 * its view of a degraded file is lossy, until the person repairs it here or
 * fixes the file in the editor.
 */
export function ProjectManifestIssueBanner(): React.JSX.Element | undefined {
  const { projectRef, editorRef, manifestObservationError, retryManifestObservation } = useProject();
  const issue = useSelector(projectRef, (state) => state.context.manifestIssue);
  const isRepairing = useSelector(projectRef, (state) => state.matches({ ready: { storing: 'repairing' } }));
  if (manifestObservationError) {
    return (
      <div
        role='alert'
        className='absolute inset-x-2 bottom-2 z-20 mx-auto flex max-w-lg items-center gap-3 rounded-md border border-warning/40 bg-background p-3 shadow-lg'
      >
        <div className='min-w-0 flex-1 text-sm'>Project updates unavailable: {manifestObservationError}</div>
        <Button size='sm' variant='outline' onClick={retryManifestObservation}>
          Retry
        </Button>
      </div>
    );
  }
  if (!issue) {
    return undefined;
  }

  const lines = [...new Set(describeProjectManifestIssue(issue))];
  // Defaults would erase text a person can still fix, so a syntax error is fixed by hand.
  const canRepair = issue.code !== 'manifest-invalid-json';
  return (
    <div
      role='alert'
      className='absolute inset-x-2 bottom-2 z-20 mx-auto flex max-w-lg items-start gap-3 rounded-md border border-warning/40 bg-background p-3 shadow-lg'
    >
      <AlertCircle className='mt-0.5 size-4 shrink-0 text-warning' />
      <div className='min-w-0 flex-1 text-sm'>
        <div className='font-medium'>tau.json needs attention</div>
        <div className='text-muted-foreground'>
          {canRepair
            ? 'Tau won’t change it until it is repaired. Repair rewrites it from the project details open here.'
            : 'Fix the syntax error in tau.json. Tau won’t change it until then.'}
        </div>
        <ul className='mt-1 space-y-0.5 font-mono text-xs text-muted-foreground'>
          {lines.slice(0, maxIssueLines).map((line) => (
            <li key={line} className='truncate'>
              {line}
            </li>
          ))}
          {lines.length > maxIssueLines ? <li>…and {lines.length - maxIssueLines} more</li> : null}
        </ul>
      </div>
      <div className='flex shrink-0 flex-col gap-2'>
        {canRepair ? (
          <Button
            size='sm'
            variant='outline'
            disabled={isRepairing}
            onClick={() => {
              projectRef.send({ type: 'repairManifest' });
            }}
          >
            Repair
          </Button>
        ) : null}
        <Button
          size='sm'
          variant='ghost'
          onClick={() => {
            editorRef.send({ type: 'openFile', path: 'tau.json', source: 'user' });
          }}
        >
          Open tau.json
        </Button>
      </div>
    </div>
  );
}
