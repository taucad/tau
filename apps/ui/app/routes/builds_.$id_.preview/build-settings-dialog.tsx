import { useState, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { Trash2, Settings } from 'lucide-react';
import { useBuild } from '#hooks/use-build.js';
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

export function BuildSettingsDialog(): React.JSX.Element {
  const { buildRef, updateName, updateDescription } = useBuild();
  const build = useSelector(buildRef, (state) => state.context.build);

  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [localName, setLocalName] = useState(build?.name ?? '');
  const [localDescription, setLocalDescription] = useState(build?.description ?? '');

  const handleSave = useCallback(() => {
    if (localName !== build?.name) {
      updateName(localName);
    }

    if (localDescription !== build?.description) {
      updateDescription(localDescription);
    }

    setIsOpen(false);
  }, [localName, localDescription, build, updateName, updateDescription]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    // TODO: Implement delete build functionality
    console.log('Delete build');
    setIsDeleteDialogOpen(false);
    setIsOpen(false);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <DialogTrigger asChild>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon">
              <Settings />
            </Button>
          </TooltipTrigger>
        </DialogTrigger>
        <TooltipContent>Build Settings</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Build Settings</DialogTitle>
          <DialogDescription>Update your build&apos;s details and preferences</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          {/* Build Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="build-name">Build Name</Label>
            <Input
              id="build-name"
              value={localName}
              placeholder="Enter build name"
              onChange={(event) => {
                setLocalName(event.target.value);
              }}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="build-description">Description</Label>
            <Textarea
              id="build-description"
              value={localDescription}
              placeholder="Describe your build..."
              rows={3}
              onChange={(event) => {
                setLocalDescription(event.target.value);
              }}
            />
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className="flex flex-col gap-4 rounded-md border border-destructive/50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
              <p className="text-xs text-muted-foreground">Once deleted, your build cannot be recovered.</p>
            </div>
            <Button variant="destructive" className="w-fit" onClick={handleDeleteClick}>
              <Trash2 className="mr-2 size-4" />
              Delete Build
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
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
            <DialogTitle>Delete Build</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this build? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
