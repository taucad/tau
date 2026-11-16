import { readAttachmentFile } from '#utils/attachment-intake.js';

export type ClipboardPasteEvent = {
  readonly clipboardData?: DataTransfer;
  preventDefault(): void;
};

type HandleClipboardImagePasteOptions = {
  readonly event: ClipboardPasteEvent;
  /** Receives each pasted image as a `data:` URL labelled from its bytes. */
  readonly onImage: (dataUrl: string) => void;
  readonly onReadError?: () => void;
  /** A pasted file whose bytes are not an image Tau stores, or that is too large to read. */
  readonly onRefused?: (reason: 'unsupported' | 'too-large') => void;
};

/**
 * Whether a clipboard file may be an image. Some sources (a file copied in a
 * file manager, some screenshot tools) give no type at all, so an untyped file
 * is read and its bytes decide.
 */
const mayBeImage = (type: string): boolean => type.startsWith('image/') || type === '';

const getImageFilesFromItems = (items: DataTransferItemList | undefined): File[] => {
  if (!items) {
    return [];
  }

  const files: File[] = [];
  for (const item of items) {
    if (item.kind !== 'file' || !mayBeImage(item.type)) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return files;
};

const getImageFilesFromFileList = (fileList: FileList | undefined): File[] => {
  if (!fileList) {
    return [];
  }
  return [...fileList].filter((file) => mayBeImage(file.type));
};

export const getClipboardImageFiles = (clipboardData: DataTransfer | undefined): File[] => {
  if (!clipboardData) {
    return [];
  }

  const itemFiles = getImageFilesFromItems(clipboardData.items);
  const listFiles = getImageFilesFromFileList(clipboardData.files);
  return listFiles.length > itemFiles.length ? listFiles : itemFiles;
};

const readClipboardImageFiles = async ({
  files,
  onImage,
  onReadError,
  onRefused,
}: Omit<HandleClipboardImagePasteOptions, 'event'> & { readonly files: readonly File[] }): Promise<void> => {
  for (const file of files) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- preserving clipboard image order is observable UI behavior.
      const intake = await readAttachmentFile(file);
      if (intake.outcome === 'refused') {
        onRefused?.(intake.reason);
      } else if (typeof intake.source === 'string') {
        onImage(intake.source);
      } else {
        // Paste attaches images only; a document pasted as an untyped file is refused like any other.
        onRefused?.('unsupported');
      }
    } catch {
      onReadError?.();
    }
  }
};

export const handleClipboardImagePaste = ({
  event,
  onImage,
  onReadError,
  onRefused,
}: HandleClipboardImagePasteOptions): boolean => {
  const files = getClipboardImageFiles(event.clipboardData);
  if (files.length === 0) {
    return false;
  }

  event.preventDefault();
  void readClipboardImageFiles({ files, onImage, onReadError, onRefused });
  return true;
};
