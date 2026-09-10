import { useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { setComputeReuseMode, useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { desktopProjectRoot } from '#constants/desktop-kernel-options.js';

const modes: ReadonlyArray<{ value: ComputeReuseMode; label: string; description: string }> = [
  { value: 'durable', label: 'Durable', description: 'Reuse results across sessions.' },
  { value: 'memory', label: 'Memory', description: 'Reuse results until this runtime closes.' },
  { value: 'off', label: 'Off', description: 'Do not reuse computed results.' },
];

export function ComputeReuseSettings(): React.JSX.Element {
  const selected = useComputeReuseMode();
  const project = useProject({ enableNoContext: true });
  const fileManager = useOptionalFileManager();
  const [status, setStatus] = useState<{ projectId: string; value: string }>();
  const [collection, setCollection] = useState<{ projectId: string; cursor: string }>();
  const [confirmClearProjectId, setConfirmClearProjectId] = useState<string>();
  const projectId = project?.projectId;
  const collectCursor = collection && collection.projectId === projectId ? collection.cursor : undefined;
  const currentStatus = status && status.projectId === projectId ? status.value : undefined;
  const confirmClear = confirmClearProjectId === projectId;
  const available = Boolean(
    project && (desktopBridge() ?? fileManager?.fileManagerRef.getSnapshot().context.computeControl),
  );
  const control = async (action: 'inspect' | 'clear' | 'collect', cursor?: string): Promise<void> => {
    if (!project) {
      return;
    }
    const bridge = desktopBridge();
    const browserControl = fileManager?.fileManagerRef.getSnapshot().context.computeControl;
    if (!bridge && !browserControl) {
      throw new Error('The active project compute authority is unavailable.');
    }
    try {
      const result = bridge
        ? action === 'inspect'
          ? await bridge.compute.inspect(await desktopProjectRoot(project.projectId))
          : action === 'clear'
            ? await bridge.compute.clear(await desktopProjectRoot(project.projectId))
            : await bridge.compute.collect(await desktopProjectRoot(project.projectId), {
                budget: 20,
                ...(cursor ? { cursor } : {}),
              })
        : await browserControl!(
            project.projectId,
            action,
            action === 'collect' ? { budget: 20, ...(cursor ? { cursor } : {}) } : {},
          );
      if (action === 'inspect' && 'entries' in result) {
        setStatus({
          projectId: project.projectId,
          value: `${String(result.entries)} entries, ${String(result.logicalBytes)} bytes retained`,
        });
      } else if (action === 'clear' && 'retained' in result) {
        setStatus({ projectId: project.projectId, value: `Clear complete; ${String(result.retained)} bytes retained` });
        setCollection(undefined);
      } else if ('reclaimed' in result) {
        setCollection(
          result.status === 'incomplete' && result.cursor
            ? { projectId: project.projectId, cursor: result.cursor }
            : undefined,
        );
        setStatus({
          projectId: project.projectId,
          value: `${String(result.reclaimed)} bytes reclaimed; ${result.status === 'incomplete' ? 'more remain' : 'complete'}`,
        });
      }
    } catch (error) {
      setStatus({ projectId: project.projectId, value: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <section className='flex flex-col gap-3' aria-labelledby='compute-reuse-title'>
      <div>
        <h2 id='compute-reuse-title' className='text-lg font-semibold'>
          Compute reuse
        </h2>
        <p className='text-sm text-muted-foreground'>Choose how local CAD work reuses expensive results.</p>
      </div>
      <fieldset className='flex flex-col gap-2'>
        <legend className='sr-only'>Compute reuse mode</legend>
        {modes.map((mode) => (
          <label key={mode.value} className='flex cursor-pointer items-start gap-3 rounded-md border p-3'>
            <input
              className='mt-1'
              type='radio'
              name='compute-reuse-mode'
              value={mode.value}
              checked={selected === mode.value}
              onChange={() => {
                setComputeReuseMode(mode.value);
              }}
            />
            <span>
              <span className='block font-medium'>{mode.label}</span>
              <span className='text-sm text-muted-foreground'>{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className='flex flex-wrap gap-2'>
        <Button variant='outline' disabled={!available} onClick={async () => control('inspect')}>
          Inspect
        </Button>
        <Button variant='outline' disabled={!available} onClick={async () => control('collect', collectCursor)}>
          {collectCursor ? 'Continue collect' : 'Collect'}
        </Button>
        {confirmClear ? (
          <Button
            variant='destructive'
            onClick={async () => {
              setConfirmClearProjectId(undefined);
              return control('clear');
            }}
          >
            Confirm clear
          </Button>
        ) : (
          <Button
            variant='outline'
            disabled={!available}
            onClick={() => {
              setConfirmClearProjectId(projectId);
            }}
          >
            Clear
          </Button>
        )}
      </div>
      {currentStatus ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {currentStatus}
        </p>
      ) : null}
    </section>
  );
}
