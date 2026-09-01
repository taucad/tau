import { FolderOpen, House, MemoryStick, XIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { FileSystemBackend } from '@taucad/types';
import { projectLocationDescriptor } from '#utils/project-creation-location.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { Input } from '@taucad/ui/components/input';
import { Textarea } from '@taucad/ui/components/textarea';
import { Tags, TagsTrigger } from '#components/ui/input-tags.js';
import { FileSelector } from '#components/files/file-selector.js';
import { ChatDetailsUsage } from '#routes/w.$workspace.$project/chat-details-usage.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useFileManager } from '#hooks/use-file-manager.js';

const keyCombinationEditor = projectWorkspaceKeyCombinations.details;

/**
 * Displays the filesystem backend info for the current project.
 */
function FileSystemInfo({
  backendType,
  activeWorkspaceName,
}: {
  readonly backendType: FileSystemBackend;
  readonly activeWorkspaceName: string | undefined;
}): React.JSX.Element {
  const meta = projectLocationDescriptor(
    backendType === 'webaccess'
      ? { kind: 'workspace', workspaceName: activeWorkspaceName }
      : backendType === 'memory'
        ? { kind: 'temporary' }
        : { kind: 'home' },
  );
  const Icon = backendType === 'webaccess' ? FolderOpen : backendType === 'memory' ? MemoryStick : House;

  return (
    <section aria-label='Storage' className='overflow-hidden rounded-xl border border-border bg-card'>
      <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Storage</h2>
      <div className='flex items-center gap-2 p-3'>
        <Icon className='size-4 shrink-0 text-muted-foreground' />
        <div className='flex flex-col gap-0.5'>
          <span className='text-sm font-medium'>{meta.label}</span>
          <span className='text-xs text-muted-foreground'>{meta.detail}</span>
        </div>
      </div>
    </section>
  );
}

export function DetailsPanelBody({ readOnly = false }: { readonly readOnly?: boolean } = {}): React.JSX.Element {
  const { projectRef, updateName, updateDescription, updateTags } = useProject();

  const projectName = useSelector(projectRef, (state) => state.context.project?.name ?? '');
  const projectDescription = useSelector(projectRef, (state) => state.context.project?.description ?? '');
  const projectTags = useSelector(projectRef, (state) => state.context.project?.tags ?? []);
  const mainFile = useSelector(projectRef, (state) => state.context.project?.assets.main.entryPath ?? '');
  const { fileManagerRef, activeWorkspaceName } = useFileManager();
  const backendType = useSelector(fileManagerRef, (state) => state.context.backendType);

  const handleTagsChange = useCallback(
    (newTags: string[]) => {
      // Deduplicate tags to prevent duplicates from accumulating
      const uniqueTags = [...new Set(newTags)];
      updateTags(uniqueTags);
    },
    [updateTags],
  );

  const handleMainFileChange = useCallback(
    (path: string) => {
      projectRef.send({ type: 'setMainFile', path });
    },
    [projectRef],
  );

  return (
    <div data-slot='details-panel-body' className='size-full min-h-0 overflow-hidden bg-sidebar'>
      <div className='size-full scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        <div className='flex min-h-full flex-col gap-2'>
          <section aria-label='Project' className='overflow-hidden rounded-xl border border-border bg-card'>
            <h2 className='border-b px-3 py-2 text-[13px] font-medium text-foreground'>Project</h2>
            <div className='space-y-3 p-3'>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground' htmlFor='project-name'>
                  Name
                </label>
                <Input
                  id='project-name'
                  value={projectName}
                  disabled={readOnly}
                  placeholder='Enter your project name...'
                  onChange={(event) => {
                    updateName(event.target.value);
                  }}
                />
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground' htmlFor='project-description'>
                  Description
                </label>
                <Textarea
                  id='project-description'
                  value={projectDescription}
                  disabled={readOnly}
                  placeholder="Describe what you're building..."
                  className='min-h-20'
                  onChange={(event) => {
                    updateDescription(event.target.value);
                  }}
                />
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Tags</label>
                {readOnly ? (
                  <p className='text-sm text-muted-foreground'>{projectTags.join(', ') || 'No tags'}</p>
                ) : (
                  <Tags tags={projectTags} onTagsChange={handleTagsChange}>
                    <TagsTrigger placeholder='Add tags...' />
                  </Tags>
                )}
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Main file</label>
                <FileSelector
                  selectedFile={mainFile}
                  placeholder='Select main file...'
                  title='Select Main File'
                  description='Choose the main file for your project'
                  emptyMessage='No files available'
                  isDisabled={readOnly}
                  onSelect={handleMainFileChange}
                />
              </div>
            </div>
          </section>

          <FileSystemInfo backendType={backendType} activeWorkspaceName={activeWorkspaceName} />
          {readOnly ? null : <ChatDetailsUsage />}
        </div>
      </div>
    </div>
  );
}

export function ChatDetails({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const toggleDetails = (): void => {
    setIsExpanded?.((current) => !current);
  };
  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeybinding(keyCombinationEditor, toggleDetails);

  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Details</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Details
                  <KeyShortcut variant='tooltip'>{formattedEditorKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-0'>
          <DetailsPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
