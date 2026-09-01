'use client';

import { fileToBase64 } from '@better-auth-ui/core';
import { useAuth, useSession, useUpdateUser } from '@better-auth-ui/react';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '#components/auth/user/user-avatar.js';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { Field } from '#components/ui/field.js';
import { Label } from '#components/ui/label.js';
import { Spinner } from '#components/ui/spinner.js';

export type ChangeAvatarProps = {
  className?: string;
};

export function ChangeAvatar({ className }: ChangeAvatarProps) {
  const { authClient, localization, avatar } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: updateUser, isPending: updatePending } = useUpdateUser(authClient);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isPending = updatePending || isUploading || isDeleting;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    e.target.value = '';

    setIsUploading(true);

    try {
      const resized = (await avatar.resize?.(file, avatar.size, avatar.extension)) || file;

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
    <Field className={className}>
      <Label>{localization.settings.avatar}</Label>

      <input ref={fileInputRef} type='file' accept='image/*' className='hidden' onChange={handleFileChange} />

      <div className='flex items-center gap-4'>
        <Button
          type='button'
          variant='ghost'
          className='h-auto w-auto rounded-full p-0'
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <UserAvatar className='size-12' isPending={isPending} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary' size='sm' disabled={!session || isPending}>
              {isPending && <Spinner />}

              {localization.settings.changeAvatar}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className='min-w-fit'>
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
    </Field>
  );
}
