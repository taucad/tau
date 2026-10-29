import { useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { formatBytes } from '#lib/format-bytes.js';
import { setComputeReuseMode, useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { desktopProjectRoot } from '#constants/desktop-kernel-options.js';

const modes: ReadonlyArray<{
  value: ComputeReuseMode;
  label: string;
  description: string;
}> = [
  {
    value: 'durable',
    label: 'On this device',
    description: 'Kept across sessions and restarts.',
  },
  // Memory reuse lives in the kernel worker, which a heap recycle or a mode change also restarts.
  {
    value: 'memory',
    label: 'This session',
    description: 'Kept until the project closes or its kernel restarts.',
  },
  {
    value: 'off',
    label: 'Off',
    description: 'Every change recomputes from scratch.',
  },
];

export function ComputeReuseSettings(): React.JSX.Element {
  const selected = useComputeReuseMode();
  const project = useProject({ enableNoContext: true });
  const fileManager = useOptionalFileManager();
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
        description='Skip recomputing CAD work that has not changed.'
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
        description={available ? 'Results reused by the open project.' : 'Open a project to manage its cache.'}
        info={
          <>
            <p>Check size shows how much the open project has cached.</p>
            <p>Free space removes results the project no longer uses.</p>
            <p>Clear removes everything. The next render recomputes it.</p>
          </>
        }
      >
        <div className='flex flex-wrap items-center gap-2'>
          <Button size='sm' variant='outline' disabled={!available} onClick={async () => control('inspect')}>
            Check size
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!available}
            onClick={async () => control('collect', collectCursor)}
          >
            {collectCursor ? 'Free more' : 'Free space'}
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
