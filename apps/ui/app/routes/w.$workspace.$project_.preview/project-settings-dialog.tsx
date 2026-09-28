import { useState, useCallback, useRef } from 'react';
import { Trash2, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';
import { usePreviewProject } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@taucad/ui/components/dialog';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Textarea } from '@taucad/ui/components/textarea';
import { Separator } from '@taucad/ui/components/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@taucad/ui/components/tooltip';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';

export function ProjectSettingsDialog(): React.JSX.Element {
  const { project, updateName, updateDescription } = usePreviewProject();
  const { deleteProject } = useProjects();
  const navigate = useNavigate();
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
    setIsOpen(false);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!project || isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      const trashed = await deleteProject(project.id);
      if (!trashed) {
        toast.error(`Could not move ${project.name} to Trash`);
        return;
      }
      toast.success(`Moved ${project.name} to Trash`);
      setIsDeleteDialogOpen(false);
      await navigate('/projects?trash=1');
    } catch (error) {
      toast.error(`Could not move ${project.name} to Trash`);
      console.error('Error trashing project:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteProject, isDeleting, navigate, project]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <DialogTrigger asChild>
            <TooltipTrigger asChild>
              <Button ref={settingsButtonRef} variant='outline' size='icon' aria-label='Project settings'>
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
                placeholder='Describe your project…'
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
                <p className='text-xs text-muted-foreground'>Move this project to Trash so it can be restored later.</p>
              </div>
              <Button variant='destructive' className='w-fit' disabled={!project} onClick={handleDeleteClick}>
                <Trash2 className='mr-2 size-4' />
                Move to Trash
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
      </Dialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            settingsButtonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Move {project?.name ?? 'this project'} to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              You can restore this project from Trash. Any running agents will be stopped first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant='outline'
              disabled={isDeleting}
              onClick={() => {
                setIsDeleteDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={isDeleting}
              onClick={() => {
                void handleDeleteConfirm();
              }}
            >
              Move to Trash
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
