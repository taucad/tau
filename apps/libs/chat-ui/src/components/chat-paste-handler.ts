import { isUnknownDeclaredType, readAttachmentFile } from '#utils/attachment-intake.js';
import type { AttachmentIntakeRefusal } from '#utils/attachment-intake.js';

export type ClipboardPasteEvent = {
  readonly clipboardData?: DataTransfer;
  preventDefault(): void;
};

type HandleClipboardImagePasteOptions = {
  readonly event: ClipboardPasteEvent;
  /** Receives each pasted image as a `data:` URL labelled from its bytes, with the file it was read from. */
  readonly onImage: (dataUrl: string, file: File) => void;
  readonly onReadError?: () => void;
  /** A pasted file whose bytes are not an image Tau stores or converts, or that is too large to read. */
  readonly onRefused?: (refusal: AttachmentIntakeRefusal, file: File) => void;
  /**
   * The image formats the host converts (`AttachmentIntakeOptions.transcodeSources`), read once per paste so a host
   * may load them lazily. Without it only stored types are admitted.
   */
  readonly loadTranscodeSources?: () => Promise<readonly string[]>;
};

/**
 * Whether a clipboard file may be an image. Some sources (a file copied in a
 * file manager, some screenshot tools) give no type at all or a generic one
 * (`application/octet-stream`), so such a file is read and its bytes decide.
 */
const mayBeImage = (type: string): boolean => type.startsWith('image/') || isUnknownDeclaredType(type);

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
  loadTranscodeSources,
}: Omit<HandleClipboardImagePasteOptions, 'event'> & { readonly files: readonly File[] }): Promise<void> => {
  const transcodeSources = (await loadTranscodeSources?.()) ?? [];
  for (const file of files) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- preserving clipboard image order is observable UI behavior.
      const intake = await readAttachmentFile(file, { transcodeSources });
      if (intake.outcome === 'refused') {
        onRefused?.(intake, file);
      } else if (typeof intake.source === 'string') {
        onImage(intake.source, file);
      } else {
        // Paste attaches images only; a document pasted as an untyped file is refused like any other.
        onRefused?.({ outcome: 'refused', reason: 'not-an-image' }, file);
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
  loadTranscodeSources,
}: HandleClipboardImagePasteOptions): boolean => {
  const files = getClipboardImageFiles(event.clipboardData);
  if (files.length === 0) {
    return false;
  }

  event.preventDefault();
  void readClipboardImageFiles({ files, onImage, onReadError, onRefused, loadTranscodeSources });
  return true;
};
