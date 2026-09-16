import { useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
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
  const confirmClear = projectId !== undefined && confirmClearProjectId === projectId;
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
    <SettingsSectionCard aria-labelledby='compute-reuse-title'>
      <CardHeader>
        <CardTitle id='compute-reuse-title'>Compute reuse</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <fieldset className='grid gap-2 lg:grid-cols-3'>
          <legend className='sr-only'>Compute reuse mode</legend>
          {modes.map((mode) => (
            <label
              key={mode.value}
              className='flex cursor-action items-start gap-3 rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-accent/50 has-checked:border-primary'
            >
              <input
                className='mt-1 accent-primary'
                type='radio'
                name='compute-reuse-mode'
                value={mode.value}
                checked={selected === mode.value}
                onChange={() => {
                  setComputeReuseMode(mode.value);
                }}
              />
              <span>
                <span className='block text-sm font-medium'>{mode.label}</span>
                <span className='text-xs text-muted-foreground'>{mode.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className='flex flex-wrap items-center gap-2 border-t pt-4'>
          <Button size='sm' variant='outline' disabled={!available} onClick={async () => control('inspect')}>
            Inspect
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!available}
            onClick={async () => control('collect', collectCursor)}
          >
            {collectCursor ? 'Continue collect' : 'Collect'}
          </Button>
          {confirmClear ? (
            <Button
              size='sm'
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
              size='sm'
              variant='outline'
              disabled={!available}
              onClick={() => {
                setConfirmClearProjectId(projectId);
              }}
            >
              Clear
            </Button>
          )}
          {currentStatus ? (
            <p role='status' className='basis-full text-xs text-muted-foreground'>
              {currentStatus}
            </p>
          ) : null}
        </div>
      </CardContent>
    </SettingsSectionCard>
  );
}
