import { useState } from 'react';
import { useSelector } from '@xstate/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { SettingsGroup, SettingsRow } from '@taucad/settings-ui/components/settings/settings-item';
import { formatBytes } from '@taucad/ui-core/lib/format-bytes';
import { setComputeReuseMode, useComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import type { ComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import { useFocusedProjectSession } from '#routes/w.$workspace.$project/focused-project-view.session.js';
import { desktopBridge } from '@taucad/files-ui/filesystem/desktop-bridge';
import { desktopProjectRoot } from '#constants/desktop-kernel-options.js';
import { Button } from '@taucad/ui/components/button';

const modes: ReadonlyArray<{
  value: ComputeReuseMode;
  label: string;
  description: string;
}> = [
  {
    value: 'durable',
    label: 'On this device',
    description: 'Kept across sessions and restarts',
  },
  // Memory reuse lives in the kernel worker, which a heap recycle or a mode change also restarts.
  {
    value: 'memory',
    label: 'This session',
    description: 'Kept until the project closes or its kernel restarts',
  },
  {
    value: 'off',
    label: 'Off',
    description: 'Every change recomputes from scratch',
  },
];

export function ComputeReuseSettings(): React.JSX.Element {
  const selected = useComputeReuseMode();
  /* Settings is in the shell, outside the focused project's view: it reads the focused session (A11). */
  const project = useFocusedProjectSession();
  const fileManagerRef = project?.fileManagerRef;
  const [status, setStatus] = useState<{ projectId: string; value: string }>();
  const [collection, setCollection] = useState<{
    projectId: string;
    cursor: string;
  }>();
  const [confirmClearProjectId, setConfirmClearProjectId] = useState<string>();
  const projectId = project?.projectId;
  const collectCursor = collection && collection.projectId === projectId ? collection.cursor : undefined;
  const currentStatus = status && status.projectId === projectId ? status.value : undefined;
  const confirmClear = projectId !== undefined && confirmClearProjectId === projectId;
  /* Follow the file manager's control: it arrives when the worker connects and goes when the worker is replaced. */
  const computeControl = useSelector(fileManagerRef, (snapshot) => snapshot?.context.computeControl);
  const available = Boolean(project && (desktopBridge() ?? computeControl));
  const control = async (action: 'inspect' | 'clear' | 'collect', cursor?: string): Promise<void> => {
    if (!project) {
      return;
    }
    const bridge = desktopBridge();
    const browserControl = computeControl;
    try {
      /* The control can go between a render and a click (the worker was replaced): report it in the status. */
      if (!bridge && !browserControl) {
        throw new Error('The active project compute authority is unavailable.');
      }
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
          value: `${formatBytes(result.logicalBytes)} cached`,
        });
      } else if (action === 'clear' && 'retained' in result) {
        setStatus({
          projectId: project.projectId,
          value: `Cleared. ${formatBytes(result.retained)} still in use.`,
        });
        setCollection(undefined);
      } else if ('reclaimed' in result) {
        setCollection(
          result.status === 'incomplete' && result.cursor
            ? { projectId: project.projectId, cursor: result.cursor }
            : undefined,
        );
        setStatus({
          projectId: project.projectId,
          value: `Freed ${formatBytes(result.reclaimed)}${result.status === 'incomplete' ? '. More can be freed.' : '.'}`,
        });
      }
    } catch (error) {
      setStatus({
        projectId: project.projectId,
        value: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <SettingsGroup title='Compute reuse'>
      <SettingsRow
        title='Reuse results'
        description='Skip recomputing CAD work that has not changed'
        info={
          <dl className='space-y-1.5'>
            {modes.map((mode) => (
              <div key={mode.value}>
                <dt className='font-medium'>{mode.label}</dt>
                <dd>{mode.description}</dd>
              </div>
            ))}
          </dl>
        }
        control={
          <Select
            size='md'
            value={selected}
            onValueChange={(value) => {
              setComputeReuseMode(value as ComputeReuseMode);
            }}
          >
            <SelectTrigger aria-label='Reuse results' className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modes.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingsRow
        title='Project cache'
        description={available ? 'Results reused by the open project' : 'Open a project to manage its cache'}
        info={
          <>
            <p>Check size shows how much the open project has cached.</p>
            <p>Free space removes results the project no longer uses.</p>
            <p>Clear removes everything. The next render recomputes it.</p>
          </>
        }
      >
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' disabled={!available} onClick={async () => control('inspect')}>
            Check size
          </Button>
          <Button variant='outline' disabled={!available} onClick={async () => control('collect', collectCursor)}>
            {collectCursor ? 'Free more' : 'Free space'}
          </Button>
          {confirmClear ? (
            <Button
              variant='destructive'
              disabled={!available}
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
          <p role='status' className='text-xs text-muted-foreground'>
            {currentStatus}
          </p>
        ) : null}
      </SettingsRow>
    </SettingsGroup>
  );
}
