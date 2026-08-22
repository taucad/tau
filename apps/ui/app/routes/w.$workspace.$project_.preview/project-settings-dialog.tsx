import { useState, useCallback } from 'react';
import { Trash2, Settings } from 'lucide-react';
import { usePreviewProject } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Label } from '#components/ui/label.js';
import { Textarea } from '#components/ui/textarea.js';
import { Separator } from '#components/ui/separator.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';

export function ProjectSettingsDialog(): React.JSX.Element {
  const { project, updateName, updateDescription } = usePreviewProject();

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [localName, setLocalName] = useState(project?.name ?? '');
  const [localDescription, setLocalDescription] = useState(project?.description ?? '');

  const handleSave = useCallback(() => {
    if (localName !== project?.name) {
      updateName(localName);
    }

    if (localDescription !== project?.description) {
      updateDescription(localDescription);
    }

    setIsOpen(false);
  }, [localName, localDescription, project, updateName, updateDescription]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  // oxlint-disable-next-line max-nested-callbacks -- dialog form nesting
  const handleDeleteConfirm = useCallback(() => {
    // TODO: Implement delete project functionality
    setIsDeleteDialogOpen(false);
    setIsOpen(false);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <DialogTrigger asChild>
          <TooltipTrigger asChild>
            <Button variant='outline' size='icon'>
              <Settings />
            </Button>
          </TooltipTrigger>
        </DialogTrigger>
        <TooltipContent>Project Settings</TooltipContent>
      </Tooltip>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>Update your project&apos;s details and preferences</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-6 py-4'>
          {/* Project Name */}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='project-name'>Project Name</Label>
            <Input
              id='project-name'
              value={localName}
              placeholder='Enter project name'
              onChange={(event) => {
                setLocalName(event.target.value);
              }}
            />
          </div>

          {/* Description */}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='project-description'>Description</Label>
            <Textarea
              id='project-description'
              value={localDescription}
              placeholder='Describe your project...'
              rows={3}
              onChange={(event) => {
                setLocalDescription(event.target.value);
              }}
            />
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className='flex flex-col gap-4 rounded-md border border-destructive/50 p-4'>
            <div>
              <h4 className='text-sm font-semibold text-destructive'>Danger Zone</h4>
              <p className='text-xs text-muted-foreground'>Once deleted, your project cannot be recovered.</p>
            </div>
            <Button variant='destructive' className='w-fit' onClick={handleDeleteClick}>
              <Trash2 className='mr-2 size-4' />
              Delete Project
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setIsDeleteDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
