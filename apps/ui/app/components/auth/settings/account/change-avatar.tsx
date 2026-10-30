'use client';

import { fileToBase64 } from '@better-auth-ui/core';
import { useAuth, useSession, useUpdateUser } from '@better-auth-ui/react';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '#components/auth/user/user-avatar.js';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '@taucad/ui/utils/cn';

export type ChangeAvatarProps = {
  className?: string;
};

export function ChangeAvatar({ className }: ChangeAvatarProps): React.JSX.Element {
  const { authClient, localization, avatar } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: updateUser, isPending: updatePending } = useUpdateUser(authClient);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isPending = updatePending || isUploading || isDeleting;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    event.target.value = '';

    setIsUploading(true);

    try {
      const resized = await avatar.resize(file, avatar.size, avatar.extension);

      const image = (await avatar.upload?.(resized)) ?? (await fileToBase64(resized));

      updateUser(
        { image },
        {
          onSuccess: () => toast.success(localization.settings.avatarChangedSuccess),
        },
      );
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    }

    setIsUploading(false);
  }

  async function handleDelete() {
    const currentImage = session?.user.image;

    updateUser(
      { image: null },
      {
        onSuccess: async () => {
          if (currentImage) {
            setIsDeleting(true);
            try {
              await avatar.delete?.(currentImage);
            } finally {
              setIsDeleting(false);
            }
          }

          toast.success(localization.settings.avatarDeletedSuccess);
        },
      },
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input ref={fileInputRef} type='file' accept='image/*' className='hidden' onChange={handleFileChange} />

      <Button
        type='button'
        variant='ghost'
        className='h-auto w-auto rounded-full p-0'
        aria-label={localization.settings.uploadAvatar}
        disabled={isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UserAvatar className='size-9' isPending={isPending} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm' disabled={!session || isPending}>
            {isPending && <Spinner />}

            {localization.settings.changeAvatar}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end' className='min-w-fit'>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className='text-muted-foreground' />

            {localization.settings.uploadAvatar}
          </DropdownMenuItem>

          <DropdownMenuItem variant='destructive' disabled={!session?.user.image} onClick={handleDelete}>
            <Trash2 />

            {localization.settings.deleteAvatar}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
