import { XIcon, Info } from 'lucide-react';
import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { FileSystemBackend } from '@taucad/types';
import { filesystemBackendMeta } from '@taucad/types/constants';
import { backendIcons } from '#components/filesystem/backend-indicator.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { Input } from '#components/ui/input.js';
import { Textarea } from '#components/ui/textarea.js';
import { Tags, TagsTrigger } from '#components/ui/input-tags.js';
import { FileSelector } from '#components/files/file-selector.js';
import { ChatDetailsUsage } from '#routes/projects_.$id/chat-details-usage.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';

const keyCombinationEditor = {
  key: 'i',
  ctrlKey: true,
} as const satisfies KeyCombination;

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
  const meta = filesystemBackendMeta[backendType];
  const Icon = backendIcons[backendType];

  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium text-foreground'>Storage:</label>
      <div className='flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2'>
        <Icon className='size-4 shrink-0 text-muted-foreground' />
        <div className='flex flex-col gap-0.5'>
          <span className='text-sm font-medium'>{meta.label}</span>
          {backendType === 'webaccess' && activeWorkspaceName ? (
            <span className='text-xs text-muted-foreground'>{activeWorkspaceName}</span>
          ) : (
            <span className='text-xs text-muted-foreground'>{meta.description}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Details Trigger Component
export function ChatDetailsTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={Info}
      tooltipContent={
        <div className='flex items-center gap-2'>
          {isOpen ? 'Close' : 'Open'} Details
          <KeyShortcut variant='tooltip'>{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
        </div>
      }
      tooltipSide='left'
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

export function ChatDetails({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const { projectRef, updateName, updateDescription, updateTags } = useProject();

  const projectName = useSelector(projectRef, (state) => state.context.project?.name ?? '');
  const projectDescription = useSelector(projectRef, (state) => state.context.project?.description ?? '');
  const projectTags = useSelector(projectRef, (state) => state.context.project?.tags ?? []);
  const mainFile = useSelector(projectRef, (state) => state.context.project?.assets.mechanical?.main ?? '');
  const { fileManagerRef, activeWorkspaceName } = useFileManager();
  const backendType = useSelector(fileManagerRef, (state) => state.context.backendType);

  const toggleDetails = (): void => {
    setIsExpanded?.((current) => !current);
  };

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
        <FloatingPanelContentBody className='px-3 py-2'>
          <div className='space-y-4'>
            {/* Project Information */}
            <div className='space-y-3'>
              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground' htmlFor='project-name'>
                  Name:
                </label>
                <Input
                  id='project-name'
                  value={projectName}
                  placeholder='Enter your project name...'
                  onChange={(event) => {
                    updateName(event.target.value);
                  }}
                />
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground' htmlFor='project-description'>
                  Description:
                </label>
                <Textarea
                  id='project-description'
                  value={projectDescription}
                  placeholder="Describe what you're building..."
                  className='min-h-20'
                  onChange={(event) => {
                    updateDescription(event.target.value);
                  }}
                />
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Tags:</label>
                <Tags tags={projectTags} onTagsChange={handleTagsChange}>
                  <TagsTrigger placeholder='Add tags...' />
                </Tags>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-foreground'>Main File:</label>
                <FileSelector
                  selectedFile={mainFile}
                  placeholder='Select main file...'
                  title='Select Main File'
                  description='Choose the main file for your project'
                  emptyMessage='No files available'
                  onSelect={handleMainFileChange}
                />
              </div>
            </div>

            {/* Filesystem Info */}
            <FileSystemInfo backendType={backendType} activeWorkspaceName={activeWorkspaceName} />

            {/* Usage Statistics */}
            <ChatDetailsUsage />
          </div>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
