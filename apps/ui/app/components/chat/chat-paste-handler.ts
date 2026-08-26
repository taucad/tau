export type ClipboardPasteEvent = {
  readonly clipboardData?: DataTransfer;
  preventDefault(): void;
};

type HandleClipboardImagePasteOptions = {
  readonly event: ClipboardPasteEvent;
  readonly onImage: (dataUrl: string) => void;
  readonly onReadError?: () => void;
};

/**
 * Reads a file as a data URL using FileReader.
 * Returns a Promise that resolves with the data URL string.
 */
export const readFileAsDataUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      const result = event.target?.result;
      if (typeof result === 'string' && result !== '') {
        resolve(result);
      } else {
        reject(new Error('Invalid file read result'));
      }
    });

    reader.addEventListener('error', () => {
      reject(new Error('Failed to read file'));
    });

    reader.readAsDataURL(file);
  });
};

const getImageFilesFromItems = (items: DataTransferItemList | undefined): File[] => {
  if (!items) {
    return [];
  }

  const files: File[] = [];
  for (const item of items) {
    if (!item.type.startsWith('image/')) {
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
  return [...fileList].filter((file) => file.type.startsWith('image/'));
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
}: Omit<HandleClipboardImagePasteOptions, 'event'> & { readonly files: readonly File[] }): Promise<void> => {
  for (const file of files) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- preserving clipboard image order is observable UI behavior.
      const dataUrl = await readFileAsDataUrl(file);
      onImage(dataUrl);
    } catch {
      onReadError?.();
    }
  }
};

export const handleClipboardImagePaste = ({
  event,
  onImage,
  onReadError,
}: HandleClipboardImagePasteOptions): boolean => {
  const files = getClipboardImageFiles(event.clipboardData);
  if (files.length === 0) {
    return false;
  }

  event.preventDefault();
  void readClipboardImageFiles({ files, onImage, onReadError });
  return true;
};
