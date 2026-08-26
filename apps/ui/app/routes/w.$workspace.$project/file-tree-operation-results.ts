export type FileTreeOperationResult =
  | { readonly type: 'success'; readonly message: string; readonly description?: string }
  | { readonly type: 'partial-success'; readonly message: string; readonly description?: string }
  | { readonly type: 'no-op'; readonly message: string; readonly description?: string }
  | { readonly type: 'cancelled'; readonly message?: string; readonly description?: string }
  | { readonly type: 'unsupported'; readonly message: string; readonly description?: string }
  | { readonly type: 'failed'; readonly message: string; readonly description?: string };

export type FileTreeImportSummary = {
  readonly uploadedFiles: number;
  readonly createdDirectories: number;
  readonly failures: readonly string[];
};

export function summarizeFileTreeImport(summary: FileTreeImportSummary): {
  readonly success: FileTreeOperationResult | undefined;
  readonly failure: FileTreeOperationResult | undefined;
} {
  const importedItems = summary.uploadedFiles + summary.createdDirectories;
  const success: FileTreeOperationResult | undefined =
    importedItems > 0
      ? {
          type: summary.failures.length > 0 ? 'partial-success' : 'success',
          message: formatImportSuccessMessage(summary.uploadedFiles, summary.createdDirectories),
        }
      : undefined;

  const failure: FileTreeOperationResult | undefined =
    summary.failures.length > 0
      ? {
          type: importedItems > 0 ? 'partial-success' : 'failed',
          message:
            summary.failures.length === 1
              ? '1 item failed to import'
              : `${summary.failures.length} items failed to import`,
          description: summary.failures.slice(0, 3).join('\n'),
        }
      : undefined;

  return { success, failure };
}

function formatImportSuccessMessage(uploadedFiles: number, createdDirectories: number): string {
  if (uploadedFiles > 0 && createdDirectories > 0) {
    return `Imported ${uploadedFiles} ${pluralize('file', uploadedFiles)} and ${createdDirectories} ${pluralize(
      'folder',
      createdDirectories,
    )}`;
  }

  if (uploadedFiles > 0) {
    return uploadedFiles === 1 ? 'Uploaded 1 file' : `Uploaded ${uploadedFiles} files`;
  }

  return createdDirectories === 1 ? 'Created 1 folder' : `Created ${createdDirectories} folders`;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

export async function copyTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = getNavigatorClipboard(),
): Promise<FileTreeOperationResult> {
  if (clipboard === undefined) {
    return {
      type: 'failed',
      message: 'Clipboard is unavailable.',
    };
  }

  try {
    await clipboard.writeText(text);
    return {
      type: 'success',
      message: 'Path copied to clipboard',
    };
  } catch (error) {
    return {
      type: 'failed',
      message: 'Failed to copy path',
      description: error instanceof Error ? error.message : String(error),
    };
  }
}

function getNavigatorClipboard(): Pick<Clipboard, 'writeText'> | undefined {
  if (!('navigator' in globalThis)) {
    return undefined;
  }

  return (globalThis.navigator as Navigator & { readonly clipboard?: Pick<Clipboard, 'writeText'> }).clipboard;
}
